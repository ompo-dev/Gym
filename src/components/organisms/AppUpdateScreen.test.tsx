import { fireEvent, render } from '@testing-library/react-native';
import { AppUpdateScreen } from './AppUpdateScreen';

jest.mock('@/components/atoms/AppIcon', () => ({ AppIcon: () => null }));

test('uses native download progress and exposes retry and continue actions', async () => {
  const onRetry = jest.fn();
  const onContinue = jest.fn();
  const screen = await render(<AppUpdateScreen phase="downloading" progress={0.42} onRetry={onRetry} onContinue={onContinue} />);
  expect(screen.getByRole('progressbar').props.accessibilityValue.now).toBe(42);
  await screen.rerender(<AppUpdateScreen phase="error" onRetry={onRetry} onContinue={onContinue} />);
  await fireEvent.press(screen.getByRole('button', { name: 'tentar de novo' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Continuar no app' }));
  expect(onRetry).toHaveBeenCalledTimes(1);
  expect(onContinue).toHaveBeenCalledTimes(1);
});

test('cannot dismiss the applying phase and never invents download percentages', async () => {
  const props = { onRetry: jest.fn(), onContinue: jest.fn() };
  const screen = await render(<AppUpdateScreen phase="applying" {...props} />);
  expect(screen.queryAllByRole('button')).toHaveLength(0);
  expect(screen.getByRole('progressbar').props.accessibilityValue.now).toBe(100);
  await screen.rerender(<AppUpdateScreen phase="downloading" {...props} />);
  expect(screen.queryByRole('progressbar')).toBeNull();
});
