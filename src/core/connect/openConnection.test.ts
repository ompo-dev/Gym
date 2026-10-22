import { createHash as mockCreateHash } from 'node:crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { useAgentConnectionStore } from '@/store/useAgentConnectionStore';
import { openAgentConnection } from './openConnection';

jest.mock('expo-crypto', () => ({ CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: async (_algorithm: string, value: string) => mockCreateHash('sha256').update(value).digest('hex'),
}));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));

const originalOS = Platform.OS;
const grant = { url: 'ws://127.0.0.1:3847/app', token: 'a'.repeat(64), allowWrites: false };
const link = `gym://connect?${new URLSearchParams({ url: 'ws://192.168.1.10:3847/app',
  pairingId: mockCreateHash('sha256').update(`gymnotes-pairing-v1:${grant.token}`).digest('hex') })}`;

beforeEach(async () => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null);
  jest.mocked(SecureStore.setItemAsync).mockResolvedValue(undefined);
  jest.mocked(SecureStore.deleteItemAsync).mockResolvedValue(undefined);
  await useAgentConnectionStore.getState().disconnect();
  jest.clearAllMocks();
});
afterEach(() => { Object.defineProperty(Platform, 'OS', { configurable: true, value: originalOS }); });

test('a cold-start phone loads its saved invite before accepting the return link', async () => {
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue(JSON.stringify(grant));
  await openAgentConnection(link);
  expect(useAgentConnectionStore.getState().connection).toEqual({ ...grant, url: 'ws://192.168.1.10:3847/app' });
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith(expect.any(String), JSON.stringify({ ...grant, url: 'ws://192.168.1.10:3847/app' }));
});

test('a public link alone cannot create a grant on another device', async () => {
  await expect(openAgentConnection(link)).rejects.toThrow('connect.missingInvite');
  expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  expect(useAgentConnectionStore.getState().connection).toBeNull();
});

test('revoking the grant while verifying a link cannot restore it', async () => {
  await useAgentConnectionStore.getState().configure(grant);
  const importing = openAgentConnection(link);
  await useAgentConnectionStore.getState().disconnect();
  await expect(importing).rejects.toThrow('connect.invalidCode');
  expect(useAgentConnectionStore.getState().connection).toBeNull();
});
