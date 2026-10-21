import { fireEvent, render } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import { createHash as mockCreateHash } from 'node:crypto';
import type { ReactNode } from 'react';

import { t } from '@/i18n';
import { useAgentConnectionStore } from '@/store/useAgentConnectionStore';
import { ConnectSheet } from './ConnectSheet';

jest.mock('expo-crypto', () => ({ CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  getRandomBytesAsync: async () => new Uint8Array(32).fill(10),
  digestStringAsync: async (_algorithm: string, value: string) => mockCreateHash('sha256').update(value).digest('hex'),
}));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn().mockResolvedValue(undefined), getStringAsync: jest.fn() }));
jest.mock('@/components/atoms/AppIcon', () => ({ AppIcon: () => null }));
jest.mock('../SheetFrame', () => ({ SheetFrame: ({ children }: { children: ReactNode }) => <>{children}</> }));
jest.mock('./AgentAccountPanel', () => ({ AgentAccountPanel: () => null }));
jest.mock('./ApiKeysSheet', () => ({ ProviderKeysForm: () => null }));

beforeEach(() => {
  jest.clearAllMocks();
  useAgentConnectionStore.setState({ connection: null, status: 'offline' });
  jest.spyOn(useAgentConnectionStore.getState(), 'configure').mockImplementation(async (connection) => {
    useAgentConnectionStore.setState({ connection, status: 'connecting' });
  });
});
afterEach(() => { jest.restoreAllMocks(); });

test('main flow has only the requested agents, a ready prompt and no address/key fields', async () => {
  const screen = await render(<ConnectSheet onClose={() => {}} />);
  expect(screen.getAllByRole('radio').map((item) => item.props.accessibilityLabel))
    .toEqual(['Claude', 'ChatGPT', 'Claude Code', 'Codex', 'Gemini', 'MCP']);
  expect(screen.queryByLabelText(t('connect.url'))).toBeNull();
  expect(screen.queryByLabelText(t('connect.key'))).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: t('connect.copyPrompt') }));
  expect(Clipboard.setStringAsync).toHaveBeenCalledWith(expect.stringContaining('GYMNOTES_PAIRING_TOKEN='));
  expect(useAgentConnectionStore.getState().connection).toMatchObject({ allowWrites: false, url: 'ws://127.0.0.1:3847/app' });
  expect(screen.getByRole('button', { name: t('connect.copied') })).toBeTruthy();
});

test('pasting the public handoff pairs a private address without changing permission or secret', async () => {
  const screen = await render(<ConnectSheet onClose={() => {}} />);
  await fireEvent.press(screen.getByRole('button', { name: t('connect.copyPrompt') }));
  const current = useAgentConnectionStore.getState().connection!;
  jest.mocked(Clipboard.getStringAsync).mockResolvedValue(`gymnotes-connect:v1:${JSON.stringify({
    url: 'ws://192.168.1.9:3847/app',
    pairingId: mockCreateHash('sha256').update(`gymnotes-pairing-v1:${current.token}`).digest('hex'),
  })}`);
  await fireEvent.press(screen.getByRole('button', { name: t('connect.pasteConnection') }));
  expect(useAgentConnectionStore.getState().connection).toEqual({ ...current, url: 'ws://192.168.1.9:3847/app' });
});

test('an invalid handoff leaves the active pairing unchanged', async () => {
  const screen = await render(<ConnectSheet onClose={() => {}} />);
  await fireEvent.press(screen.getByRole('button', { name: t('connect.copyPrompt') }));
  const current = useAgentConnectionStore.getState().connection;
  jest.mocked(Clipboard.getStringAsync).mockResolvedValue('invalid');
  await fireEvent.press(screen.getByRole('button', { name: t('connect.pasteConnection') }));
  expect(useAgentConnectionStore.getState().connection).toEqual(current);
  expect(screen.getByText(t('connect.invalidCode'))).toBeTruthy();
});
