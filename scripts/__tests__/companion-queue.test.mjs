import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { test } from 'node:test';
import { createCompanionQueue } from '../companion-queue.mjs';
import { serviceArguments } from '../companion-service.mjs';

const token = 'a'.repeat(64);
const catalog = [{ name: 'addEntries', description: 'Write notes', parameters: { type: 'object' } }];
const args = { entries: [{ domain: 'food', text: 'private test meal' }] };
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'gymnotes-queue-'));
  t.after(async () => {
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep));
    await rm(directory, { recursive: true, force: true });
  });
  return { path: join(directory, 'queue.bin'), token, now: () => Date.parse('2026-10-24T01:30:00Z') };
}

test('encrypted queue survives restarts, freezes the phone day and does not expose note text', async (t) => {
  const options = await fixture(t);
  const queue = createCompanionQueue(options);
  await queue.ready;
  await queue.remember(catalog, 'America/Sao_Paulo');
  await queue.enqueue('one', args);
  assert.ok(!(await readFile(options.path)).includes(Buffer.from(args.entries[0].text)));
  const restored = createCompanionQueue(options);
  await restored.ready;
  assert.equal(restored.count(), 1);
  assert.equal(restored.pending()[0].arguments.entries[0].date, '2026-10-23');
  assert.deepEqual(restored.catalog(), catalog);
  await restored.settle('one', { ok: true });
  assert.equal((await restored.enqueue('one', args)).status, 'delivered');
  assert.equal(restored.count(), 0);
});

test('requires a prior grant, rejects conflicting retries, and respects explicit dates', async (t) => {
  const queue = createCompanionQueue(await fixture(t));
  await assert.rejects(queue.enqueue('one', args), /tool-unavailable/);
  await queue.remember(catalog);
  await queue.enqueue('one', args);
  await assert.rejects(queue.enqueue('one', { entries: [{ domain: 'workout', text: 'other' }] }), /request-conflict/);
  const item = await queue.enqueue('dated', { entries: [{ ...args.entries[0], date: '2026-10-20' }] });
  assert.equal(item.arguments.entries[0].date, '2026-10-20');
  await queue.remember([]);
  await assert.rejects(queue.enqueue('revoked', args), /tool-unavailable/);
});

test('the wrong invitation cannot read or overwrite a saved queue', async (t) => {
  const options = await fixture(t);
  const queue = createCompanionQueue(options);
  await queue.remember(catalog);
  await queue.enqueue('one', args);
  const restored = createCompanionQueue({ ...options, token: 'b'.repeat(64) });
  await assert.rejects(restored.ready, /queue-corrupt/);
  await assert.rejects(restored.enqueue('two', args), /queue-corrupt/);
  const original = createCompanionQueue(options);
  await original.ready;
  assert.equal(original.count(), 1);
});

test('queue capacity is bounded without dropping accepted commands', async (t) => {
  const queue = createCompanionQueue(await fixture(t));
  await queue.remember(catalog);
  await Promise.all(Array.from({ length: 100 }, (_, i) => queue.enqueue(`item-${i}`, args)));
  await assert.rejects(queue.enqueue('overflow', args), /queue-full/);
  assert.equal(queue.count(), 100);
});

test('hidden startup arguments contain paths, never credentials', () => {
  const args = serviceArguments('Run', 'C:\\Users\\Test Name\\.gymnotes\\settings.dpapi');
  assert.equal(args[args.indexOf('-WindowStyle') + 1], 'Hidden');
  assert.ok(args.includes('C:\\Users\\Test Name\\.gymnotes\\settings.dpapi'));
  assert.ok(!args.join(' ').includes(token));
});
