import { z } from 'zod';

import { MAX_PHOTOS_PER_NOTE } from '@/constants/limits';
import { DeepSeekTransportError, runEnrichEngine } from '@/core/enrich/deepseek';
import { checkRateLimit } from '@/core/enrich/rateLimit';
import { ENRICH_INTENTS } from '@/core/enrich/types';
import { foodSchema } from '@/domains/schemas';

import type { EnrichResponse } from '@/core/enrich/types';

/**
 * Server-side proxy for DeepSeek, so the managed key lives ONLY here (never in
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
  description: z.string().max(500).optional(),
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

  // A user key never falls back to ours: if they opted out of the managed key,
  // a bad key must fail loudly rather than quietly spend our quota. The image
  // key falls back to their chat key, which is the same key for most people.
  const managedKey = process.env.DEEPSEEK_API_KEY;
  const chatKey = keys?.chat ?? managedKey;
  const imageKey = keys ? keys.image || keys.chat : managedKey;
  if (!chatKey || !imageKey) {
    if (!keys) console.error('[enrich] DEEPSEEK_API_KEY is not set');
    return json({ ok: false, error: 'Server not configured' }, 500);
  }

  try {
    return json(await runEnrichEngine(input, { chat: chatKey, image: imageKey }));
  } catch (e) {
    console.error('[enrich] request failed', e);
    const status = e instanceof DeepSeekTransportError ? 503 : 502;
    return json({ ok: false, error: 'Upstream request failed' }, status);
  }
}
