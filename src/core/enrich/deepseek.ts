import { normalizeForEnrich } from '@/core/enrich/normalize';
import { foodEditPrompt, promptByDomain } from '@/domains/prompts';
import { foodEditSchema, schemaByDomain } from '@/domains/schemas';
import { z } from 'zod';

import type { EnrichMediaDescription, EnrichMediaInput, EnrichResponse } from './types';
import type { Domain } from '@/core/types';
import type { FoodData } from '@/domains/schemas';

/**
 * The whole DeepSeek exchange — prompt assembly, image captioning, output
 * validation — with no transport of its own beyond the upstream `fetch`.
 *
 * Two callers share it: the `/api/enrich` route (managed key, server-side) and
 * the app itself when the user brought their own key. Keeping it here is what
 * lets the standalone build work without a deployed proxy; duplicating it into
 * the client is how the two paths would drift.
 */

// deepseek-chat is deprecated 2026-07-24; v4-flash is the fast non-thinking model.
// Swap to 'deepseek-v4-pro' here if you want higher-quality parsing.
const MODEL = 'deepseek-v4-flash';
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';

/** Upstream unreachable. Callers retry these; every other failure is terminal. */
export class DeepSeekTransportError extends Error {}

const MediaDescriptionsSchema = z.object({
  descriptions: z.array(
    z.object({
      id: z.string().min(1).max(120),
      description: z.string().trim().min(1).max(500),
    }),
  ),
});

type ChatContent =
  | string
  | ({ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } })[];
type ChatMessage = { role: 'system' | 'user'; content: ChatContent };

export interface EnrichEngineInput {
  text: string;
  domain: Domain;
  intent: 'parse' | 'foodEdit';
  currentFood?: FoodData;
  media?: EnrichMediaInput[];
  context?: string;
  userContext?: string;
  locale?: string;
}

/** Resolved upstream credentials. `image` falls back to `chat` at the call site. */
export interface EngineKeys {
  chat: string;
  image: string;
}

async function callDeepSeekJson(
  apiKey: string,
  messages: ChatMessage[],
  maxTokens: number,
  signal?: AbortSignal,
): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        thinking: { type: 'disabled' },
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_tokens: maxTokens,
      }),
      signal,
    });
  } catch (e) {
    throw new DeepSeekTransportError(e instanceof Error ? e.message : 'network failure');
  }

  // Rate limits and upstream outages are exactly what backoff is for; a
  // rejected key is not, and must stay terminal so the caller does not burn
  // five retries on a credential that cannot work.
  if (res.status === 429 || res.status >= 500) {
    throw new DeepSeekTransportError(`AI service unavailable (${res.status})`);
  }
  if (!res.ok) throw new Error(`AI service error (${res.status})`);

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
  media: EnrichMediaInput[] | undefined,
  language: string,
  signal?: AbortSignal,
): Promise<EnrichMediaDescription[]> {
  if (!media?.length) return [];

  const provided = media.flatMap((item): EnrichMediaDescription[] => {
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
      signal,
    );
    const parsed = MediaDescriptionsSchema.safeParse(raw);
    return parsed.success ? [...provided, ...parsed.data.descriptions] : provided;
  } catch {
    // Captioning is best-effort: a blind parse still beats failing the note.
    return provided;
  }
}

/**
 * Throws {@link DeepSeekTransportError} when the upstream is unreachable —
 * everything else comes back as a `{ ok: false }` envelope.
 */
export async function runEnrichEngine(
  input: EnrichEngineInput,
  keys: EngineKeys,
  signal?: AbortSignal,
): Promise<EnrichResponse> {
  const { text, domain, intent, currentFood, media, context, userContext, locale } = input;

  const language = locale?.toLowerCase().startsWith('en') ? 'English' : 'Brazilian Portuguese';
  const mediaDescriptions =
    domain === 'food' && intent === 'parse'
      ? await describeFoodMedia(keys.image, media, language, signal)
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

  const raw = await callDeepSeekJson(
    keys.chat,
    [
      { role: 'system', content: system },
      { role: 'user', content: userContent },
    ],
    intent === 'foodEdit' ? 1800 : 1100,
    signal,
  );

  // Validate the model output here too (defense in depth).
  const parsed = (intent === 'foodEdit' ? foodEditSchema : schemaByDomain[domain]).safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'AI response did not match schema' };

  return { ok: true, data: parsed.data, mediaDescriptions };
}
