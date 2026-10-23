import { SettingsRepository } from '@/data/SettingsRepository';

import { useAgentSettingsStore, type AgentState } from './useAgentSettingsStore';

jest.mock('@/data/SettingsRepository', () => ({ SettingsRepository: { get: jest.fn(), set: jest.fn() } }));
beforeEach(() => {
  useAgentSettingsStore.getState().reset();
  jest.mocked(SettingsRepository.get).mockReset().mockResolvedValue(null);
  jest.mocked(SettingsRepository.set).mockReset().mockResolvedValue(undefined);
});
test('saving text keeps the previously saved image agent, without credentials', async () => {
  jest.mocked(SettingsRepository.get).mockResolvedValue(JSON.stringify({ text: null,
    vision: { provider: 'gemini', choices: { model: 'vision-model' } } }));
  useAgentSettingsStore.setState({ loaded: false });
  await useAgentSettingsStore.getState().bind('text', { provider: 'codex', choices: { model: 'text-model', effort: 'high' } });
  const state = useAgentSettingsStore.getState();
  expect(state.vision?.provider).toBe('gemini');
  expect(state.text?.choices.effort).toBe('high');
  const written = JSON.parse(jest.mocked(SettingsRepository.set).mock.calls.at(-1)![1]);
  expect(Object.keys(written)).toEqual(['text', 'vision']);
  expect(JSON.stringify(written)).not.toMatch(/token|apiKey|password/);
});
test('concurrent text and image choices serialize instead of overwriting each other', async () => {
  await Promise.all([
    useAgentSettingsStore.getState().bind('text', { provider: 'codex', choices: {} }),
    useAgentSettingsStore.getState().bind('vision', { provider: 'gemini', choices: {} }),
  ]);
  expect(useAgentSettingsStore.getState()).toMatchObject({ text: { provider: 'codex' }, vision: { provider: 'gemini' } });
  await useAgentSettingsStore.getState().unbind('codex');
  expect(useAgentSettingsStore.getState()).toMatchObject({ text: null, vision: { provider: 'gemini' } });
});
test('reset cannot be undone by a late preference write', async () => {
  let finish!: () => void;
  jest.mocked(SettingsRepository.set).mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
  const writing = useAgentSettingsStore.getState().bind('text', { provider: 'codex', choices: {} });
  await new Promise((resolve) => setImmediate(resolve));
  useAgentSettingsStore.getState().reset(); finish(); await writing;
  expect(useAgentSettingsStore.getState().text).toBeNull();
});

const account: AgentState = { provider: 'codex', authenticated: true, imageSupported: true, authMethods: [], options: [
  { id: 'model', name: 'Model', type: 'select', category: 'model', currentValue: 'real-account-model' },
] };

test('login configures unassigned text and image roles together using only real account options', async () => {
  await useAgentSettingsStore.getState().configureAccount(account);
  expect(useAgentSettingsStore.getState()).toMatchObject({
    text: { provider: 'codex', choices: { model: 'real-account-model' } },
    vision: { provider: 'codex', choices: { model: 'real-account-model' } },
  });
  expect(SettingsRepository.set).toHaveBeenCalledTimes(1);
});

test('login does not replace existing roles or saved model choices', async () => {
  await useAgentSettingsStore.getState().bind('text', { provider: 'codex', choices: { model: 'my-model' } });
  await useAgentSettingsStore.getState().bind('vision', { provider: 'gemini', choices: { model: 'my-vision' } });
  await useAgentSettingsStore.getState().configureAccount(account);
  expect(useAgentSettingsStore.getState()).toMatchObject({
    text: { provider: 'codex', choices: { model: 'my-model' } },
    vision: { provider: 'gemini', choices: { model: 'my-vision' } },
  });
});

test('changing account options updates only its own roles', async () => {
  await useAgentSettingsStore.getState().bind('text', { provider: 'codex', choices: { model: 'old-model' } });
  await useAgentSettingsStore.getState().bind('vision', { provider: 'gemini', choices: {} });
  await useAgentSettingsStore.getState().configureAccount(account, true);
  expect(useAgentSettingsStore.getState()).toMatchObject({
    text: { provider: 'codex', choices: { model: 'real-account-model' } }, vision: { provider: 'gemini' },
  });
});

test('a text-only account never becomes the image agent', async () => {
  await useAgentSettingsStore.getState().configureAccount({ ...account, imageSupported: false });
  expect(useAgentSettingsStore.getState()).toMatchObject({ text: { provider: 'codex' }, vision: null });
});

test('signed-out metadata cannot enable an agent', async () => {
  await useAgentSettingsStore.getState().configureAccount({ ...account, authenticated: false });
  expect(useAgentSettingsStore.getState()).toMatchObject({ text: null, vision: null });
  expect(SettingsRepository.set).not.toHaveBeenCalled();
});
