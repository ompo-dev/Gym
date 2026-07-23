import { log } from '@/core/log';
import { normalizeForEnrich } from '@/core/enrich/normalize';
import {
  foodEditPrompt,
  foodRouterPrompt,
  promptByDomain,
  purchasePrompt,
  recipePrompt,
  workoutPlanPrompt,
  workoutRouterPrompt,
} from '@/domains/prompts';
import {
  foodEditSchema,
  foodEntrySchema,
  foodMultiSchema,
  foodSchema,
  purchaseSchema,
  schemaByDomain,
} from '@/domains/schemas';
import { workoutPlanSchema } from '@/domains/workoutPlan';
import { z } from 'zod';

import type {
  EnrichIntent,
  EnrichMediaDescription,
  EnrichMediaInput,
  EnrichResponse,
} from './types';
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

/**
 * How each domain is told to read the profile context. A domain absent from
 * this table has its context dropped — which is how `onboarding` stays out
 * without an extra branch: those notes are what *builds* the profile, so
 * feeding the current one back would have the model echo defaults as answers.
 */
const USER_CONTEXT: Partial<Record<Domain, { label: string; instruction: string }>> = {
  food: {
    label: 'User nutrition context',
    instruction:
      'Use the user nutrition context to choose serving assumptions, calories and macros; respect restrictions, diet preferences and notes when relevant.',
  },
  workout: {
    label: 'User profile',
    instruction:
      'Use the user profile only to pick the most likely exercise name and the muscles it trains; never invent sets, loads, duration or distance the entry does not state.',
  },
};

/**
 * Prompt and output schema for each intent, side by side so they cannot drift.
 * A missing entry falls back to the domain default, which is what `parse` is.
 *
 * Pinning the schema per intent is the guarantee: `schemaByDomain.food` is a
 * union and would happily accept a meal-shaped reply to a purchase question.
 */
const INTENT_PROMPT: Partial<Record<EnrichEngineInput['intent'], string>> = {
  foodAuto: foodRouterPrompt,
  workoutAuto: workoutRouterPrompt,
  foodEdit: foodEditPrompt,
  purchase: purchasePrompt,
  recipe: recipePrompt,
  workoutPlan: workoutPlanPrompt,
};

const INTENT_SCHEMA: Partial<Record<EnrichEngineInput['intent'], z.ZodType>> = {
  // Already disjoint — `items` on one side, `purchase` on the other — so the
  // model picking either one lands on a shape every downstream `'items' in data`
  // guard already understands. No discriminant field to add, none to keep in sync.
  // Three shapes, disjoint by construction: a split has `notes`, a purchase has
  // `purchase`, a meal has `items`. The bus explodes a split into real notes and
  // treats the other two exactly as before.
  foodAuto: z.union([foodMultiSchema, foodEntrySchema]),
  // Disjoint the same way food is: a log has `exercise`, a plan has `days`.
  workoutAuto: z.union([workoutPlanSchema, schemaByDomain.workout]),
  foodEdit: foodEditSchema,
  purchase: purchaseSchema,
  // A recipe answers with the whole meal, recipe included — same shape a parse
  // returns, so the detail sheet renders it with no special case.
  recipe: foodSchema,
  workoutPlan: workoutPlanSchema,
};

/**
 * Output budget per intent. A truncated answer is invalid JSON, which is
 * terminal and gives the user "try again" on something that will never
 * succeed — so the ceiling has to match what each answer actually costs.
 */
const MAX_TOKENS: Partial<Record<EnrichEngineInput['intent'], number>> = {
  // Budgeted for the widest branch: several split notes, one of them a recipe.
  foodAuto: 3200,
  // Budgeted for its widest branch: a full week of exercises and sets.
  workoutAuto: 3000,
  foodEdit: 1800,
  purchase: 900,
  // Ingredients + steps + full nutrition for the meal.
  recipe: 2600,
  // Seven days of exercises and sets.
  workoutPlan: 3000,
};

/**
 * Exposed for the test that pins the pairing: an intent with a prompt but no
 * schema would fall back to the domain union, and a meal-shaped reply to a
 * purchase question would pass validation.
 */
export const INTENT_COVERAGE = Object.fromEntries(
  (Object.keys(INTENT_PROMPT) as (keyof typeof INTENT_PROMPT)[]).map((intent) => [
    intent,
    {
      prompt: Boolean(INTENT_PROMPT[intent]),
      schema: Boolean(INTENT_SCHEMA[intent]),
      // The recipe intent shipped on the 1100 default and every answer came back
      // truncated — invalid JSON, which is terminal, so the user got "try again"
      // on something that could never succeed. An intent with its own prompt
      // asks for its own shape and must budget for it.
      tokens: Boolean(MAX_TOKENS[intent]),
    },
  ]),
) as Record<string, { prompt: boolean; schema: boolean; tokens: boolean }>;

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
  intent: EnrichIntent;
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

/** A success line stays short; a failure prints whole, because that is the one
 *  you actually need to read. */
const PAYLOAD_PREVIEW = 1200;
const clip = (text: string, max = PAYLOAD_PREVIEW) =>
  text.length > max ? `${text.slice(0, max)}… (+${text.length - max} chars)` : text;

/** Message content as a loggable string — never the raw base64 of an image,
 *  which would bury the terminal in megabytes. */
function describeContent(content: ChatMessage['content']): string {
  if (typeof content === 'string') return clip(content);
  return content
    .map((part) => (part.type === 'text' ? part.text : '[image]'))
    .join(' ');
}

