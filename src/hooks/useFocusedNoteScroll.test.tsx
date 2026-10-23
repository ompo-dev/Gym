import { act, renderHook } from '@testing-library/react-native';
import { Keyboard, type NativeScrollEvent, type NativeSyntheticEvent, Platform, TextInput } from 'react-native';

import { useFocusedNoteScroll } from './useFocusedNoteScroll';

type Input = NonNullable<ReturnType<typeof TextInput.State.currentlyFocusedInput>>;

const scrollEvent = (y: number, contentHeight = 2000) => ({ nativeEvent: {
  contentOffset: { x: 0, y },
  contentSize: { width: 400, height: contentHeight },
  contentInset: { top: 0, bottom: 0, left: 0, right: 0 },
  layoutMeasurement: { width: 400, height: 800 },
} }) as NativeSyntheticEvent<NativeScrollEvent>;

let currentInput: Input | null;
let inputY: number;
let measuredInput: Input;
const scrollToOffset = jest.fn();
const listeners = new Map<string, (event: any) => void>();
const containerRef = { current: { measureInWindow: (callback: Function) => callback(0, 0, 400, 800) } };
const listRef = { current: { scrollToOffset } };

const setup = () => renderHook(() => useFocusedNoteScroll(
  containerRef as any, listRef as any, { top: 80, bottom: 100 },
));
const advance = async (ms: number) => act(async () => { jest.advanceTimersByTime(ms); });

beforeEach(() => {
  jest.useFakeTimers();
  scrollToOffset.mockClear();
  inputY = 600;
  measuredInput = { measureInWindow: jest.fn((callback: Function) => callback(0, inputY, 200, 40)) } as unknown as Input;
  currentInput = measuredInput;
  jest.spyOn(TextInput.State, 'currentlyFocusedInput').mockImplementation(() => currentInput);
  listeners.clear();
  jest.spyOn(Keyboard, 'addListener').mockImplementation((event, callback) => {
    listeners.set(event, callback);
    return { remove: () => listeners.delete(event) } as any;
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('centers the focused food or workout input between the header and dock', async () => {
  const { result } = await setup();
  result.current.onFocusLine();
  await advance(32);
  expect(scrollToOffset).toHaveBeenLastCalledWith({ offset: 222, animated: true });
});

test('waits 800ms after scrolling and measures the current position, not the old one', async () => {
  const { result } = await setup();
  result.current.onFocusLine();
  await advance(32);
  scrollToOffset.mockClear();
  const handlers = result.current.scrollHandlers;
  handlers.onScrollBeginDrag();
  inputY = 100;
  handlers.onScroll(scrollEvent(500));
  handlers.onScrollEndDrag();
  await advance(799);
  expect(scrollToOffset).not.toHaveBeenCalled();
  await advance(1);
  expect(scrollToOffset).toHaveBeenCalledWith({ offset: 222, animated: true });
  expect(measuredInput.measureInWindow).toHaveBeenCalledTimes(2);
});

test('does not interrupt a held drag or momentum, and restarts the idle delay', async () => {
  const { result } = await setup();
  result.current.onFocusLine();
  await advance(32);
  scrollToOffset.mockClear();
  const handlers = result.current.scrollHandlers;
  handlers.onScrollBeginDrag();
  handlers.onScroll(scrollEvent(500));
  await advance(2000);
  expect(scrollToOffset).not.toHaveBeenCalled();
  handlers.onScrollEndDrag();
  await advance(100);
  handlers.onMomentumScrollBegin();
  await advance(2000);
  expect(scrollToOffset).not.toHaveBeenCalled();
  inputY = 100;
  handlers.onMomentumScrollEnd();
  await advance(799);
  expect(scrollToOffset).not.toHaveBeenCalled();
  await advance(1);
  expect(scrollToOffset).toHaveBeenCalledTimes(1);
});

test('debounces wheel scrolling without native drag events', async () => {
  const { result } = await setup();
  result.current.onFocusLine();
  await advance(32);
  scrollToOffset.mockClear();
  inputY = 100;
  result.current.scrollHandlers.onScroll(scrollEvent(500));
  await advance(600);
  result.current.scrollHandlers.onScroll(scrollEvent(520));
  await advance(799);
  expect(scrollToOffset).not.toHaveBeenCalled();
  await advance(1);
  expect(scrollToOffset).toHaveBeenCalledTimes(1);
});

test.each(['blurred', 'another field'] as const)('does not scroll if the input is %s', async (next) => {
  const { result } = await setup();
  result.current.onFocusLine();
  await advance(32);
  scrollToOffset.mockClear();
  result.current.scrollHandlers.onScroll(scrollEvent(500));
  currentInput = next === 'blurred' ? null : {} as Input;
  await advance(800);
  expect(scrollToOffset).not.toHaveBeenCalled();
});

test('uses the keyboard frame and leaves room for its toolbar', async () => {
  const { result } = await setup();
  result.current.onFocusLine();
  await advance(32);
  scrollToOffset.mockClear();
  const event = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
  listeners.get(event)!({ endCoordinates: { screenY: 500 } });
  expect(scrollToOffset).toHaveBeenCalledWith({ offset: 350, animated: true });
});

test('clamps to scrollable bounds instead of repeating an impossible scroll', async () => {
  const { result } = await setup();
  result.current.onFocusLine();
  result.current.scrollHandlers.onScroll(scrollEvent(100, 950));
  await advance(800);
  expect(scrollToOffset).toHaveBeenLastCalledWith({ offset: 150, animated: true });
  scrollToOffset.mockClear();
  result.current.scrollHandlers.onScroll(scrollEvent(150, 950));
  await advance(800);
  expect(scrollToOffset).not.toHaveBeenCalled();
});

test('cancels pending work when the list unmounts', async () => {
  const { result, unmount } = await setup();
  result.current.onFocusLine();
  await unmount();
  await advance(800);
  expect(scrollToOffset).not.toHaveBeenCalled();
});
