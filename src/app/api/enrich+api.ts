import { z } from 'zod';

import { normalizeForEnrich } from '@/core/enrich/normalize';
import { foodEditPrompt, promptByDomain } from '@/domains/prompts';
import { foodEditSchema, foodSchema, schemaByDomain } from '@/domains/schemas';

/**
 * Server-side proxy for DeepSeek. The API key lives ONLY here (never in the
 * app bundle). Runs on the Metro dev server in dev and on EAS Hosting
 * (Cloudflare Workers) in production - both expose `process.env`.
 */

// deepseek-chat is deprecated 2026-07-24; v4-flash is the fast non-thinking model.
// Swap to 'deepseek-v4-pro' here if you want higher-quality parsing.
const MODEL = 'deepseek-v4-flash';
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';

const MediaSchema = z.object({
  id: z.string().min(1).max(120),
  kind: z.enum(['foodPhoto', 'menuPhoto']),
  mimeType: z.string().max(64).optional(),
  base64: z.string().min(1).max(2_500_000),
  description: z.string().max(500).optional(),
});

const RequestSchema = z.object({
  text: z.string().trim().min(1).max(3000),
  domain: z.enum(['food', 'workout']),
  intent: z.enum(['parse', 'foodEdit']).default('parse'),
  currentFood: foodSchema.optional(),
  media: z.array(MediaSchema).max(6).optional(),
  context: z.string().max(120).optional(),
  userContext: z.string().max(1000).optional(),
  locale: z.string().max(10).optional(),
});

const MediaDescriptionsSchema = z.object({
  descriptions: z.array(
    z.object({
      id: z.string().min(1).max(120),
      description: z.string().trim().min(1).max(500),
    }),
  ),
});

type MediaDescription = z.infer<typeof MediaDescriptionsSchema>['descriptions'][number];
type ChatContent =
  | string
  | (
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string } }
    )[];
type ChatMessage = { role: 'system' | 'user'; content: ChatContent };
type Envelope =
  | { ok: true; data: unknown; mediaDescriptions?: MediaDescription[] }
  | { ok: false; error: string };

const json = (body: Envelope, status = 200): Response =>
  Response.json(body, { status });

async function callDeepSeekJson(
  apiKey: string,
  messages: ChatMessage[],
  maxTokens: number,
  logHttpError = true,
): Promise<unknown> {
  const res = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: maxTokens,
    }),
  });

  if (!res.ok) {
    if (logHttpError) console.error(`[enrich] DeepSeek responded ${res.status}`);
    throw new Error('AI service error');
  }

  const payload = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty AI response');

  try {
    return JSON.parse(content);
  } catch {
    throw new Error('AI returned invalid JSON');
  }
}

async function describeFoodMedia(
  apiKey: string,
  media: z.infer<typeof MediaSchema>[] | undefined,
  language: string,
): Promise<MediaDescription[]> {
  if (!media?.length) return [];

  const provided = media.flatMap((item): MediaDescription[] => {
    const description = item.description?.trim();
    return description ? [{ id: item.id, description }] : [];
  });
  const mediaToDescribe = media.filter((item) => !item.description?.trim());
  if (!mediaToDescribe.length) return provided;

  const mediaOrder = mediaToDescribe.map((item, index) => `${index + 1}. ${item.id}`).join('\n');
  const content: ChatContent = [
    {
      type: 'text',
      text: [
        `Describe each food/menu image in ${language}.`,
        'Return ONLY JSON: {"descriptions":[{"id":string,"description":string}]}',
        'Use the exact ids in this order:',
        mediaOrder,
        'Focus on visible foods, drinks, portions, packaging, menu text, quantities, and any nutrition label clues.',
        'If an image is unclear, describe what is visible and say it is uncertain.',
      ].join('\n'),
    },
    ...mediaToDescribe.map((item) => ({
      type: 'image_url' as const,
      image_url: {
        url: `data:${item.mimeType ?? 'image/jpeg'};base64,${item.base64}`,
      },
    })),
  ];

  try {
    const raw = await callDeepSeekJson(
      apiKey,
      [
        {
          role: 'system',
          content:
            'You create concise food image descriptions for a nutrition parser. Respond with JSON only.',
        },
        { role: 'user', content },
      ],
      700,
      false,
    );
    const parsed = MediaDescriptionsSchema.safeParse(raw);
    return parsed.success ? [...provided, ...parsed.data.descriptions] : provided;
  } catch {
    return provided;
  }
}

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
  const { text, domain, intent, currentFood, media, context, userContext, locale } = parsedInput.data;
  if (intent === 'foodEdit' && (domain !== 'food' || !currentFood)) {
    return json({ ok: false, error: 'Invalid request' }, 400);
  }

  const language = locale?.toLowerCase().startsWith('en') ? 'English' : 'Brazilian Portuguese';
  const mediaDescriptions =
    domain === 'food' && intent === 'parse'
      ? await describeFoodMedia(apiKey, media, language)
      : [];
  const mediaContext = mediaDescriptions
    .map((item, index) => `Image ${index + 1} mediaId=${item.id}: ${item.description}`)
    .join('\n');
  const textWithMedia = [text, mediaContext].filter(Boolean).join('\n');
  const normalizedText =
    intent === 'foodEdit' ? text : normalizeForEnrich(textWithMedia, { domain, locale });
  const system = [
    intent === 'foodEdit' ? foodEditPrompt : promptByDomain[domain],
    'Write the "label", "item", "note", "exercise" and "reasoning" text in',
    `${language}.`,
    userContext && domain === 'food'
      ? 'Use the user nutrition context to choose serving assumptions, calories and macros; respect restrictions, diet preferences and notes when relevant.'
      : '',
  ]
    .filter(Boolean)
    .join(' ');
  const entryBlock =
    normalizedText === textWithMedia
      ? `Entry: ${textWithMedia}`
      : `Original entry: ${textWithMedia}\nNormalized arithmetic: ${normalizedText}`;
  const contextBlock = context ? `Context: current exercise is "${context}".\n` : '';
  const userContextBlock =
    userContext && domain === 'food' ? `User nutrition context:\n${userContext}\n\n` : '';
  const currentFoodBlock =
    intent === 'foodEdit' && currentFood
      ? `Current meal JSON:\n${JSON.stringify(currentFood)}\n\n`
      : '';
  const instructionBlock = intent === 'foodEdit' ? `Instruction: ${text}` : entryBlock;
  const userContent = `${contextBlock}${userContextBlock}${currentFoodBlock}${instructionBlock}`;

  try {
    const raw = await callDeepSeekJson(
      apiKey,
      [
        { role: 'system', content: system },
        { role: 'user', content: userContent },
      ],
      intent === 'foodEdit' ? 1400 : 800,
    );

    // Validate the model output server-side too (defense in depth).
    const parsed = (intent === 'foodEdit' ? foodEditSchema : schemaByDomain[domain]).safeParse(raw);
    if (!parsed.success) return json({ ok: false, error: 'AI response did not match schema' });

    return json({ ok: true, data: parsed.data, mediaDescriptions });
  } catch (e) {
    console.error('[enrich] request failed', e);
    return json({ ok: false, error: 'Upstream request failed' }, 502);
  }
}
