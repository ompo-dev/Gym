import { z } from 'zod';

import type { JsonModelTransport } from '@/core/enrich/providers';
import { useAgentSettingsStore } from '@/store/useAgentSettingsStore';

import { requestAgent } from './agentRPC';

export const agentJsonTransport: JsonModelTransport = async (request) => {
  await useAgentSettingsStore.getState().hydrate();
  const purpose = request.media?.length ? 'vision' : 'text';
  const binding = useAgentSettingsStore.getState()[purpose];
  if (!binding) throw new Error('agent.configure');
  const result = await requestAgent({ provider: binding.provider, action: 'generate', choices: binding.choices,
    messages: request.messages, responseSchema: request.responseSchema,
    media: request.media?.map(({ base64, mimeType }) => ({ base64, mimeType: mimeType ?? 'image/jpeg' })),
  }, request.signal);
  return z.object({ json: z.unknown() }).parse(result).json;
};
