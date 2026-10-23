import { z } from 'zod';

import type { JsonModelTransport } from '@/core/enrich/providers';
import { useAgentConnectionStore } from '@/store/useAgentConnectionStore';
import { useAgentSettingsStore, type AgentBinding, type AgentPurpose } from '@/store/useAgentSettingsStore';

import { isAgentConnected, requestAgent } from './agentRPC';
import { log } from '@/core/log';

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

/** Check account readiness before sending any health data or starting paid inference. */
export async function availableAgentTransports(): Promise<Partial<Record<AgentPurpose, JsonModelTransport>> & { unavailable?: string }> {
  if (!isAgentConnected()) return { unavailable: 'agent.offline' };
  await useAgentSettingsStore.getState().hydrate();
  if (!isAgentConnected()) return {};
  const { text, vision } = useAgentSettingsStore.getState();
  const connected = connectedAgentBinding();
  const bindings = { text: text ?? connected, vision: vision ?? connected };
  const providers = [...new Set(Object.values(bindings).flatMap((binding) => binding ? [binding.provider] : []))];
  const states = new Map(await Promise.all(providers.map(async (provider) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const state = z.object({ authenticated: z.boolean(), imageSupported: z.boolean() })
        .parse(await requestAgent({ provider, action: 'inspect' }, controller.signal));
      if (!state.authenticated) log.connect('agent.notReady', { provider, reason: 'agent.authRequired' });
      return [provider, state] as const;
    } catch {
      log.connect('agent.notReady', { provider, reason: 'agent.offline' });
      return [provider, null] as const;
    } finally { clearTimeout(timeout); }
  })));
  const usable = (purpose: AgentPurpose) => {
    const binding = bindings[purpose];
    const state = binding && states.get(binding.provider);
    return binding && state?.authenticated && (purpose !== 'vision' || state.imageSupported)
      ? transportFor(binding) : undefined;
  };
  if (!isAgentConnected()) return {};
  return {
    text: usable('text'), vision: usable('vision'),
    unavailable: [...states.values()].some((state) => state && !state.authenticated) ? 'agent.authRequired'
      : [...states.values()].some((state) => state === null) ? 'agent.offline' : 'agent.noVision',
  };
}

export const agentJsonTransport: JsonModelTransport = async (request) => {
  await useAgentSettingsStore.getState().hydrate();
  const purpose = request.media?.length ? 'vision' : 'text';
  const binding = useAgentSettingsStore.getState()[purpose] ?? connectedAgentBinding();
  if (!binding) throw new Error('agent.configure');
  return transportFor(binding)(request);
};
