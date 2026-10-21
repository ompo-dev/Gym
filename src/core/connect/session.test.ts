import type { CommandBus } from '@/core/command/CommandBus';
import type { ToolDeps } from '@/core/tools/registry';

import { connectionSchema, localSocketURL } from './protocol';
import { createAgentSession } from './session';

const run = jest.fn(async (command) => { await command.execute(); });
const createAddEntry = jest.fn(() => ({ label: 'add', execute: jest.fn(async () => {}), undo: jest.fn() }));
const deps: ToolDeps = {
  bus: { run, createAddEntry } as unknown as CommandBus,
  entries: { findAll: async () => [], findByDate: async () => [] },
  savedMeals: { all: async () => [] }, today: () => '2026-10-21', goals: () => ({ calories: 2000 }),
};
beforeEach(() => { jest.clearAllMocks(); });
test.each(['ws://localhost:3847', 'ws://127.0.0.1:3847', 'ws://192.168.1.4:3847', 'ws://172.16.2.4:3847', 'wss://10.0.0.4/app'])('accepts local pairing: %s', (url) => {
  expect(localSocketURL(url)).toMatch(/\/app$/);
});
test.each(['https://localhost', 'ws://attacker.com', 'ws://192.168.1.1.attacker.com', 'ws://172.32.0.1',
  'ws://1.1.1.1', 'ws://user:pass@localhost', 'ws://localhost/app?token=secret', 'ws://localhost/private', 'ws://999.1.1.1'])('refuses unsafe endpoint: %s', (url) => {
  expect(() => localSocketURL(url)).toThrow();
});
test('does not accept missing or weak keys', () => {
  expect(connectionSchema.safeParse({ url: 'ws://localhost', token: '1234' }).success).toBe(false);
});
test('read-only does not advertise or execute writes', async () => {
  const session = createAgentSession(deps, false);
  expect(session.catalog().map((tool) => tool.name)).not.toContain('addEntries');
  expect(await session.call({ type: 'call', id: 'write', name: 'addEntries', arguments: { entries: [{ domain: 'food', text: 'banana' }] } }))
    .toMatchObject({ ok: false, error: 'connect.readOnly' });
  expect(run).not.toHaveBeenCalled();
});
test('reads goals without exposing keys', async () => {
  expect(await createAgentSession(deps, false).call({ type: 'call', id: 'goals', name: 'readGoals', arguments: {} }))
    .toEqual({ ok: true, data: { calories: 2000 } });
});
test('validates arguments and tool names in the app, not just the bridge', async () => {
  const session = createAgentSession(deps, true);
  expect(await session.call({ type: 'call', id: '1', name: 'eraseAllData', arguments: {} })).toMatchObject({ ok: false });
  expect(await session.call({ type: 'call', id: '2', name: 'addEntries', arguments: { entries: [{ domain: 'onboarding', text: '98kg' }] } })).toMatchObject({ ok: false });
  expect(run).not.toHaveBeenCalled();
});
test('replaying a request cannot create duplicate notes', async () => {
  const session = createAgentSession(deps, true);
  const request = { type: 'call', id: 'same', name: 'addEntries', arguments: { entries: [{ domain: 'food', text: 'banana' }] } };
  const [a, b] = await Promise.all([session.call(request), session.call(request)]);
  expect(a).toEqual(b);
  expect(a).toMatchObject({ ok: true });
  expect(run).toHaveBeenCalledTimes(1);
});
test('revoking a session prevents subsequent writes', async () => {
  const session = createAgentSession(deps, true);
  session.close();
  expect(await session.call({ type: 'call', id: '1', name: 'addEntries', arguments: {} })).toMatchObject({ ok: false });
  expect(run).not.toHaveBeenCalled();
});

test('revocation during an awaited read prevents returning private data', async () => {
  let connected = true;
  const session = createAgentSession(deps, false, () => connected);
  const result = session.call({ type: 'call', id: '1', name: 'readGoals', arguments: {} });
  connected = false;
  expect(await result).toMatchObject({ ok: false, error: 'connect.disconnected' });
});

test('a long-running session keeps serving new requests with bounded replay memory', async () => {
  const session = createAgentSession(deps, false);
  for (let i = 0; i < 105; i += 1) {
    expect(await session.call({ type: 'call', id: `read-${i}`, name: 'readGoals', arguments: {} })).toMatchObject({ ok: true });
  }
});
