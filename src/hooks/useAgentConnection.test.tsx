import { act, renderHook } from '@testing-library/react-native';
import { AppState, Platform, type AppStateStatus } from 'react-native';

import { createAgentSession } from '@/core/connect/session';
import { bindAgentRPC } from '@/core/connect/agentRPC';
import { peerProof } from '@/core/connect/peerAuth';
import { startPeerDiscovery } from '@/core/connect/peerDiscovery';
import { useAgentConnectionStore } from '@/store/useAgentConnectionStore';
import { useAgentConnection } from './useAgentConnection';

jest.mock('@/core/tools/appTools', () => ({ appToolDeps: {} }));
jest.mock('@/core/command/bus', () => ({ bus: { resumePending: jest.fn(async () => 0) } }));
jest.mock('@/core/connect/session', () => ({ createAgentSession: jest.fn() }));
jest.mock('@/core/connect/agentRPC', () => ({ bindAgentRPC: jest.fn() }));
jest.mock('@/core/connect/peerDiscovery', () => ({ startPeerDiscovery: jest.fn(() => jest.fn()) }));
jest.mock('expo-crypto', () => ({ getRandomBytesAsync: async () => new Uint8Array(32).fill(12) }));

class MockSocket {
  static OPEN = 1;
  static instances: MockSocket[] = [];
  readyState = 1;
  onopen?: () => void;
  onmessage?: (event: { data: string }) => Promise<void>;
  onclose?: (event: { code: number; reason: string }) => void;
  send = jest.fn();
  close = jest.fn((code = 1000, reason = '') => { this.readyState = 3; this.onclose?.({ code, reason }); });
  constructor(readonly url: string) { MockSocket.instances.push(this); }
  receive(value: unknown) { return this.onmessage?.({ data: JSON.stringify(value) }); }
}
const originalOS = Platform.OS;
const originalSocket = globalThis.WebSocket;
const originalState = AppState.currentState;
const grant = { url: 'ws://192.168.1.10:3847/app', token: 'a'.repeat(64), allowWrites: false };
let listener: (state: AppStateStatus) => void;
const call = jest.fn();
const close = jest.fn();
const nonce = 'b'.repeat(64);
const clientNonce = '0c'.repeat(32);
const challenge = { type: 'challenge', nonce, proof: peerProof(grant.token, nonce, 'server', clientNonce) };

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
  AppState.currentState = 'active';
  globalThis.WebSocket = MockSocket as unknown as typeof WebSocket;
  MockSocket.instances = [];
  useAgentConnectionStore.setState({ connection: grant, status: 'offline', issue: null });
  jest.spyOn(useAgentConnectionStore.getState(), 'hydrate').mockResolvedValue(undefined);
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => {
    listener = callback;
    return { remove: jest.fn() };
  });
  jest.mocked(createAgentSession).mockReturnValue({ catalog: () => [], call, close } as unknown as ReturnType<typeof createAgentSession>);
  jest.mocked(bindAgentRPC).mockReturnValue({ receive: () => false, close: jest.fn() });
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
  Object.defineProperty(Platform, 'OS', { configurable: true, value: originalOS });
  AppState.currentState = originalState;
  globalThis.WebSocket = originalSocket;
});

test.each(['127.0.0.1', 'localhost', '[::1]'])('a phone waits for the computer link instead of connecting to itself (%s)', async (host) => {
  useAgentConnectionStore.setState({ connection: { ...grant, url: `ws://${host}:3847/app` } });
  await renderHook(() => useAgentConnection(true));
  expect(MockSocket.instances).toHaveLength(0);
  expect(useAgentConnectionStore.getState().status).toBe('waiting');
});

