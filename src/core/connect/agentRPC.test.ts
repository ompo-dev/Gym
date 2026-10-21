import { bindAgentRPC, requestAgent } from './agentRPC';

jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'call-1') }));

test('account calls require a live paired app and never expose provider credentials', async () => {
  await expect(requestAgent({ provider: 'codex', action: 'inspect' })).rejects.toThrow('agent.offline');
  const send = jest.fn();
  const client = bindAgentRPC(send);
  try {
    const call = requestAgent({ provider: 'codex', action: 'inspect' });
    expect(send).toHaveBeenCalledWith({ type: 'agent.request', id: 'call-1', request: { provider: 'codex', action: 'inspect' } });
    client.receive({ type: 'agent.result', id: 'call-1', ok: true, data: { authenticated: true } });
    await expect(call).resolves.toEqual({ authenticated: true });
  } finally { client.close(); }
});
test('cancellation and revocation reject pending calls and ignore late responses', async () => {
  const send = jest.fn();
  const client = bindAgentRPC(send);
  const controller = new AbortController();
  const call = requestAgent({ provider: 'gemini', action: 'inspect' }, controller.signal);
  controller.abort();
  await expect(call).rejects.toThrow('agent.cancelled');
  expect(send).toHaveBeenLastCalledWith({ type: 'agent.cancel', id: 'call-1' });
  expect(client.receive({ type: 'agent.result', id: 'call-1', ok: true, data: {} })).toBe(true);
  const pending = requestAgent({ provider: 'claude', action: 'inspect' });
  client.close();
  await expect(pending).rejects.toThrow('agent.offline');
  await expect(requestAgent({ provider: 'codex', action: 'inspect' })).rejects.toThrow('agent.offline');
});
test('provider error payloads cannot leak into visible error messages', async () => {
  const client = bindAgentRPC(jest.fn());
  try {
    const call = requestAgent({ provider: 'codex', action: 'inspect' });
    client.receive({ type: 'agent.result', id: 'call-1', ok: false, error: 'secret-token' });
    await expect(call).rejects.toThrow('agent.failed');
  } finally { client.close(); }
});
