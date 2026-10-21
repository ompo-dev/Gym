import { invokeTool, toolCatalog, type ToolDeps } from '@/core/tools/registry';

import { agentCallSchema } from './protocol';

export function createAgentSession(deps: ToolDeps, allowWrites: boolean, connected: () => boolean = () => true) {
  const pending = new Map<string, Promise<unknown>>();
  const completed = new Set<string>();
  let active = true;
  return {
    close: () => { active = false; },
    catalog: () => toolCatalog().filter((tool) => allowWrites || tool.name !== 'addEntries'),
    async call(raw: unknown): Promise<unknown> {
      const parsed = agentCallSchema.safeParse(raw);
      if (!parsed.success) return { ok: false, error: 'connect.invalidRequest' };
      const request = parsed.data;
      if (!active || !connected()) return { ok: false, error: 'connect.disconnected' };
      if (pending.has(request.id)) return pending.get(request.id);
      // Keep the last 100 results, without ever evicting in-flight work.
      if (pending.size >= 100) {
        const oldest = completed.values().next().value;
        if (!oldest) return { ok: false, error: 'connect.busy' };
        pending.delete(oldest);
        completed.delete(oldest);
      }
      const result = (async () => {
        if (!active) return { ok: false, error: 'connect.disconnected' };
        if (!allowWrites && request.name === 'addEntries') return { ok: false, error: 'connect.readOnly' };
        try {
          const result = await invokeTool(request.name, request.arguments, deps);
          if (!active || !connected()) return { ok: false, error: 'connect.disconnected' };
          if (!result.ok) return { ok: false, error: result.error };
          if (result.kind === 'data') return { ok: true, data: result.data };
          if (!active) return { ok: false, error: 'connect.disconnected' };
          await deps.bus.run(result.command);
          return { ok: true, message: 'Entries registered. Nutrition is processed in the app.' };
        } catch { return { ok: false, error: 'connect.failed' }; }
      })();
      pending.set(request.id, result);
      void result.finally(() => completed.add(request.id));
      return result;
    },
  };
}