test('reports connected only after authentication and answers a health-data-free ping', async () => {
  await renderHook(() => useAgentConnection(true));
  const socket = MockSocket.instances[0];
  await act(() => socket.onopen?.());
  expect(JSON.parse(socket.send.mock.calls[0][0])).toEqual({ type: 'init', nonce: clientNonce });
  expect(useAgentConnectionStore.getState().status).toBe('connecting');
  await act(() => socket.receive({ type: 'ping', id: 'before-auth' }));
  expect(socket.send).toHaveBeenCalledTimes(1);
  await act(() => socket.receive(challenge));
  expect(socket.send).toHaveBeenCalledTimes(2);
  expect(JSON.parse(socket.send.mock.calls[1][0])).toMatchObject({ type: 'hello', nonce, proof: peerProof(grant.token, nonce, 'app', clientNonce) });
  expect(socket.send.mock.calls[1][0]).not.toContain(grant.token);
  await act(() => socket.receive({ type: 'ready' }));
  expect(useAgentConnectionStore.getState().status).toBe('connected');
  await act(() => socket.receive({ type: 'ping', id: 'probe' }));
  expect(JSON.parse(socket.send.mock.calls[2][0])).toEqual({ type: 'result', id: 'probe', result: { ok: true, data: { connected: true } } });
  expect(call).not.toHaveBeenCalled();
});

test.each([['wrong-key', 'wrongKey'], ['app-in-use', 'inUse']])('explains %s and does not retry rejected credentials', async (reason, issue) => {
  await renderHook(() => useAgentConnection(true));
  await act(() => MockSocket.instances[0].onclose?.({ code: 1008, reason }));
  expect(useAgentConnectionStore.getState().issue).toBe(issue);
  await act(() => jest.advanceTimersByTimeAsync(15_000));
  expect(MockSocket.instances).toHaveLength(1);
});

test('suspending the phone closes the session; returning reconnects', async () => {
  await renderHook(() => useAgentConnection(true));
  const first = MockSocket.instances[0];
  await act(() => listener('background'));
  expect(first.close).toHaveBeenCalled();
  expect(useAgentConnectionStore.getState().status).toBe('offline');
  await act(() => listener('active'));
  expect(MockSocket.instances).toHaveLength(2);
});

test('switching browser tabs does not disconnect the desktop agent', async () => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
  await renderHook(() => useAgentConnection(true));
  await act(() => listener('background'));
  expect(MockSocket.instances).toHaveLength(1);
  expect(MockSocket.instances[0].close).not.toHaveBeenCalled();
});

test('a stale socket cannot send a revoked invite or respond after unmount', async () => {
  const screen = await renderHook(() => useAgentConnection(true));
  const socket = MockSocket.instances[0];
  await screen.unmount();
  await act(() => socket.onopen?.());
  await act(() => socket.receive({ type: 'ready' }));
  await act(() => socket.receive({ type: 'ping', id: 'stale' }));
  expect(socket.send).not.toHaveBeenCalled();
});

test.each([{ type: 'ready' }, { ...challenge, proof: 'c'.repeat(64) }])('a spoofed peer cannot connect or receive the invite: %o', async (message) => {
  await renderHook(() => useAgentConnection(true));
  const socket = MockSocket.instances[0];
  await act(() => socket.receive(message));
  expect(socket.close).toHaveBeenCalledWith(1008, 'wrong-key');
  expect(socket.send).not.toHaveBeenCalled();
  expect(useAgentConnectionStore.getState().status).toBe('error');
  expect(bindAgentRPC).not.toHaveBeenCalled();
});

test('automatic discovery selects the peer without a return code and preserves read-only permission', async () => {
  const waiting = { ...grant, url: 'ws://127.0.0.1:3847/app' };
  useAgentConnectionStore.setState({ connection: waiting });
  const configure = jest.spyOn(useAgentConnectionStore.getState(), 'configure').mockResolvedValue(undefined);
  const screen = await renderHook(() => useAgentConnection(true));
  const onPeer = jest.mocked(startPeerDiscovery).mock.calls[0][1];
  await act(() => onPeer([grant.url]));
  expect(configure).toHaveBeenCalledWith({ ...waiting, url: grant.url });
  const stop = jest.mocked(startPeerDiscovery).mock.results[0].value;
  await screen.unmount();
  expect(stop).toHaveBeenCalled();
});
