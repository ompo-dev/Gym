import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { useAgentConnectionStore } from './useAgentConnectionStore';

jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));
const connection = { url: 'ws://127.0.0.1:3847/app', token: 'a'.repeat(64), allowWrites: false };
const originalOS = Platform.OS;
beforeEach(async () => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null);
  jest.mocked(SecureStore.setItemAsync).mockResolvedValue(undefined);
  jest.mocked(SecureStore.deleteItemAsync).mockResolvedValue(undefined);
  await useAgentConnectionStore.getState().disconnect();
  jest.clearAllMocks();
});
afterEach(() => { Object.defineProperty(Platform, 'OS', { configurable: true, value: originalOS }); });
test('native pairing uses secure storage, disconnect clears it', async () => {
  await useAgentConnectionStore.getState().configure(connection);
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith(expect.any(String), JSON.stringify(connection));
  expect(useAgentConnectionStore.getState().connection).toEqual(connection);
  await useAgentConnectionStore.getState().disconnect();
  expect(useAgentConnectionStore.getState().connection).toBeNull();
  expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
});
test('browser pairing is never persisted', async () => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
  await useAgentConnectionStore.getState().configure(connection);
  expect(useAgentConnectionStore.getState().connection).toEqual(connection);
  expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
});
test('late hydration cannot resurrect a revoked grant', async () => {
  let finish!: (value: string) => void;
  jest.mocked(SecureStore.getItemAsync).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  const hydration = useAgentConnectionStore.getState().hydrate();
  await useAgentConnectionStore.getState().disconnect();
  finish(JSON.stringify(connection));
  await hydration;
  expect(useAgentConnectionStore.getState().connection).toBeNull();
});
test('disconnect during a pending save deletes the key after that save', async () => {
  let finish!: () => void;
  jest.mocked(SecureStore.setItemAsync).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const saving = useAgentConnectionStore.getState().configure(connection);
  await new Promise((resolve) => setImmediate(resolve));
  const disconnecting = useAgentConnectionStore.getState().disconnect();
  finish();
  await saving;
  await disconnecting;
  expect(useAgentConnectionStore.getState().connection).toBeNull();
  expect(SecureStore.deleteItemAsync.mock.invocationCallOrder[0]).toBeGreaterThan(SecureStore.setItemAsync.mock.invocationCallOrder[0]);
});
