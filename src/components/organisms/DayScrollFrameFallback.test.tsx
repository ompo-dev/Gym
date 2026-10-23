import { fireEvent, render } from '@testing-library/react-native';
import { View as MockView } from 'react-native';

import { DayScrollFrame } from './DayScrollFrameFallback';

jest.mock('expo-blur', () => ({ BlurTargetView: MockView }));
jest.mock('@/components/atoms/SoftEdgeBlur', () => ({ SoftEdgeBlur: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: MockView,
  useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
}));

test('the bottom edge stays fixed below the totals when their panel expands', async () => {
  const content = jest.fn(() => <MockView />);
  const screen = await render(<DayScrollFrame
    header={<MockView />}
    footer={<MockView testID="footer" />}
    bottomEdgeHeight={54}
  >{content}</DayScrollFrame>);
  const edge = screen.getByTestId('day-bottom-edge');
  expect(edge).toHaveStyle({ position: 'absolute', bottom: 0, height: 54 });
  await fireEvent(screen.getByTestId('footer'), 'layout', { nativeEvent: { layout: { height: 410 } } });
  expect(content).toHaveBeenLastCalledWith({ top: 123, bottom: 410 });
  expect(edge).toHaveStyle({ bottom: 0, height: 54 });
  await fireEvent(screen.getByTestId('footer'), 'layout', { nativeEvent: { layout: { height: 110 } } });
  expect(content).toHaveBeenLastCalledWith({ top: 123, bottom: 110 });
  expect(edge).toHaveStyle({ bottom: 0, height: 54 });
});