async function callDeepSeekJson(
  apiKey: string,
  messages: ChatMessage[],
  maxTokens: number,
  signal?: AbortSignal,
): Promise<unknown> {
  // The exact request, so a bad answer can be traced to what was actually sent.
  log.ai('→ request', {
    model: MODEL,
    maxTokens,
    messages: messages.map((m) => ({ role: m.role, content: describeContent(m.content) })),
  });

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
    log.error('deepseek unreachable', { message: e instanceof Error ? e.message : String(e) });
    throw new DeepSeekTransportError(e instanceof Error ? e.message : 'network failure');
  }

  // Read the body as text once, so the raw upstream answer is available to log
  // whether it parses or not — the failing body is the whole point of logging.
  const raw = await res.text();

  // Rate limits and upstream outages are exactly what backoff is for; a
  // rejected key is not, and must stay terminal so the caller does not burn
  // five retries on a credential that cannot work.
  if (res.status === 429 || res.status >= 500) {
    log.error(`deepseek ${res.status} (retryable)`, { body: raw });
    throw new DeepSeekTransportError(`AI service unavailable (${res.status})`);
  }
  if (!res.ok) {
    log.error(`deepseek ${res.status}`, { body: raw });
    throw new Error(`AI service error (${res.status})`);
  }

  let content: string | undefined;
  try {
    const envelope = JSON.parse(raw) as {
      choices?: { message?: { content?: string } }[];
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        prompt_cache_hit_tokens?: number;
        prompt_cache_miss_tokens?: number;
      };
    };
    content = envelope.choices?.[0]?.message?.content;
    // The cost signal, straight from DeepSeek. `hit` tokens are billed ~10× less
    // than `miss` — a big stable system prompt sent first is cached from the
    // second call on. `out` is never cached, which is why the JSON is minified.
    const u = envelope.usage;
    if (u) {
      log.ai('usage', {
        in: u.prompt_tokens,
        out: u.completion_tokens,
        cacheHit: u.prompt_cache_hit_tokens,
        cacheMiss: u.prompt_cache_miss_tokens,
      });
    }
  } catch {
    log.error('deepseek envelope not JSON', { body: raw });
    throw new Error('AI returned invalid JSON');
  }
  if (!content) {
    log.error('deepseek empty content', { body: clip(raw) });
    throw new Error('Empty AI response');
  }

  try {
    const parsed = JSON.parse(content);
    log.ai('← response', { content: clip(content) });
    return parsed;
  } catch {
    // The model's own text was not valid JSON — this is the line you want whole.
    log.error('deepseek content not JSON', { content });
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
  // Any food note with photos, not just a plain parse. Gating this on
  // `intent === 'parse'` silently blinded every photo the moment food notes
  // started routing through `foodAuto` — a grocery haul and a fridge shot are
  // exactly the pictures worth reading.
  const mediaDescriptions =
    domain === 'food' ? await describeFoodMedia(keys.image, media, language, signal) : [];
  const mediaContext = mediaDescriptions
    .map((item, index) => `Image ${index + 1} mediaId=${item.id}: ${item.description}`)
    .join('\n');
  const textWithMedia = [text, mediaContext].filter(Boolean).join('\n');
  const normalizedText =
    intent === 'foodEdit' ? text : normalizeForEnrich(textWithMedia, { domain, locale });
  const contextCopy = userContext ? USER_CONTEXT[domain] : undefined;
  const system = [
    INTENT_PROMPT[intent] ?? promptByDomain[domain],
    'Write the "label", "item", "note", "exercise" and "reasoning" text in',
    `${language}.`,
    contextCopy?.instruction ?? '',
    // Output is never cached, so every character is billed at full rate. Minified
    // JSON drops the newlines and indentation the model would otherwise spend
    // tokens on — the values are unchanged, only the whitespace between them.
    'Output minified JSON on a single line: no newlines, no indentation, no spaces except inside string values.',
  ]
    .filter(Boolean)
    .join(' ');
  const entryBlock =
    normalizedText === textWithMedia
      ? `Entry: ${textWithMedia}`
      : `Original entry: ${textWithMedia}\nNormalized arithmetic: ${normalizedText}`;
  const contextBlock = context ? `Context: current exercise is "${context}".\n` : '';
  const userContextBlock = contextCopy ? `${contextCopy.label}:\n${userContext}\n\n` : '';
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
    MAX_TOKENS[intent] ?? 1100,
    signal,
  );

  // Validate the model output here too (defense in depth). A purchase is pinned
  // to `purchaseSchema`, NOT to `schemaByDomain.food` — the union would happily
  // accept a meal-shaped reply, and a note saying "comprei" would land 1100
  // kcal on the day. Failing loudly here is the guarantee.
  const outputSchema = INTENT_SCHEMA[intent] ?? schemaByDomain[domain];
  const parsed = outputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'AI response did not match schema' };

  return { ok: true, data: parsed.data, mediaDescriptions };
}

/**
 * The names the model has finished writing, read out of half-written JSON.
 *
 * The stream carries raw JSON, so showing it verbatim would put braces on the
 * screen. The regex only matches a *closed* quoted value, which is what keeps a
 * name from flickering in half-typed as the characters arrive.
 */
export function streamedNames(partial: string): string[] {
  return [...partial.matchAll(/"(?:exercise|label|title)"\s*:\s*"((?:[^"\\]|\\.)*)"/g)]
    .map((match) => match[1].trim())
    .filter(Boolean);
}

/**
 * The value the model is in the middle of writing, if any.
 *
 * `streamedNames` deliberately waits for the closing quote, which keeps a
 * finished list from flickering — but on its own it makes the stream look like
 * it arrives in whole words. This returns the open one so the last line can be
 * typed out character by character, which is what the streaming is for.
 */
export function openStreamedName(partial: string): string | null {
  const match = /"(?:exercise|label|title)"\s*:\s*"((?:[^"\\]|\\.)*)$/.exec(partial);
  return match ? match[1] : null;
}
