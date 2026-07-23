import Constants from 'expo-constants';

import { log } from '@/core/log';
import { useAppStore } from '@/store/useAppStore';

import { DeepSeekTransportError, runEnrichEngine } from './deepseek';

import { ENRICH_UNCONFIGURED } from './types';

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
function apiBase(): string | null {
  const explicit = process.env.EXPO_PUBLIC_API_URL;
  if (explicit) return explicit.replace(/\/+$/, '');
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) return `http://${hostUri.split('/')[0]}`;
  return null;
}

/**
 * Attached here, at the single choke point every caller already goes through,
 * rather than at each call site — there are four of those and forgetting one
 * would silently bill the wrong key.
 */
function activeKeys(): EnrichKeys | undefined {
  const keys = useAppStore.getState().apiKeys;
  if (keys.mode !== 'own') return undefined;
  const chat = keys.chat.trim();
  if (!chat) return undefined;
  const image = keys.image.trim();
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
): Promise<EnrichResponse> {
  const { keys: _ignored, ...input } = req;
  try {
    return await runEnrichEngine(
      { ...input, intent: req.intent ?? 'parse' },
      { chat: keys.chat, image: keys.image || keys.chat },
      signal,
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
  const keys = activeKeys();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  // The whole request in one line: what went out, and — on the returned span —
  // how long it took and whether the model answered or failed.
  const end = log.time('ai', `enrich ${req.domain}/${req.intent ?? 'parse'}`, {
    via: keys ? 'own-key' : 'proxy',
    chars: req.text.length,
    media: req.media?.length ?? 0,
    hasContext: Boolean(req.userContext),
  });
  try {
    const res = keys
      ? await enrichDirect(req, keys, controller.signal)
      : await enrichViaProxy(req, controller.signal);
    end(res.ok ? { ok: true } : { ok: false, error: res.error });
    return res;
  } catch (e) {
    end({ threw: e instanceof Error ? e.message : String(e) });
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
