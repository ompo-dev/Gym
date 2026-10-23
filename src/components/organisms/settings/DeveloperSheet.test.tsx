import { fireEvent, render } from '@testing-library/react-native';
import { Alert, View as MockView } from 'react-native';
import type { ReactNode } from 'react';
import * as Clipboard from 'expo-clipboard';
import { clearLogBuffer, formatLogs, log, logConfig } from '@/core/log';
import { DeveloperSheet } from './DeveloperSheet';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn().mockResolvedValue(true) }));
jest.mock('@/components/atoms/AppIcon', () => ({ AppIcon: () => null }));
jest.mock('@/core/notifications/reminders', () => ({ slotLabel: (value: string) => value }));
jest.mock('./DeveloperUpdatesSection', () => ({ DeveloperUpdatesSection: () => null }));
jest.mock('./primitives', () => ({
  PageSheet: ({ children }: { children: ReactNode }) => <MockView>{children}</MockView>,
  Section: ({ children }: { children: ReactNode }) => <MockView>{children}</MockView>,
  Divider: () => null, Toggle: () => null,
}));

beforeEach(() => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.mocked(Clipboard.setStringAsync).mockResolvedValue(true);
  logConfig.capture = true;
  clearLogBuffer();
  for (let i = 0; i < 500; i++) log.media(`photo.${i}`, { count: i });
});
afterEach(() => jest.restoreAllMocks());

test('copy logs writes all 500 events to the real clipboard API', async () => {
  const screen = await render(<DeveloperSheet visible onClose={() => {}} />);
  await fireEvent.press(screen.getByText('Copiar tudo'));
  expect(Clipboard.setStringAsync).toHaveBeenCalledWith(expect.stringContaining('photo.499'));
  const copied = jest.mocked(Clipboard.setStringAsync).mock.calls.at(-1)![0];
  expect(copied.split('\n')).toHaveLength(500);
  expect(copied.length).toBeGreaterThan(4000);
});

test('clipboard rejection reports failure and the selectable viewer remains available', async () => {
  jest.mocked(Clipboard.setStringAsync).mockRejectedValueOnce(new Error('denied'));
  const screen = await render(<DeveloperSheet visible onClose={() => {}} />);
  await fireEvent.press(screen.getByText('Copiar tudo'));
  expect(Alert.alert).toHaveBeenCalledWith('Erro', expect.any(String));
  await fireEvent.press(screen.getByText('Ver logs'));
  expect(screen.getByText(formatLogs()).props.selectable).toBe(true);
});
