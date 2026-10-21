import { act, fireEvent, render } from '@testing-library/react-native';
import * as Updates from 'expo-updates';

import { getAppSettings, setAutomaticUpdates } from '@/core/updates/preferences';
import { checkForOTAUpdateNow, type OTAUpdateCheckResult } from '@/hooks/useOTAUpdates';
import { t } from '@/i18n';
import { DeveloperUpdatesSection } from './DeveloperUpdatesSection';

jest.mock('expo-updates', () => ({ reloadAsync: jest.fn().mockResolvedValue(undefined), runtimeVersion: '1.0.2', channel: 'production' }));
jest.mock('@/hooks/useOTAUpdates', () => ({ checkForOTAUpdateNow: jest.fn() }));
jest.mock('@/core/updates/preferences', () => ({ getAppSettings: jest.fn(), setAutomaticUpdates: jest.fn() }));
jest.mock('@/components/atoms/AppIcon', () => ({ AppIcon: () => null }));
jest.mock('./primitives', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View, Switch } = require('react-native');
  return { Section: View, Divider: () => null,
    Toggle: ({ label, ...props }: { label: string }) => <Switch {...props} accessibilityLabel={label} /> };
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getAppSettings).mockResolvedValue({ automaticUpdates: true });
  jest.mocked(setAutomaticUpdates).mockResolvedValue(undefined);
});

test.each<OTAUpdateCheckResult>([
  { status: 'disabled' }, { status: 'window-inactive' }, { status: 'up-to-date' },
  { status: 'not-applicable', reason: 'runtime-version-mismatch' }, { status: 'error', stage: 'check' },
])('manual check reports $status and never reloads the app', async (result) => {
  jest.mocked(checkForOTAUpdateNow).mockResolvedValue(result);
  const screen = await render(<DeveloperUpdatesSection />);
  await fireEvent.press(screen.getByRole('button', { name: t('updates.checkNow') }));
  expect(checkForOTAUpdateNow).toHaveBeenCalledWith('manual', expect.any(Function), expect.any(Object));
  expect(screen.queryByText(t('updates.apply'))).toBeNull();
  if (result.status === 'not-applicable') expect(screen.getByText(t('updates.newBuild'))).toBeTruthy();
  expect(Updates.reloadAsync).not.toHaveBeenCalled();
});

test('one manual download at a time; applying is a separate explicit action', async () => {
  let finish!: (value: OTAUpdateCheckResult) => void;
  jest.mocked(checkForOTAUpdateNow).mockImplementation(async (_source, _active, progress) => {
    progress?.onDownloading?.();
    return new Promise((resolve) => { finish = resolve; });
  });
  const screen = await render(<DeveloperUpdatesSection />);
  await fireEvent.press(screen.getByRole('button', { name: t('updates.checkNow') }));
  await fireEvent.press(screen.getByRole('button', { name: t('updates.downloading') }));
  expect(checkForOTAUpdateNow).toHaveBeenCalledTimes(1);
  await act(async () => { finish({ status: 'downloaded' }); });
  expect(Updates.reloadAsync).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: t('updates.apply') }));
  expect(Updates.reloadAsync).toHaveBeenCalledTimes(1);
});

test('automatic update preference persists and restores its state on failure', async () => {
  jest.mocked(setAutomaticUpdates).mockRejectedValue(new Error('storage'));
  const screen = await render(<DeveloperUpdatesSection />);
  await fireEvent(screen.getByRole('switch'), 'valueChange', false);
  expect(setAutomaticUpdates).toHaveBeenCalledWith(false);
  expect(screen.getByRole('switch').props.value).toBe(true);
  expect(screen.getByText(t('updates.error'))).toBeTruthy();
});
