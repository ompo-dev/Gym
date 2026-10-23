import { act, fireEvent, render } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import { createHash as mockCreateHash } from 'node:crypto';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';

import { t } from '@/i18n';
import { Colors } from '@/constants/theme';
import { useAgentConnectionStore } from '@/store/useAgentConnectionStore';
import { ConnectSheet } from './ConnectSheet';
import { AgentAccountPanel } from './AgentAccountPanel';

jest.mock('expo-crypto', () => ({ CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  getRandomBytesAsync: async () => new Uint8Array(32).fill(10),
  digestStringAsync: async (_algorithm: string, value: string) => mockCreateHash('sha256').update(value).digest('hex'),
}));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn().mockResolvedValue(undefined), getStringAsync: jest.fn() }));
jest.mock('@/components/atoms/AppIcon', () => ({ AppIcon: () => null }));
jest.mock('../SheetFrame', () => ({ SheetFrame: ({ children }: { children: ReactNode }) => <>{children}</> }));
jest.mock('./AgentAccountPanel', () => ({ AgentAccountPanel: jest.fn(() => null) }));

const originalOS = Platform.OS;
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(Clipboard.setStringAsync).mockResolvedValue(undefined);
  useAgentConnectionStore.setState({ connection: null, status: 'offline', issue: null });
  jest.spyOn(useAgentConnectionStore.getState(), 'hydrate').mockResolvedValue(undefined);
  jest.spyOn(useAgentConnectionStore.getState(), 'configure').mockImplementation(async (connection) => {
    useAgentConnectionStore.setState({ connection, status: 'connecting' });
  });
});
afterEach(() => {
  jest.restoreAllMocks();
  Object.defineProperty(Platform, 'OS', { configurable: true, value: originalOS });
});

test('main flow has only the requested agents, a ready prompt and no address/key fields', async () => {
  const screen = await render(<ConnectSheet onClose={() => {}} />);
  expect(screen.queryByText(t('connect.accountModels'))).toBeNull();
  expect(screen.queryByText(t('agent.keys'))).toBeNull();
  expect(screen.getAllByRole('radio').map((item) => item.props.accessibilityLabel))
    .toEqual(['Claude', 'ChatGPT', 'Claude Code', 'Codex', 'Gemini', 'MCP']);
  await fireEvent.press(screen.getByRole('radio', { name: 'Codex' }));
  expect(screen.getByRole('radio', { name: 'Codex' })).toBeChecked();
  expect(screen.queryByLabelText(t('connect.url'))).toBeNull();
  expect(screen.queryByLabelText(t('connect.key'))).toBeNull();
  expect(screen.queryByRole('button', { name: t('connect.pasteConnection') })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: t('connect.copyPrompt') }));
  expect(Clipboard.setStringAsync).toHaveBeenCalledWith(expect.stringContaining('GYMNOTES_PAIRING_TOKEN='));
  expect(Clipboard.setStringAsync).toHaveBeenCalledWith(expect.stringContaining('ao codex'));
  expect(useAgentConnectionStore.getState().connection).toMatchObject({ allowWrites: false, url: 'ws://127.0.0.1:3847/app' });
  expect(screen.getByRole('button', { name: t('connect.copied') })).toBeTruthy();
});

test('the paired agent stays green while browsing others and reopening, until disconnected', async () => {
  useAgentConnectionStore.setState({ connection: { url: 'ws://192.168.1.9:3847/app', token: 'a'.repeat(64), allowWrites: false, agent: 'codex' }, status: 'connected' });
  const screen = await render(<ConnectSheet onClose={() => {}} />);
  const connected = screen.getByRole('radio', { name: 'Codex' });
  expect(connected).toHaveStyle({ borderColor: Colors.light.success });
  await fireEvent.press(screen.getByRole('radio', { name: 'Gemini' }));
  expect(connected).toHaveStyle({ borderColor: Colors.light.success });
  await screen.rerender(<ConnectSheet key="reopened" onClose={() => {}} />);
  expect(screen.getByRole('radio', { name: 'Codex' })).toHaveStyle({ borderColor: Colors.light.success });
  await act(() => useAgentConnectionStore.setState({ status: 'offline' }));
  expect(screen.getByRole('radio', { name: 'Codex' })).not.toHaveStyle({ borderColor: Colors.light.success });
});

test('late secure-store hydration reuses the iPhone invitation instead of creating another one', async () => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
  let finish!: () => void;
  jest.mocked(useAgentConnectionStore.getState().hydrate).mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
  const screen = await render(<ConnectSheet onClose={() => {}} />);
  expect(screen.getByRole('button', { name: t('connect.copyPrompt') })).toBeDisabled();
  const saved = { url: 'ws://192.168.1.9:3847/app', token: 'c'.repeat(64), allowWrites: true };
  await act(async () => {
    useAgentConnectionStore.setState({ connection: saved });
    finish();
  });
  await fireEvent.press(screen.getByRole('button', { name: t('connect.copyPrompt') }));
  expect(useAgentConnectionStore.getState().connection).toMatchObject(saved);
  expect(Clipboard.setStringAsync).toHaveBeenCalledWith(expect.stringContaining(`GYMNOTES_PAIRING_TOKEN=${saved.token}`));
  expect(Clipboard.setStringAsync).toHaveBeenCalledWith(expect.stringContaining('reading and creating notes'));
});

