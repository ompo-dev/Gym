import { fireEvent, render } from '@testing-library/react-native';
import { View as MockView } from 'react-native';

import { DayScrollFrame } from './DayScrollFrameFallback';

jest.mock('expo-blur', () => ({ BlurTargetView: MockView }));
jest.mock('@/components/atoms/SoftEdgeBlur', () => ({ SoftEdgeBlur: () => null }));
const mockFrame = { x: 0, y: 0, width: 400, height: 800 };
const mockWindow = { width: 400, height: 800, scale: 2, fontScale: 1 };
jest.mock('react-native', () => new Proxy(jest.requireActual('react-native'), {
  get: (target, key) => key === 'useWindowDimensions' ? () => mockWindow : Reflect.get(target, key),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: MockView,
  useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
  useSafeAreaFrame: () => mockFrame,
}));

beforeEach(() => {
  mockFrame.y = 0;
  mockFrame.height = 800;
});

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

test.each([[0, 750, 800], [30, 720, 770]])('anchors the background to the window bottom (scene y=%i, height=%i)', async (y, height, fullHeight) => {
  mockFrame.y = y;
  mockFrame.height = height;
  const content = jest.fn(() => <MockView />);
  const screen = await render(<DayScrollFrame
    header={<MockView />}
    footer={<MockView testID="footer" />}
    bottomEdgeHeight={54}
  >{content}</DayScrollFrame>);
  // In both cases the old scene ends at 750; the new background ends at 800.
  expect(y + fullHeight).toBe(mockWindow.height);
  expect(screen.getByTestId('day-scroll-frame')).toHaveStyle({ height: fullHeight });
  expect(screen.getByTestId('day-bottom-edge')).toHaveStyle({ bottom: 0, height: 54 });
  expect(screen.getByTestId('day-scroll-controls')).toHaveStyle({ top: 0, bottom: 50 });
  await fireEvent(screen.getByTestId('footer'), 'layout', { nativeEvent: { layout: { height: 410 } } });
  expect(content).toHaveBeenLastCalledWith({ top: 123, bottom: 460 });
  expect(screen.getByTestId('day-scroll-frame')).toHaveStyle({ height: fullHeight });
  expect(screen.getByTestId('day-scroll-controls')).toHaveStyle({ top: 0, bottom: 50 });
});
