import { invokeTool, toolCatalog, type ToolDeps } from '@/core/tools/registry';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { z } from 'zod';
import { log } from '@/core/log';

import { agentCallSchema } from './protocol';

const receiptSchema = z.object({ digest: z.string(), status: z.enum(['running', 'done']),
  result: z.object({ ok: z.literal(true), message: z.string() }).optional() });

export function createAgentSession(deps: ToolDeps, allowWrites: boolean, connected: () => boolean = () => true) {
  const pending = new Map<string, Promise<unknown>>();
  const digests = new Map<string, string>();
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
      const digest = bytesToHex(sha256(utf8ToBytes(JSON.stringify({ name: request.name, arguments: request.arguments }))));
      if (digests.has(request.id) && digests.get(request.id) !== digest) return { ok: false, error: 'connect.requestConflict' };
      if (pending.has(request.id)) return pending.get(request.id);
      // Keep the last 100 results, without ever evicting in-flight work.
      if (pending.size >= 100) {
        const oldest = completed.values().next().value;
        if (!oldest) return { ok: false, error: 'connect.busy' };
        pending.delete(oldest);
        digests.delete(oldest);
        completed.delete(oldest);
      }
      const result = (async () => {
        if (!active) return { ok: false, error: 'connect.disconnected' };
        if (!allowWrites && request.name === 'addEntries') return { ok: false, error: 'connect.readOnly' };
        try {
          const receipts = request.name === 'addEntries' ? deps.deliveries : undefined;
          const stored = await receipts?.get(request.id);
          if (!active || !connected()) return { ok: false, error: 'connect.disconnected' };
          if (stored) {
            const receipt = receiptSchema.parse(JSON.parse(stored));
            if (receipt.digest !== digest) return { ok: false, error: 'connect.requestConflict' };
            log.connect('delivery.replay', { id: request.id, status: receipt.status });
            return receipt.status === 'done' && receipt.result ? receipt.result
              : { ok: false, error: 'connect.deliveryPending' };
          }
          const result = await invokeTool(request.name, request.arguments, deps);
          if (!active || !connected()) return { ok: false, error: 'connect.disconnected' };
          if (!result.ok) return { ok: false, error: result.error };
          if (result.kind === 'data') return { ok: true, data: result.data };
          if (!active) return { ok: false, error: 'connect.disconnected' };
          if (receipts) await receipts.set(request.id, JSON.stringify({ digest, status: 'running' }));
          if (!active || !connected()) {
            if (receipts) await receipts.set(request.id, '');
            return { ok: false, error: 'connect.disconnected' };
          }
          await deps.bus.run(result.command);
          const reply = { ok: true as const, message: 'Entries registered. Nutrition is processed in the app.' };
          if (receipts) await receipts.set(request.id, JSON.stringify({ digest, status: 'done', result: reply }));
          log.connect('delivery.applied', { id: request.id });
          return reply;
        } catch { return { ok: false, error: 'connect.failed' }; }
      })();
      pending.set(request.id, result);
      digests.set(request.id, digest);
      void result.finally(() => completed.add(request.id));
      return result;
    },
  };
}
