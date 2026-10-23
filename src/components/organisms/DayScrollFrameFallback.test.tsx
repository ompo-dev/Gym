import { fireEvent, render } from '@testing-library/react-native';
import { View as MockView } from 'react-native';

import { DayScrollFrame } from './DayScrollFrameFallback';
import { DayScrollFrame as IOSDayScrollFrame } from './DayScrollFrame.ios';

jest.mock('expo-blur', () => ({ BlurTargetView: MockView }));
jest.mock('@/components/atoms/SoftEdgeBlur', () => ({ SoftEdgeBlur: () => null }));
jest.mock('react-native-scroll-edge-bar', () => ({
  ScrollEdgeBar: () => { throw new Error('The native BottomBar must not own the totals or the background edge'); },
}));
const mockFrame = { x: 0, y: 0, width: 400, height: 800 };
const mockWindow = { width: 400, height: 800, scale: 2, fontScale: 1 };
jest.mock('react-native', () => {
  const native = jest.requireActual('react-native');
  const platform = { ...native.Platform, OS: 'ios', Version: 26 };
  const manager = new Proxy(native.UIManager, {
    get: (target, key) => key === 'hasViewManagerConfig' ? () => true : Reflect.get(target, key),
  });
  return new Proxy(native, {
    get: (target, key) => key === 'useWindowDimensions' ? () => mockWindow
      : key === 'Platform' ? platform : key === 'UIManager' ? manager : Reflect.get(target, key),
  });
});
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: MockView,
  useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
  useSafeAreaFrame: () => mockFrame,
}));

beforeEach(() => {
  mockFrame.y = 0;
  mockFrame.height = 800;
});

test('iOS 26 uses the same screen-anchored edges even when the native bar module is installed', async () => {
  mockFrame.height = 750;
  const screen = await render(<IOSDayScrollFrame
    header={<MockView testID="header" />}
    footer={<MockView testID="footer" />}
    bottomEdgeHeight={54}
  >{() => <MockView />}</IOSDayScrollFrame>);
  expect(screen.getByTestId('day-scroll-frame')).toHaveStyle({ height: 800 });
  expect(screen.getByTestId('day-bottom-edge')).toHaveStyle({ bottom: 0, height: 54 });
  await fireEvent(screen.getByTestId('footer'), 'layout', { nativeEvent: { layout: { height: 410 } } });
  expect(screen.getByTestId('day-bottom-edge')).toHaveStyle({ bottom: 0, height: 54 });
  expect(screen.getByTestId('header')).toBeTruthy();
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
