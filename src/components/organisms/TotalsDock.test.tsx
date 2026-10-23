import { fireEvent, render } from '@testing-library/react-native';
import { View as MockView } from 'react-native';
import type { ReactNode } from 'react';
import { AppText } from '@/components/atoms/AppText';
import { t } from '@/i18n';
import { TotalsDock } from './TotalsDock';

jest.mock('@/components/atoms/GlassSurface', () => ({ GlassSurface: ({ children, ...props }: { children: ReactNode }) => <MockView {...props} testID="totals-glass">{children}</MockView> }));
jest.mock('@/components/atoms/AppIcon', () => ({ AppIcon: () => null }));

test('the same glass expands into interactive details and hides the compact summary', async () => {
  const toggle = jest.fn();
  const height = jest.fn();
  const items = [{ key: 'cal', label: 'Calories', value: '1870', color: '#ff9900' }];
  const screen = await render(<TotalsDock items={items} onPress={toggle} onHeightChange={height}><AppText>Metas de hoje</AppText></TotalsDock>);
  const surface = screen.getByTestId('totals-glass');
  expect(screen.getByRole('button', { name: 'Open totals details' })).toBeTruthy();
  expect(screen.queryByText('Metas de hoje')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Open totals details' }));
  expect(toggle).toHaveBeenCalledTimes(1);
  await screen.rerender(<TotalsDock items={items} expanded onPress={toggle} onHeightChange={height}><AppText>Metas de hoje</AppText></TotalsDock>);
  expect(screen.getAllByTestId('totals-glass')).toHaveLength(1);
  expect(screen.getByTestId('totals-glass')).toBe(surface);
  expect(screen.queryByRole('button', { name: 'Open totals details' })).toBeNull();
  expect(screen.getByText('Metas de hoje')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: t('common.close') }));
  expect(toggle).toHaveBeenCalledTimes(2);
});
