import { act, renderHook } from '@testing-library/react-native';
import { useLinkingURL } from 'expo-linking';
import { router } from 'expo-router';

import { openAgentConnection } from '@/core/connect/openConnection';
import { useAppModalStore } from '@/store/useAppModalStore';
import { useAgentConnectionStore } from '@/store/useAgentConnectionStore';
import { useAgentConnectionLink } from './useAgentConnectionLink';

jest.mock('expo-linking', () => ({ useLinkingURL: jest.fn() }));
jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }));
jest.mock('@/core/connect/openConnection', () => ({ openAgentConnection: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks();
  useAppModalStore.setState({ stack: [] });
  useAgentConnectionStore.setState({ connection: null, status: 'offline', issue: null });
  jest.mocked(openAgentConnection).mockResolvedValue(undefined);
  jest.mocked(useLinkingURL).mockReturnValue('gym://connect?url=ws%3A%2F%2F192.168.1.10%3A3847%2Fapp&pairingId=public');
});

test('waits for startup then opens the unified connection modal once', async () => {
  const screen = await renderHook((ready) => useAgentConnectionLink(ready), { initialProps: false });
  expect(openAgentConnection).not.toHaveBeenCalled();
  await screen.rerender(true);
  expect(openAgentConnection).toHaveBeenCalledTimes(1);
  expect(router.replace).toHaveBeenCalledWith('/');
  expect(useAppModalStore.getState().stack).toEqual([{ id: 'settings.root', domain: 'food' }, { id: 'settings.connect', domain: 'food' }]);
  await screen.rerender(true);
  expect(openAgentConnection).toHaveBeenCalledTimes(1);
});

test('does not duplicate an already open connection modal', async () => {
  const stack = [{ id: 'settings.root', domain: 'workout' }, { id: 'settings.connect', domain: 'workout' }] as const;
  useAppModalStore.setState({ stack: [...stack] });
  await renderHook(() => useAgentConnectionLink(true));
  expect(useAppModalStore.getState().stack).toEqual(stack);
});

test.each(['missingInvite', 'invalidCode', 'wrongInvite'])('shows a useful error for %s without granting access', async (error) => {
  jest.mocked(openAgentConnection).mockRejectedValue(new Error(`connect.${error}`));
  await renderHook(() => useAgentConnectionLink(true));
  expect(useAgentConnectionStore.getState().issue).toBe(error);
  expect(useAgentConnectionStore.getState().connection).toBeNull();
  expect(useAppModalStore.getState().stack.at(-1)?.id).toBe('settings.connect');
});

test('unrelated links and late unmounted results do not open settings', async () => {
  jest.mocked(useLinkingURL).mockReturnValue('gym://add?text=banana');
  const screen = await renderHook(() => useAgentConnectionLink(true));
  expect(openAgentConnection).not.toHaveBeenCalled();
  let finish!: () => void;
  jest.mocked(openAgentConnection).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  jest.mocked(useLinkingURL).mockReturnValue('gym://connect');
  await screen.rerender(undefined);
  await screen.unmount();
  await act(() => finish());
  expect(router.replace).not.toHaveBeenCalled();
  expect(useAppModalStore.getState().stack).toEqual([]);
});
