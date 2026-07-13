import { z } from 'zod';

import { promptByDomain } from '@/domains/prompts';
import { schemaByDomain } from '@/domains/schemas';

/**
 * Server-side proxy for DeepSeek. The API key lives ONLY here (never in the
 * app bundle). Runs on the Metro dev server in dev and on EAS Hosting
 * (Cloudflare Workers) in production — both expose `process.env`.
 */

// deepseek-chat is deprecated 2026-07-24; v4-flash is the fast non-thinking model.
// Swap to 'deepseek-v4-pro' here if you want higher-quality parsing.
const MODEL = 'deepseek-v4-flash';
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';

const RequestSchema = z.object({
  text: z.string().trim().min(1).max(500),
  domain: z.enum(['food', 'workout']),
  context: z.string().max(120).optional(),
  locale: z.string().max(10).optional(),
});

type Envelope = { ok: true; data: unknown } | { ok: false; error: string };

const json = (body: Envelope, status = 200): Response =>
  Response.json(body, { status });

export async function POST(request: Request): Promise<Response> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    console.error('[enrich] DEEPSEEK_API_KEY is not set');
    return json({ ok: false, error: 'Server not configured' }, 500);
  }

  const parsedInput = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsedInput.success) {
    return json({ ok: false, error: 'Invalid request' }, 400);
  }
  const { text, domain, context, locale } = parsedInput.data;

  const language = locale?.toLowerCase().startsWith('en') ? 'English' : 'Brazilian Portuguese';
  const system = `${promptByDomain[domain]} Write the "label" and "exercise" text in ${language}.`;
  const userContent = context ? `Context: current exercise is "${context}".\nEntry: ${text}` : text;

  try {
    const res = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userContent },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_tokens: 400,
      }),
    });

    if (!res.ok) {
      console.error(`[enrich] DeepSeek responded ${res.status}`);
      return json({ ok: false, error: 'AI service error' });
    }

    const payload = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) return json({ ok: false, error: 'Empty AI response' });

    let raw: unknown;
    try {
      raw = JSON.parse(content);
    } catch {
      return json({ ok: false, error: 'AI returned invalid JSON' });
    }

    // Validate the model output server-side too (defense in depth).
    const parsed = schemaByDomain[domain].safeParse(raw);
    if (!parsed.success) return json({ ok: false, error: 'AI response did not match schema' });

    return json({ ok: true, data: parsed.data });
  } catch (e) {
    console.error('[enrich] request failed', e);
    return json({ ok: false, error: 'Upstream request failed' }, 502);
  }
}
