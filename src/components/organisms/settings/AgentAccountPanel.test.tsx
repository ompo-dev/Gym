import { act, fireEvent, render } from '@testing-library/react-native';

import { requestAgent } from '@/core/connect/agentRPC';
import { t } from '@/i18n';
import { useAgentConnectionStore } from '@/store/useAgentConnectionStore';
import { useAgentSettingsStore } from '@/store/useAgentSettingsStore';
import { AgentAccountPanel } from './AgentAccountPanel';

jest.mock('@/core/connect/agentRPC', () => ({ requestAgent: jest.fn() }));
jest.mock('@/data/SettingsRepository', () => ({ SettingsRepository: { get: async () => null, set: async () => {} } }));
jest.mock('@/components/atoms/AppIcon', () => ({ AppIcon: () => null }));

const signedOut = { provider: 'codex', authenticated: false, imageSupported: true,
  authMethods: [{ id: 'chat-gpt', name: 'ChatGPT' }], options: [] };
const signedIn = { ...signedOut, authenticated: true, options: [
  { id: 'model', name: 'Model', type: 'select', category: 'model', currentValue: 'a', options: [{ value: 'a', name: 'A' }] },
  { id: 'effort', name: 'Effort', type: 'select', category: 'thought_level', currentValue: 'high', options: [{ value: 'high', name: 'High' }] },
] };
const prepare = async () => {
  useAgentConnectionStore.setState({ connection: { url: 'ws://127.0.0.1:3847/app', token: 'a'.repeat(64), allowWrites: false }, status: 'connecting' });
  return true;
};

beforeEach(() => {
  jest.clearAllMocks();
  useAgentSettingsStore.getState().reset();
  useAgentConnectionStore.setState({ connection: null, status: 'offline', authenticating: false });
});

test('offline sign-in prepares the prompt, then signs in once pairing completes', async () => {
  const onPrepare = jest.fn(prepare);
  jest.mocked(requestAgent).mockResolvedValueOnce(signedOut).mockResolvedValueOnce(signedIn);
  const screen = await render(<AgentAccountPanel provider="codex" onPrepare={onPrepare} />);
  await fireEvent.press(screen.getByRole('button', { name: /ChatGPT \/ Codex/ }));
  expect(onPrepare).toHaveBeenCalledTimes(1);
  expect(requestAgent).not.toHaveBeenCalled();
  await act(async () => { useAgentConnectionStore.setState({ status: 'connected' }); });
  expect(requestAgent).toHaveBeenCalledTimes(2);
  expect(requestAgent).toHaveBeenLastCalledWith({ provider: 'codex', action: 'authenticate', methodId: 'chat-gpt' }, expect.any(AbortSignal));
  expect(screen.getByText(t('agent.authenticated'))).toBeTruthy();
  expect(screen.getByText('Effort')).toBeTruthy();
  expect(useAgentSettingsStore.getState()).toMatchObject({
    text: { provider: 'codex', choices: { model: 'a', effort: 'high' } },
    vision: { provider: 'codex', choices: { model: 'a', effort: 'high' } },
  });
});

test('canceling a queued login does not authenticate when the bridge later connects', async () => {
  const screen = await render(<AgentAccountPanel provider="codex" onPrepare={prepare} />);
  await fireEvent.press(screen.getByRole('button', { name: /ChatGPT \/ Codex/ }));
  await fireEvent.press(screen.getByRole('button', { name: t('common.cancel') }));
  await act(async () => { useAgentConnectionStore.setState({ status: 'connected' }); });
  expect(requestAgent).not.toHaveBeenCalled();
});

test('an already authenticated account loads its real options without signing in again', async () => {
  useAgentConnectionStore.setState({ status: 'connected' });
  jest.mocked(requestAgent).mockResolvedValue(signedIn);
  const screen = await render(<AgentAccountPanel provider="codex" onPrepare={async () => true} />);
  await fireEvent.press(screen.getByRole('button', { name: /ChatGPT \/ Codex/ }));
  expect(requestAgent).toHaveBeenCalledTimes(1);
  expect(useAgentSettingsStore.getState().text).toEqual({ provider: 'codex', choices: { model: 'a', effort: 'high' } });
});

test('canceling authentication ignores a late successful reply without configuring an account', async () => {
  useAgentConnectionStore.setState({ status: 'connected' });
  let finish!: (value: unknown) => void;
  jest.mocked(requestAgent).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const screen = await render(<AgentAccountPanel provider="codex" onPrepare={prepare} />);
  await fireEvent.press(screen.getByRole('button', { name: /ChatGPT \/ Codex/ }));
  await fireEvent.press(screen.getByRole('button', { name: t('common.cancel') }));
  await act(async () => { finish(signedIn); });
  expect(useAgentSettingsStore.getState()).toMatchObject({ text: null, vision: null });
});

test('disconnecting the app revokes a queued sign-in', async () => {
  const screen = await render(<AgentAccountPanel provider="codex" onPrepare={prepare} />);
  await fireEvent.press(screen.getByRole('button', { name: /ChatGPT \/ Codex/ }));
  await act(async () => { useAgentConnectionStore.setState({ connection: null, status: 'offline' }); });
  expect(screen.queryByText(t('agent.wait'))).toBeNull();
  await act(async () => { useAgentConnectionStore.setState({ status: 'connected' }); });
  expect(requestAgent).not.toHaveBeenCalled();
});
