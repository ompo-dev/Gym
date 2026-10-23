import { act, renderHook, waitFor } from '@testing-library/react-native';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createHash, randomBytes as mockRandomBytes, randomUUID as mockRandomUUID } from 'node:crypto';
import { once } from 'node:events';
import { request } from 'node:http';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { Platform } from 'react-native';
import { WebSocket as NodeSocket } from 'ws';

import { appToolDeps } from '@/core/tools/appTools';
import { requestAgent } from '@/core/connect/agentRPC';
import { useAgentConnectionStore } from '@/store/useAgentConnectionStore';
import { useAgentConnection } from './useAgentConnection';

jest.mock('expo-crypto', () => ({ getRandomBytesAsync: async () => new Uint8Array(mockRandomBytes(32)), randomUUID: () => mockRandomUUID() }));
jest.mock('@/core/tools/appTools', () => {
  const notes: string[] = [];
  return { appToolDeps: {
    notes,
    bus: {
      createAddEntry: (text: string) => ({ label: 'test note', execute: async () => { notes.push(text); }, undo: async () => { notes.pop(); } }),
      run: async (command: { execute: () => Promise<void> }) => command.execute(),
    },
    entries: { findAll: async () => [], findByDate: async () => [] },
    savedMeals: { all: async () => [] }, today: () => '2026-10-22', goals: () => ({ calories: 2000 }),
  } };
});

function api(base: string, key: string, path: string): Promise<unknown> {
  return new Promise((accept, reject) => {
    const req = request(`${base}/api/v1/${path}`, { headers: { authorization: `Bearer ${key}` } }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        try { accept(JSON.parse(body)); } catch (error) { reject(error); }
      });
    });
    req.on('error', reject);
    req.setTimeout(3000, () => req.destroy(new Error('probe-timeout')));
    req.end();
  });
}

async function stop(child: ChildProcessWithoutNullStreams | undefined) {
  if (!child || child.exitCode !== null) return;
  const closed = once(child, 'exit');
  child.kill();
  await closed;
}

