import { z } from 'zod';

import type { JsonModelTransport } from '@/core/enrich/providers';
import { useAgentConnectionStore } from '@/store/useAgentConnectionStore';
import { useAgentSettingsStore, type AgentBinding, type AgentPurpose } from '@/store/useAgentSettingsStore';

import { isAgentConnected, requestAgent } from './agentRPC';

function transportFor(binding: AgentBinding): JsonModelTransport {
  return async (request) => {
    const result = await requestAgent({ provider: binding.provider, action: 'generate', choices: binding.choices,
      messages: request.messages, responseSchema: request.responseSchema,
      media: request.media?.map(({ base64, mimeType }) => ({ base64, mimeType: mimeType ?? 'image/jpeg' })),
    }, request.signal);
    return z.object({ json: z.unknown() }).parse(result).json;
  };
}

function connectedAgentBinding(): AgentBinding | null {
  const agent = useAgentConnectionStore.getState().connection?.agent;
  const provider = agent === 'codex' || agent === 'chatgpt' ? 'codex'
    : agent === 'claude' || agent === 'claudecode' ? 'claude'
      : agent === 'gemini' ? 'gemini' : null;
  return provider ? { provider, choices: {} } : null;
}

/** Snapshot the selected roles before dispatch; never bill a key after an agent failure. */
export async function availableAgentTransports(): Promise<Partial<Record<AgentPurpose, JsonModelTransport>>> {
  if (!isAgentConnected()) return {};
  await useAgentSettingsStore.getState().hydrate();
  if (!isAgentConnected()) return {};
  const { text, vision } = useAgentSettingsStore.getState();
  const connected = connectedAgentBinding();
  return {
    text: text || connected ? transportFor(text ?? connected!) : undefined,
    vision: vision || connected ? transportFor(vision ?? connected!) : undefined,
  };
}

export const agentJsonTransport: JsonModelTransport = async (request) => {
  await useAgentSettingsStore.getState().hydrate();
  const purpose = request.media?.length ? 'vision' : 'text';
  const binding = useAgentSettingsStore.getState()[purpose];
  if (!binding) throw new Error('agent.configure');
  return transportFor(binding)(request);
};
