import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';

const entry = z.object({ text: z.string().trim().min(1).max(500), domain: z.enum(['food', 'workout']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });
const argumentsSchema = z.object({ entries: z.array(entry).min(1).max(31), label: z.string().min(1).max(60).optional() });
const itemSchema = z.object({ id: z.string().min(1).max(100), digest: z.string(), arguments: argumentsSchema,
  createdAt: z.number(), status: z.enum(['pending', 'delivered', 'failed']), result: z.unknown().optional() });
const stateSchema = z.object({ catalog: z.array(z.object({ name: z.string(), description: z.string(), parameters: z.record(z.string(), z.unknown()) })).max(30),
  items: z.array(itemSchema).max(200), timeZone: z.string().optional() });

export function createCompanionQueue({ path, token, now = Date.now }) {
  const key = createHash('sha256').update(`gymnotes-local-queue-v1:${token}`).digest();
  let state = { catalog: [], items: [] };
  let serial = Promise.resolve();
  const load = async () => {
    let raw;
    try { raw = await readFile(path); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
    if (raw.length > 5_000_000) throw new Error('queue-corrupt');
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
      decipher.setAuthTag(raw.subarray(12, 28));
      state = stateSchema.parse(JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString()));
    } catch { throw new Error('queue-corrupt'); }
  };
  const ready = load();
  const change = (update) => {
    const operation = serial.then(async () => {
      await ready;
      const next = structuredClone(state);
      const result = update(next);
      const nonce = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, nonce);
      const bytes = Buffer.concat([cipher.update(JSON.stringify(next)), cipher.final()]);
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      await writeFile(`${path}.tmp`, Buffer.concat([nonce, cipher.getAuthTag(), bytes]), { mode: 0o600, flush: true });
      await rename(`${path}.tmp`, path);
      state = next;
      return result;
    });
    serial = operation.catch(() => {});
    return operation;
  };
  return {
    ready,
    catalog: () => structuredClone(state.catalog),
    pending: () => structuredClone(state.items.filter((item) => item.status === 'pending')),
    count: () => state.items.filter((item) => item.status === 'pending').length,
    remember: (catalog, timeZone) => change((next) => {
      next.catalog = stateSchema.shape.catalog.parse(catalog);
      if (timeZone) { new Intl.DateTimeFormat('en', { timeZone }); next.timeZone = timeZone; }
    }),
    enqueue: (id, raw) => change((next) => {
      const args = argumentsSchema.parse(raw);
      const digest = createHash('sha256').update(JSON.stringify(args)).digest('hex');
      const existing = next.items.find((item) => item.id === id);
      if (existing) {
        if (existing.digest !== digest) throw new Error('request-conflict');
        return existing;
      }
      if (!next.catalog.some((tool) => tool.name === 'addEntries')) throw new Error('tool-unavailable');
      if (next.items.filter((item) => item.status === 'pending').length >= 100) throw new Error('queue-full');
      const parts = new Intl.DateTimeFormat('en-CA', { timeZone: next.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(now()));
      const get = (type) => parts.find((part) => part.type === type).value;
      const date = `${get('year')}-${get('month')}-${get('day')}`;
      const item = { id, digest, arguments: { ...args, entries: args.entries.map((entry) => ({ ...entry, date: entry.date ?? date })) },
        createdAt: now(), status: 'pending' };
      next.items = next.items.filter((item) => item.status === 'pending').concat(next.items.filter((item) => item.status !== 'pending').slice(-99), item);
      return item;
    }),
    settle: (id, result) => change((next) => {
      const item = next.items.find((item) => item.id === id);
      if (item) { item.status = result?.ok === true ? 'delivered' : 'failed'; item.result = result; }
    }),
  };
}