test('the real transport handles MCP writes and app-to-agent text/photos in both directions', async () => {
  const originalOS = Platform.OS;
  const originalSocket = globalThis.WebSocket;
  const token = mockRandomBytes(32).toString('hex');
  const key = createHash('sha256').update(`gymnotes-tools-v1:${token}`).digest('hex');
  const script = resolve('scripts/gymnotes-connect.mjs');
  const companion = spawn(process.execPath, ['--input-type=module', '--eval', `
    const { createBridge } = await import(${JSON.stringify(pathToFileURL(script).href)});
    const { agent, methods, PROTOCOL_VERSION } = await import('@agentclientprotocol/sdk/unstable');
    const agentFactory = async () => {
      const toAgent = new TransformStream();
      const toClient = new TransformStream();
      const fixture = agent({ name: 'fixture' })
        .onRequest(methods.agent.initialize, () => ({ protocolVersion: PROTOCOL_VERSION,
          agentCapabilities: { promptCapabilities: { image: true } }, authMethods: [] }))
        .onRequest(methods.agent.session.new, () => ({ sessionId: 'fixture-session', configOptions: [] }))
        .onRequest(methods.agent.session.prompt, async ({ params, client }) => {
          const result = {
            textReceived: params.prompt.some((block) => block.type === 'text' && block.text.includes('synthetic app request')),
            photoReceived: params.prompt.some((block) => block.type === 'image' && block.data === 'dGVzdA=='),
          };
          await client.notify(methods.client.session.update, { sessionId: params.sessionId,
            update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: JSON.stringify(result) } } });
          return { stopReason: 'end_turn' };
        });
      const connection = fixture.connect({ writable: toClient.writable, readable: toAgent.readable });
      return { cwd: process.cwd(), target: { writable: toAgent.writable, readable: toClient.readable }, stop: async () => connection.close() };
    };
    const bridge = createBridge({ token: process.env.GYMNOTES_PAIRING_TOKEN, port: 0, agentFactory });
    const address = await bridge.start();
    console.log(JSON.stringify({ port: address.port }));
  `], { env: { ...process.env, GYMNOTES_PAIRING_TOKEN: token }, stdio: ['pipe', 'pipe', 'pipe'] });
  const companionOutput = createInterface({ input: companion.stdout });
  let client: ChildProcessWithoutNullStreams | undefined;
  let unmount: (() => Promise<void>) | undefined;
  let unsubscribe: (() => void) | undefined;
  try {
    const [line] = await once(companionOutput, 'line', { signal: AbortSignal.timeout(5000) });
    const base = `http://127.0.0.1:${JSON.parse(line).port}`;
    expect(await api(base, key, 'tools')).toEqual({ connected: false, tools: [] });
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
    globalThis.WebSocket = NodeSocket as unknown as typeof WebSocket;
    useAgentConnectionStore.setState({ connection: { url: `${base.replace('http:', 'ws:')}/app`, token, allowWrites: true }, status: 'offline' });
    let inspected: Promise<unknown> | undefined;
    unsubscribe = useAgentConnectionStore.subscribe((state) => {
      if (state.status === 'connected' && !inspected) inspected = requestAgent({ provider: 'codex', action: 'inspect' });
    });
    const hook = await renderHook(() => useAgentConnection(true));
    unmount = hook.unmount;
    await waitFor(() => expect(useAgentConnectionStore.getState().status).toBe('connected'), { timeout: 5000 });
    expect(await inspected).toMatchObject({ authenticated: true, imageSupported: true });
    expect(await api(base, key, 'ping')).toEqual({ ok: true, data: { connected: true } });
    const generated = await requestAgent({ provider: 'codex', action: 'generate', choices: {},
      messages: [{ role: 'user', content: 'synthetic app request' }], media: [{ base64: 'dGVzdA==', mimeType: 'image/jpeg' }] });
    expect(generated).toEqual({ json: { textReceived: true, photoReceived: true } });
    client = spawn(process.execPath, [script, '--mcp'], {
      env: { ...process.env, GYMNOTES_CONNECT_TOKEN: key, GYMNOTES_CONNECT_URL: base }, stdio: ['pipe', 'pipe', 'pipe'],
    });
    const reader = createInterface({ input: client.stdout });
    const rpc = async (id: number, method: string, params: unknown) => {
      const received = once(reader, 'line', { signal: AbortSignal.timeout(5000) });
      client!.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
      const [data] = await received;
      return JSON.parse(data);
    };
    const init = await rpc(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'app-integration-test', version: '1.0' } });
    expect(init.result.serverInfo.name).toBe('gymnotes');
    client.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    const list = await rpc(2, 'tools/list', {});
    expect(list.result.tools.map((tool: { name: string }) => tool.name)).toContain('addEntries');
    const goals = await rpc(3, 'tools/call', { name: 'readGoals', arguments: {} });
    expect(JSON.parse(goals.result.content[0].text)).toEqual({ ok: true, data: { calories: 2000 } });
    const write = await rpc(4, 'tools/call', { name: 'addEntries', arguments: { entries: [{ domain: 'food', text: 'synthetic connection test' }] } });
    expect(write.result.isError).toBe(false);
    expect((appToolDeps as typeof appToolDeps & { notes: string[] }).notes).toEqual(['synthetic connection test']);
    reader.close();
    await act(async () => useAgentConnectionStore.getState().disconnect());
    await waitFor(async () => expect(await api(base, key, 'tools')).toEqual({ connected: false, tools: [] }));
  } finally {
    unsubscribe?.();
    await unmount?.();
    companionOutput.close();
    await stop(client);
    await stop(companion);
    useAgentConnectionStore.setState({ connection: null, status: 'offline', issue: null });
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalOS });
    globalThis.WebSocket = originalSocket;
  }
}, 20_000);
