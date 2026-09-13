import { log } from '@/core/log';

import type { EnrichMediaInput } from './types';

export type AiProviderId = 'deepseek' | 'gemini' | 'openai' | 'anthropic';

export interface ProviderCredential {
  provider: AiProviderId;
  key: string;
}

export class AiProviderTransportError extends Error {
  constructor(
    public provider: AiProviderId,
    message: string,
  ) {
    super(message);
  }
}

type VisionJsonRequest = {
  provider: Exclude<AiProviderId, 'deepseek'>;
  apiKey: string;
  media: EnrichMediaInput[];
  language: string;
  mediaOrder: string;
  maxTokens: number;
  signal?: AbortSignal;
  prompt?: string;
  responseSchema?: Record<string, unknown>;
};

export type ProviderChatMessage = { role: 'system' | 'user'; content: string };

type TextJsonRequest = {
  provider: Exclude<AiProviderId, 'deepseek'>;
  apiKey: string;
  messages: ProviderChatMessage[];
  maxTokens: number;
  signal?: AbortSignal;
};

type GeminiContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mime_type: string };

export function resolveProviderCredential(
  rawKey: string,
  fallback: AiProviderId,
): ProviderCredential {
  const trimmed = rawKey.trim();
  const explicit = /^(deepseek|gemini|openai|anthropic):(.+)$/i.exec(trimmed);
  if (explicit) {
    return {
      provider: explicit[1].toLowerCase() as AiProviderId,
      key: explicit[2].trim(),
    };
  }
  if (trimmed.startsWith('AIza')) return { provider: 'gemini', key: trimmed };
  if (trimmed.startsWith('sk-ant-')) return { provider: 'anthropic', key: trimmed };
  if (trimmed.startsWith('sk-proj-')) return { provider: 'openai', key: trimmed };
  return { provider: fallback, key: trimmed };
}