test('revocation while saving cannot copy an invalidated native invite', async () => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
  jest.mocked(useAgentConnectionStore.getState().configure).mockImplementation(async () => {
    useAgentConnectionStore.setState({ connection: null, status: 'offline' });
  });
  const screen = await render(<ConnectSheet onClose={() => {}} />);
  await fireEvent.press(screen.getByRole('button', { name: t('connect.copyPrompt') }));
  expect(Clipboard.setStringAsync).not.toHaveBeenCalled();
  expect(screen.getByText(t('common.error'))).toBeTruthy();
});

test('account login is available only after the peer really connects', async () => {
  const screen = await render(<ConnectSheet onClose={() => {}} />);
  expect(screen.queryByText(t('connect.accountModels'))).toBeNull();
  await act(() => useAgentConnectionStore.setState({ status: 'connected' }));
  expect(screen.getByRole('button', { name: t('connect.accountModels') })).toBeTruthy();
  expect(AgentAccountPanel).toHaveBeenCalled();
});

test('pasting the public handoff pairs a private address without changing permission or secret', async () => {
  const screen = await render(<ConnectSheet onClose={() => {}} />);
  await fireEvent.press(screen.getByRole('button', { name: t('connect.copyPrompt') }));
  const current = useAgentConnectionStore.getState().connection!;
  jest.mocked(Clipboard.getStringAsync).mockResolvedValue(`gymnotes-connect:v1:${JSON.stringify({
    url: 'ws://192.168.1.9:3847/app',
    pairingId: mockCreateHash('sha256').update(`gymnotes-pairing-v1:${current.token}`).digest('hex'),
  })}`);
  await fireEvent.press(screen.getByRole('button', { name: t('connect.details') }));
  await fireEvent.press(screen.getByRole('button', { name: t('connect.pasteConnection') }));
  expect(useAgentConnectionStore.getState().connection).toEqual({ ...current, url: 'ws://192.168.1.9:3847/app' });
});

test('an invalid handoff leaves the active pairing unchanged', async () => {
  const screen = await render(<ConnectSheet onClose={() => {}} />);
  await fireEvent.press(screen.getByRole('button', { name: t('connect.copyPrompt') }));
  const current = useAgentConnectionStore.getState().connection;
  jest.mocked(Clipboard.getStringAsync).mockResolvedValue('invalid');
  await fireEvent.press(screen.getByRole('button', { name: t('connect.details') }));
  await fireEvent.press(screen.getByRole('button', { name: t('connect.pasteConnection') }));
  expect(useAgentConnectionStore.getState().connection).toEqual(current);
  expect(screen.getByText(t('connect.invalidCode'))).toBeTruthy();
});

test('iPhone saves the invite before copying the prompt to leave the app', async () => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
  const screen = await render(<ConnectSheet onClose={() => {}} />);
  await fireEvent.press(screen.getByRole('button', { name: t('connect.copyPrompt') }));
  expect(jest.mocked(useAgentConnectionStore.getState().configure).mock.invocationCallOrder[0])
    .toBeLessThan(jest.mocked(Clipboard.setStringAsync).mock.invocationCallOrder[0]);
});

test('a native secure-save failure cannot send an unusable invite to the agent', async () => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
  jest.mocked(useAgentConnectionStore.getState().configure).mockRejectedValueOnce(new Error('secure-store-unavailable'));
  const screen = await render(<ConnectSheet onClose={() => {}} />);
  await fireEvent.press(screen.getByRole('button', { name: t('connect.copyPrompt') }));
  expect(Clipboard.setStringAsync).not.toHaveBeenCalled();
  expect(useAgentConnectionStore.getState().connection).toBeNull();
  expect(screen.getByText(t('common.error'))).toBeTruthy();
});

test('returning through a link cannot be overwritten by the modal stale loopback address', async () => {
  const screen = await render(<ConnectSheet onClose={() => {}} />);
  await fireEvent.press(screen.getByRole('button', { name: t('connect.copyPrompt') }));
  const current = useAgentConnectionStore.getState().connection!;
  const next = { ...current, url: 'ws://192.168.1.9:3847/app' };
  await act(() => useAgentConnectionStore.setState({ connection: next, status: 'connected' }));
  jest.mocked(useAgentConnectionStore.getState().configure).mockClear();
  await fireEvent.press(screen.getByRole('button', { name: t('connect.copied') }));
  expect(useAgentConnectionStore.getState().configure).not.toHaveBeenCalled();
  expect(useAgentConnectionStore.getState().connection).toEqual(next);
});
