import { type RefObject, useCallback, useEffect, useRef } from 'react';
import {
  type FlatList,
  Keyboard,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  TextInput,
  type View,
} from 'react-native';

import { Metrics, Spacing } from '@/constants/theme';

type FocusedInput = ReturnType<typeof TextInput.State.currentlyFocusedInput>;

export function useFocusedNoteScroll<T>(
  containerRef: RefObject<View | null>,
  listRef: RefObject<FlatList<T> | null>,
  insets?: { top: number; bottom: number },
) {
  const input = useRef<FocusedInput>(null);
  const offset = useRef(0);
  const maxOffset = useRef(Number.POSITIVE_INFINITY);
  const keyboardTop = useRef<number | null>(null);
  const dragging = useRef(false);
  const momentum = useRef(false);
  const mounted = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestInsets = useRef(insets);
  useEffect(() => { latestInsets.current = insets; }, [insets]);

  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const centerFocused = useCallback((animated = true) => {
    const focused = input.current;
    const isCurrent = () => mounted.current && focused != null &&
      focused === input.current && focused === TextInput.State.currentlyFocusedInput();
    if (!isCurrent() || dragging.current || momentum.current) return;
    containerRef.current?.measureInWindow((_x, viewportY, _width, viewportHeight) => {
      if (!isCurrent() || viewportHeight <= 0) return;
      focused!.measureInWindow((_inputX, inputY, _inputWidth, inputHeight) => {
        if (!isCurrent() || dragging.current || momentum.current || inputHeight <= 0) return;
        const top = viewportY + (latestInsets.current?.top ?? 0) + Spacing.four;
        const bottom = keyboardTop.current === null
          ? viewportY + viewportHeight - (latestInsets.current?.bottom ?? 0)
          : Math.min(viewportY + viewportHeight, keyboardTop.current) - Metrics.dockButton - Spacing.two;
        if (bottom <= top) return;
        const nextOffset = Math.min(maxOffset.current,
          Math.max(0, offset.current + inputY + inputHeight / 2 - (top + bottom) / 2));
        if (Math.abs(nextOffset - offset.current) < 8) return;
        // Always measure again: screen coordinates change after a manual scroll.
        listRef.current?.scrollToOffset({ offset: nextOffset, animated });
      });
    });
  }, [containerRef, listRef]);

  const schedule = useCallback((delay: number) => {
    cancel();
    timer.current = setTimeout(() => {
      timer.current = null;
      centerFocused();
    }, delay);
  }, [cancel, centerFocused]);

  const onFocusLine = useCallback(() => {
    input.current = TextInput.State.currentlyFocusedInput();
    schedule(32);
  }, [schedule]);

  const onScrollBeginDrag = useCallback(() => {
    cancel();
    dragging.current = true;
  }, [cancel]);

  const onScrollEndDrag = useCallback(() => {
    dragging.current = false;
    schedule(800);
  }, [schedule]);

  const onMomentumScrollBegin = useCallback(() => {
    cancel();
    momentum.current = true;
  }, [cancel]);

  const onMomentumScrollEnd = useCallback(() => {
    momentum.current = false;
    schedule(800);
  }, [schedule]);

  const onScroll = useCallback(({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
    const changed = Math.abs(offset.current - nativeEvent.contentOffset.y) > 0.5;
    offset.current = nativeEvent.contentOffset.y;
    maxOffset.current = Math.max(0, nativeEvent.contentSize.height + nativeEvent.contentInset.bottom -
      nativeEvent.layoutMeasurement.height);
    // Also handles mouse wheels on web, which do not emit native drag events.
    if (changed && !dragging.current && !momentum.current) schedule(800);
  }, [schedule]);

  useEffect(() => {
    mounted.current = true;
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const show = Keyboard.addListener(showEvent, ({ endCoordinates }) => {
      keyboardTop.current = endCoordinates.screenY;
      centerFocused();
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      keyboardTop.current = null;
      centerFocused(false);
    });
    return () => {
      mounted.current = false;
      cancel();
      show.remove();
      hide.remove();
    };
  }, [cancel, centerFocused]);

  return {
    centerFocused,
    onFocusLine,
    scrollHandlers: { onScroll, onScrollBeginDrag, onScrollEndDrag, onMomentumScrollBegin, onMomentumScrollEnd },
  };
}