export function maskProviderKey(key: string): string {
  if (key.length <= 8) return '***';
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

function visionPrompt(language: string, mediaOrder: string): string {
  return [
    `Describe each food/menu image in ${language}.`,
    'Return ONLY JSON: {"descriptions":[{"id":string,"description":string}]}',
    'Use the exact ids in this order:',
    mediaOrder,
    'Focus on visible foods, drinks, portions, packaging, menu text, quantities, and any nutrition label clues.',
    'If an image is unclear, describe what is visible and say it is uncertain.',
  ].join('\n');
}

async function readJsonText(
  provider: Exclude<AiProviderId, 'deepseek'>,
  response: Response,
): Promise<string> {
  const raw = await response.text();
  if (response.status === 429 || response.status >= 500) {
    log.error(`${provider} ${response.status} (retryable)`, { body: raw });
    throw new AiProviderTransportError(provider, `AI service unavailable (${response.status})`);
  }
  if (!response.ok) {
    log.error(`${provider} ${response.status}`, { body: raw });
    throw new Error(`AI service error (${response.status})`);
  }

  let envelope: unknown;
  try {
    envelope = JSON.parse(raw);
  } catch {
    log.error(`${provider} envelope not JSON`, { body: raw });
    throw new Error('AI returned invalid JSON');
  }

  const content = extractProviderText(envelope);
  if (!content) {
    log.error(`${provider} empty content`, { body: raw });
    throw new Error('Empty AI response');
  }
  return content;
}

function extractProviderText(envelope: unknown): string | undefined {
  if (!envelope || typeof envelope !== 'object') return undefined;
  const value = envelope as {
    output_text?: string;
    outputText?: string;
    choices?: { message?: { content?: string } }[];
    content?: { type?: string; text?: string }[];
    output?: { content?: { type?: string; text?: string }[] }[];
  };
  if (typeof value.output_text === 'string') return value.output_text;
  if (typeof value.outputText === 'string') return value.outputText;
  const choiceText = value.choices?.[0]?.message?.content;
  if (typeof choiceText === 'string') return choiceText;
  const anthropicText = value.content
    ?.map((part) => (part.type === 'text' && typeof part.text === 'string' ? part.text : ''))
    .join('');
  if (anthropicText) return anthropicText;
  const outputText = value.output
    ?.flatMap((item) => item.content ?? [])
    .map((part) => (typeof part.text === 'string' ? part.text : ''))
    .join('');
  return outputText || undefined;
}

async function postProviderJson(
  provider: Exclude<AiProviderId, 'deepseek'>,
  url: string,
  init: RequestInit,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (e) {
    log.error(`${provider} unreachable`, { message: e instanceof Error ? e.message : String(e) });
    throw new AiProviderTransportError(provider, e instanceof Error ? e.message : 'network failure');
  }

  const content = await readJsonText(provider, response);
  try {
    const parsed = JSON.parse(content);
    log.ai(`${provider} vision response`, { content });
    return parsed;
  } catch {
    log.error(`${provider} content not JSON`, { content });
    throw new Error('AI returned invalid JSON');
  }
}

export async function callVisionJson({
  provider,
  apiKey,
  media,
  language,
  mediaOrder,
  maxTokens,
  signal,
  prompt: customPrompt,
  responseSchema,
}: VisionJsonRequest): Promise<unknown> {
  const prompt = customPrompt ?? visionPrompt(language, mediaOrder);
  log.ai(`${provider} vision request`, {
    media: media.length,
    key: maskProviderKey(apiKey),
  });

  if (provider === 'gemini') {
    const parts: GeminiContentPart[] = [
      { type: 'text', text: prompt },
      ...media.map((item) => ({
        type: 'image' as const,
        data: item.base64,
        mime_type: item.mimeType ?? 'image/jpeg',
      })),
    ];
    return postProviderJson(
      provider,
      'https://generativelanguage.googleapis.com/v1beta/interactions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          model: process.env.GEMINI_VISION_MODEL ?? 'gemini-3.8-flash',
          input: parts,
          response_format: {
            type: 'text',
            mime_type: 'application/json',
            schema: responseSchema ?? {
              type: 'object',
              properties: {
                descriptions: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      description: { type: 'string' },
                    },
                    required: ['id', 'description'],
                  },
                },
              },
              required: ['descriptions'],
            },
          },
          generation_config: {
            temperature: 0.2,
            max_output_tokens: maxTokens,
            ...(customPrompt ? { thinking_level: 'minimal' } : {}),
          },
        }),
        signal,
      },
    );
  }

  if (provider === 'openai') {
    return postProviderJson(provider, 'https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_VISION_MODEL ?? 'gpt-6-astra',
        max_output_tokens: maxTokens,
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_text', text: prompt },
              ...media.map((item) => ({
                type: 'input_image',
                image_url: `data:${item.mimeType ?? 'image/jpeg'};base64,${item.base64}`,
                detail: 'auto',
              })),
            ],
          },
        ],
      }),
      signal,
    });
  }

  return postProviderJson(provider, 'https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_VISION_MODEL ?? 'claude-opus-5',
      max_tokens: maxTokens,
      temperature: 0.2,
      system:
        'You create concise food image descriptions for a nutrition parser. Respond with JSON only.',
      messages: [
        {
          role: 'user',
          content: [
            ...media.map((item) => ({
              type: 'image',
              source: {
                type: 'base64',
                media_type: item.mimeType ?? 'image/jpeg',
                data: item.base64,
              },
            })),
            { type: 'text', text: prompt },
          ],
        },
      ],
    }),
    signal,
  });
}

export async function callTextJson({
  provider,
  apiKey,
  messages,
  maxTokens,
  signal,
}: TextJsonRequest): Promise<unknown> {
  log.ai(`${provider} text request`, {
    maxTokens,
    key: maskProviderKey(apiKey),
    messages: messages.map((message) => ({
      role: message.role,
      chars: message.content.length,
    })),
  });

  const system = messages.find((message) => message.role === 'system')?.content;
  const user = messages
    .filter((message) => message.role === 'user')
    .map((message) => message.content)
    .join('\n\n');

  if (provider === 'gemini') {
    return postProviderJson(
      provider,
      'https://generativelanguage.googleapis.com/v1beta/interactions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          model: process.env.GEMINI_TEXT_MODEL ?? process.env.GEMINI_VISION_MODEL ?? 'gemini-3.8-flash',
          input: [system, user].filter(Boolean).join('\n\n'),
          response_format: {
            type: 'text',
            mime_type: 'application/json',
          },
          generation_config: { temperature: 0.2, max_output_tokens: maxTokens },
        }),
        signal,
      },
    );
  }

  if (provider === 'openai') {
    return postProviderJson(provider, 'https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_TEXT_MODEL ?? process.env.OPENAI_VISION_MODEL ?? 'gpt-6-astra',
        instructions: system,
        input: user,
        max_output_tokens: maxTokens,
      }),
      signal,
    });
  }

  return postProviderJson(provider, 'https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_TEXT_MODEL ?? process.env.ANTHROPIC_VISION_MODEL ?? 'claude-opus-5',
      max_tokens: maxTokens,
      temperature: 0.2,
      system,
      messages: [{ role: 'user', content: user }],
    }),
    signal,
  });
}
