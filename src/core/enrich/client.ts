import Constants from 'expo-constants';

import { log } from '@/core/log';
import { useAppStore } from '@/store/useAppStore';

import { DeepSeekTransportError, runEnrichEngine } from './deepseek';
import { resolveProviderCredential } from './providers';
import { agentJsonTransport, availableAgentTransports } from '@/core/connect/agentTransport';
import { isAgentConnected } from '@/core/connect/agentRPC';

import { ENRICH_TIMEOUT, ENRICH_UNCONFIGURED } from './types';

import type { EnrichKeys, EnrichRequest, EnrichResponse } from './types';

const TIMEOUT_MS = 20_000;

/**
 * One request, one answer.
 *
 * There was an incremental-typing layer here: an XHR that streamed, an SSE
 * accumulator, a partial-JSON repairer and a preview row. It rested on
 * `ReadableStream`, `TextEncoder` and `TextDecoder`, and React Native ships
 * none of the three (grep them under `node_modules/react-native/Libraries` —
 * not one hit). Building the stream threw inside the transport, which every
 * caller reads as the network being down, so every note queued, retried and
 * ended on "try again" for a request that never left the phone. The animation
 * was never worth the note.
 */

/** Thrown for connection failures / timeouts — the command retries these. */
export class NetworkError extends Error {}

/**
 * Resolve the proxy base URL, or null when there is none to resolve.
 *
 * Returning null matters: a standalone build has no Metro dev server and no
 * deployed origin, and the old `http://localhost:8081` fallback turned that
 * configuration gap into a connection error that looked exactly like a flaky
 * network — five silent retries and a "try again" button, in an app that had
 * nowhere to try.
 */
export function apiBase(): string | null {
  const explicit = process.env.EXPO_PUBLIC_API_URL;
  if (explicit) return explicit.replace(/\/+$/, '');
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) return `http://${hostUri.split('/')[0]}`;
  return null;
}

/**
 * Attached here, at the single choke point every caller already goes through,
 * rather than at each call site — there are four of those and forgetting one
 * would silently bill the wrong key.
 */
function activeKeys(hasTextAgent: boolean): EnrichKeys | undefined {
  const keys = useAppStore.getState().apiKeys;
  if (keys.mode === 'managed') return undefined;
  const chat = keys.chat.trim();
  const image = keys.image.trim();
  if (!chat && !(hasTextAgent && image)) return undefined;
  return image ? { chat, image } : { chat };
}

/**
 * Own key: talk to DeepSeek directly. The proxy exists to hide the managed key,
 * which a user-supplied key does not need — and going direct is what makes this
 * work in a standalone build, where no proxy is reachable.
 */
async function enrichDirect(
  req: EnrichRequest,
  keys: EnrichKeys,
  signal: AbortSignal,
  agents: Awaited<ReturnType<typeof availableAgentTransports>>,
): Promise<EnrichResponse> {
  const { keys: _ignored, ...input } = req;
  const chat = resolveProviderCredential(keys.chat, 'deepseek');
  const image = resolveProviderCredential(keys.image || keys.chat, keys.image ? 'gemini' : chat.provider);
  try {
    return await runEnrichEngine(
      { ...input, intent: req.intent ?? 'parse' },
      {
        chat: chat.key,
        image: image.key,
        chatProvider: chat.provider,
        imageProvider: image.provider,
      },
      signal,
      agents,
    );
  } catch (e) {
    if (e instanceof DeepSeekTransportError) throw new NetworkError(e.message);
    if (e instanceof Error && e.name === 'AbortError') throw new NetworkError('timeout');
    // A rejected key or malformed model output will not fix itself on attempt
    // two; only unreachability above is worth the bus retrying.
    return { ok: false, error: e instanceof Error ? e.message : 'enrich failed' };
  }
}

async function enrichViaProxy(
  req: EnrichRequest,
  signal: AbortSignal,
): Promise<EnrichResponse> {
  const base = apiBase();
  if (!base) return { ok: false, error: ENRICH_UNCONFIGURED };

  try {
    const res = await fetch(`${base}/api/enrich`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      signal,
    });
    if (!res.ok) return { ok: false, error: `Server error ${res.status}` };
    return (await res.json()) as EnrichResponse;
  } catch (e) {
    // Every throw here is the proxy being unreachable — retryable, always.
    throw new NetworkError(e instanceof Error ? e.message : 'network failure');
  }
}

export async function enrich(req: EnrichRequest): Promise<EnrichResponse> {
  const agents = await availableAgentTransports();
  const keys = activeKeys(Boolean(agents.text));
  const needsVision = req.domain === 'food' && req.media?.some((media) => !media.description?.trim());
  const agentMode = Boolean(agents.text && (!needsVision || agents.vision)) ||
    ((useAppStore.getState().apiKeys.mode === 'agent' || isAgentConnected()) && !keys);
  if (agentMode && (!agents.text || (needsVision && !agents.vision))) {
    const error = agents.unavailable ?? 'agent.authRequired';
    log.connect('agent.unavailable', { reason: error, needsVision: Boolean(needsVision) });
    return { ok: false, error };
  }
  const usesAgent = agentMode || Boolean(keys && (agents.text || (needsVision && agents.vision)));
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  // Race the whole operation: some native fetch readers never reject on abort.
  const timeout = new Promise<EnrichResponse>((resolve) => {
    timer = setTimeout(() => {
      resolve({ ok: false, error: ENRICH_TIMEOUT });
      controller.abort();
    }, usesAgent ? 180_000 : needsVision ? 60_000 : TIMEOUT_MS);
  });
  // The whole request in one line: what went out, and — on the returned span —
  // how long it took and whether the model answered or failed.
  const end = log.time('ai', `enrich ${req.domain}/${req.intent ?? 'parse'}`, {
    via: agentMode ? 'local-agent' : usesAgent ? 'local-agent+own-key' : keys ? 'own-key' : 'proxy',
    chars: req.text.length,
    media: req.media?.length ?? 0,
    hasContext: Boolean(req.userContext),
  });
  try {
    const operation = agentMode
      ? runEnrichEngine({ ...req, intent: req.intent ?? 'parse' }, { chat: '', image: '', chatProvider: 'gemini', imageProvider: 'gemini' }, controller.signal,
        { text: agents.text ?? agentJsonTransport, vision: agents.vision ?? agentJsonTransport })
        .catch((error) => ({ ok: false as const, error: error instanceof Error && error.message.startsWith('agent.') ? error.message : 'agent.failed' }))
      : keys
      ? enrichDirect(req, keys, controller.signal, agents)
      : enrichViaProxy(req, controller.signal);
    const res = await Promise.race([operation, timeout]);
    end(res.ok ? { ok: true } : { ok: false, error: res.error });
    return res;
  } catch (e) {
    end({ threw: e instanceof Error ? e.message : String(e) });
    throw e;
  } finally {
    clearTimeout(timer!);
  }
}
