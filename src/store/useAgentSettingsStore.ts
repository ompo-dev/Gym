import { z } from 'zod';
import { create } from 'zustand';

import { SettingsRepository } from '@/data/SettingsRepository';

const choice = z.union([z.string().max(300), z.boolean()]);
const provider = z.enum(['codex', 'claude', 'gemini']);
const bindingSchema = z.object({ provider, choices: z.record(z.string().max(200), choice) });
export type AgentBinding = z.infer<typeof bindingSchema>;
export type AgentPurpose = 'text' | 'vision';
const bindingsSchema = z.object({ text: bindingSchema.nullable(), vision: bindingSchema.nullable() });
export const agentStateSchema = z.object({
  provider, authenticated: z.boolean(), imageSupported: z.boolean(), claudeConsoleOnly: z.boolean().optional(),
  logoutSupported: z.boolean().optional(),
  authMethods: z.array(z.object({ id: z.string().max(200), name: z.string().max(200), description: z.string().max(1000).nullable().optional() })).max(20),
  options: z.array(z.object({ id: z.string().max(200), name: z.string().max(200), type: z.enum(['select', 'boolean']),
    category: z.string().max(100), currentValue: choice,
    options: z.array(z.object({ value: z.string().max(300), name: z.string().max(300) })).max(1000).optional(),
  })).max(30),
});
export type AgentState = z.infer<typeof agentStateSchema>;
const KEY = 'gymnotes.agent-models.v1';
let generation = 0;
let hydration: Promise<void> | null = null;
let writes = Promise.resolve();
let resetGeneration = 0;
function updateBindings(update: (current: z.infer<typeof bindingsSchema>) => z.infer<typeof bindingsSchema>): Promise<void> {
  const reset = resetGeneration;
  const operation = writes.catch(() => {}).then(async () => {
    if (reset !== resetGeneration) return;
    await useAgentSettingsStore.getState().hydrate();
    generation += 1;
    const next = update(useAgentSettingsStore.getState());
    await SettingsRepository.set(KEY, JSON.stringify(next));
    if (reset === resetGeneration) useAgentSettingsStore.setState({ ...next, loaded: true });
  });
  writes = operation;
  return operation;
}
interface State {
  loaded: boolean;
  text: AgentBinding | null;
  vision: AgentBinding | null;
  hydrate: () => Promise<void>;
  bind: (purpose: AgentPurpose, binding: AgentBinding) => Promise<void>;
  unbind: (provider: AgentBinding['provider']) => Promise<void>;
  reset: () => void;
}
export const useAgentSettingsStore = create<State>((set, get) => ({
  loaded: false, text: null, vision: null,
  hydrate: async () => {
    if (get().loaded) return;
    if (hydration) return hydration;
    const current = generation;
    hydration = SettingsRepository.get(KEY).then((raw) => {
      const result = raw ? bindingsSchema.safeParse(JSON.parse(raw)) : null;
      if (current === generation) set({ loaded: true, ...(result?.success ? result.data : {}) });
    }).catch(() => { if (current === generation) set({ loaded: true }); }).finally(() => { hydration = null; });
    return hydration;
  },
  bind: (purpose, binding) => {
    const parsed = bindingSchema.parse(binding);
    return updateBindings((current) => ({ text: current.text, vision: current.vision, [purpose]: parsed }));
  },
  unbind: (provider) => updateBindings((current) => ({ text: current.text?.provider === provider ? null : current.text,
    vision: current.vision?.provider === provider ? null : current.vision })),
  reset: () => { generation += 1; resetGeneration += 1; set({ loaded: true, text: null, vision: null }); },
}));
