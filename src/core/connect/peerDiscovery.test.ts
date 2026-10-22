import { createHash as mockCreateHash } from 'node:crypto';
import { NativeModules } from 'react-native';
import Zeroconf from 'react-native-zeroconf';
import { startPeerDiscovery } from './peerDiscovery.native';

jest.mock('react-native-zeroconf', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('expo-network', () => ({ getIpAddressAsync: async () => '192.168.1.15' }));
jest.mock('expo-crypto', () => ({ CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: async (_algorithm: string, value: string) => mockCreateHash('sha256').update(value).digest('hex'),
}));

const token = 'a'.repeat(64);
const pairingId = mockCreateHash('sha256').update(`gymnotes-pairing-v1:${token}`).digest('hex');
const original = Object.getOwnPropertyDescriptor(NativeModules, 'RNZeroconf');
const listeners = new Map<string, (event: unknown) => void>();
const browser = { on: jest.fn((name, callback) => { listeners.set(name, callback); }), scan: jest.fn(), stop: jest.fn(),
  removeDeviceListeners: jest.fn(), removeAllListeners: jest.fn(), checkLocalNetworkAccess: jest.fn() };
const flush = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  jest.clearAllMocks();
  listeners.clear();
  Object.defineProperty(NativeModules, 'RNZeroconf', { configurable: true, value: {} });
  browser.checkLocalNetworkAccess.mockResolvedValue('granted');
  jest.mocked(Zeroconf).mockImplementation(() => browser as unknown as Zeroconf);
});
afterEach(() => {
  if (original) Object.defineProperty(NativeModules, 'RNZeroconf', original);
  else delete NativeModules.RNZeroconf;
});

test('browses only GymNotes, matches this invite and releases native discovery on stop', async () => {
  const peer = jest.fn();
  const error = jest.fn();
  const stop = startPeerDiscovery(token, peer, error);
  await flush();
  expect(browser.scan).toHaveBeenCalledWith({ type: 'gymnotes', protocol: 'tcp', domain: 'local.' });
  listeners.get('resolved')?.({ port: 3847, addresses: ['192.168.1.7'], txt: { pairingId, protocol: '2' } });
  expect(peer).toHaveBeenCalledWith(['ws://192.168.1.7:3847/app']);
  stop();
  expect(browser.stop).toHaveBeenCalled();
  expect(browser.removeDeviceListeners).toHaveBeenCalled();
  expect(browser.removeAllListeners).toHaveBeenCalled();
  expect(error).not.toHaveBeenCalled();
});

test('missing native support offers a build upgrade without crashing the app', () => {
  Object.defineProperty(NativeModules, 'RNZeroconf', { configurable: true, value: undefined });
  const error = jest.fn();
  startPeerDiscovery(token, jest.fn(), error)();
  expect(error).toHaveBeenCalledWith('upgradeRequired');
  expect(Zeroconf).not.toHaveBeenCalled();
});

test('a denied local permission does not start discovery or create a connection', async () => {
  browser.checkLocalNetworkAccess.mockResolvedValue('denied');
  const peer = jest.fn();
  const error = jest.fn();
  const stop = startPeerDiscovery(token, peer, error);
  await flush();
  expect(error).toHaveBeenCalledWith('localPermission');
  expect(browser.scan).not.toHaveBeenCalled();
  expect(peer).not.toHaveBeenCalled();
  stop();
});

test('backgrounding before async initialization cannot leave a discovery browser running', async () => {
  startPeerDiscovery(token, jest.fn(), jest.fn())();
  await flush();
  expect(Zeroconf).not.toHaveBeenCalled();
});
