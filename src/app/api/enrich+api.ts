import { z } from 'zod';

import { MAX_PHOTOS_PER_NOTE } from '@/constants/limits';
import { DeepSeekTransportError, runEnrichEngine } from '@/core/enrich/deepseek';
import {
  resolveProviderCredential,
  type AiProviderId,
  type ProviderCredential,
} from '@/core/enrich/providers';
import { checkRateLimit } from '@/core/enrich/rateLimit';
import { ENRICH_INTENTS } from '@/core/enrich/types';
import { foodSchema } from '@/domains/schemas';

import type { EnrichResponse } from '@/core/enrich/types';

/**
 * Server-side proxy for AI providers, so managed keys live ONLY here (never in
 * the app bundle). Runs on the Metro dev server in dev and on EAS Hosting
 * (Cloudflare Workers) in production - both expose `process.env`.
 *
 * NOTE: this route does not exist in a standalone native build. Clients that
 * bring their own key skip it entirely and call the engine directly - see
 * `src/core/enrich/client.ts`.
 */

const MediaSchema = z.object({
  id: z.string().min(1).max(120),
  kind: z.enum(['foodPhoto', 'menuPhoto']),
  mimeType: z.string().max(64).optional(),
  base64: z.string().min(1).max(2_500_000),
  description: z.string().max(24_000).optional(),
});

/** Bring-your-own-key. Absent means the caller is on the managed key. */
const KeysSchema = z.object({
  chat: z.string().trim().min(1).max(200),
  image: z.string().trim().max(200).optional(),
});

const RequestSchema = z.object({
  text: z.string().trim().min(1).max(3000),
  domain: z.enum(['food', 'workout']),
  keys: KeysSchema.optional(),
  intent: z.enum(ENRICH_INTENTS).default('parse'),
  currentFood: foodSchema.optional(),
  media: z.array(MediaSchema).max(MAX_PHOTOS_PER_NOTE).optional(),
  context: z.string().max(120).optional(),
  userContext: z.string().max(1000).optional(),
  locale: z.string().max(10).optional(),
});

const json = (body: EnrichResponse, status = 200): Response =>
  Response.json(body, { status });

const envKey = (provider: AiProviderId): string | undefined => {
  switch (provider) {
    case 'deepseek':
      return process.env.DEEPSEEK_API_KEY;
    case 'gemini':
      return process.env.GEMINI_API_KEY;
    case 'openai':
      return process.env.OPENAI_API_KEY;
    case 'anthropic':
      return process.env.ANTHROPIC_API_KEY;
  }
};

function managedCredential(providers: AiProviderId[]): ProviderCredential | null {
  for (const provider of providers) {
    const key = envKey(provider)?.trim();
    if (key) return { provider, key };
  }
  return null;
}

export async function POST(request: Request): Promise<Response> {
  const parsedInput = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsedInput.success) {
    return json({ ok: false, error: 'Invalid request' }, 400);
  }
  const { keys, ...input } = parsedInput.data;
  if (input.intent === 'foodEdit' && (input.domain !== 'food' || !input.currentFood)) {
    return json({ ok: false, error: 'Invalid request' }, 400);
  }
  if (input.intent === 'purchase' && input.domain !== 'food') {
    return json({ ok: false, error: 'Invalid request' }, 400);
  }

  // Managed key = we pay, so guard it. On EAS Hosting (Cloudflare)
  // `cf-connecting-ip` is always set by CF and cannot be spoofed by the
  // client; absent means local/dev (not behind CF) — skip.
  if (!keys) {
    const ip = request.headers.get('cf-connecting-ip');
    if (ip) {
      const verdict = checkRateLimit(ip, Date.now());
      if (!verdict.ok) {
        console.warn('[enrich] rate limited', { ip, retryAfterSec: verdict.retryAfterSec });
        return Response.json(
          { ok: false, error: 'Rate limited' },
          { status: 429, headers: { 'Retry-After': String(verdict.retryAfterSec) } },
        );
      }
    }
  }

  const hasMedia = Boolean(input.media?.length);
  const chatCredential = keys
    ? resolveProviderCredential(keys.chat, 'deepseek')
    : managedCredential(['deepseek', 'openai', 'anthropic', 'gemini']);
  const imageCredential = keys
    ? resolveProviderCredential(
        keys.image || keys.chat,
        keys.image ? 'gemini' : (chatCredential?.provider ?? 'deepseek'),
      )
    : hasMedia
      ? managedCredential(['gemini', 'openai', 'anthropic'])
      : chatCredential;

  // A user key never falls back to ours: if they opted out of the managed key,
  // a bad key must fail loudly rather than quietly spend our quota. Managed
  // image calls prefer Gemini, then GPT/Anthropic when those env keys exist.
  if (!chatCredential || !imageCredential) {
    if (!keys) {
      console.error('[enrich] AI provider key is not set', {
        needsVision: hasMedia,
        chatEnv: 'DEEPSEEK_API_KEY | OPENAI_API_KEY | ANTHROPIC_API_KEY | GEMINI_API_KEY',
        visionEnv: 'GEMINI_API_KEY | OPENAI_API_KEY | ANTHROPIC_API_KEY',
      });
    }
    return json({ ok: false, error: 'Server not configured' }, 500);
  }

  try {
    return json(
      await runEnrichEngine(input, {
        chat: chatCredential.key,
        image: imageCredential.key,
        chatProvider: chatCredential.provider,
        imageProvider: imageCredential.provider,
      }),
    );
  } catch (e) {
    console.error('[enrich] request failed', e);
    const status = e instanceof DeepSeekTransportError ? 503 : 502;
    return json({ ok: false, error: 'Upstream request failed' }, status);
  }
}
