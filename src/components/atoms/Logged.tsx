import type { Ref } from 'react';
import {
  Pressable,
  ScrollView,
  TextInput,
  View,
  type PressableProps,
  type ScrollViewProps,
  type TextInputProps,
} from 'react-native';

import { log } from '@/core/log';

/**
 * Drop-in replacements for the raw RN primitives that log as they are used.
 *
 * Swapping `Pressable` → `LoggedPressable` at a call site is the whole change:
 * same props, same children, same ref. The label comes from `accessibilityLabel`
 * — which every button here already sets for the screen reader — so a tap reads
 * as the action it performs, not as pixels. Nothing new to name.
 */

export function LoggedPressable({ onPress, ...rest }: PressableProps & { ref?: Ref<View> }) {
  return (
    <Pressable
      {...rest}
      onPress={(event) => {
        // Best name available: the a11y label, then the hint, then the role —
        // so a button with none at least logs "press(button)" instead of a bare
        // "press" that could be anything on screen.
        const label =
          (typeof rest.accessibilityLabel === 'string' && rest.accessibilityLabel) ||
          (typeof rest.accessibilityHint === 'string' && rest.accessibilityHint) ||
          `press(${rest.accessibilityRole ?? 'unlabeled'})`;
        log.ui(label);
        onPress?.(event);
      }}
    />
  );
}

/**
 * Logs focus, blur, submit — the boundaries — always, and each keystroke only
 * when {@link log}'s verbose firehose is on. Per-letter logging floods the
 * terminal; the boundaries are what you actually want by default.
 */
export function LoggedTextInput({
  label,
  onChangeText,
  onFocus,
  onBlur,
  onSubmitEditing,
  ...rest
}: TextInputProps & { label?: string; ref?: Ref<TextInput> }) {
  const name = label ?? rest.accessibilityLabel ?? rest.placeholder ?? 'input';
  return (
    <TextInput
      {...rest}
      onChangeText={(text) => {
        log.input(`${name}`, { len: text.length });
        onChangeText?.(text);
      }}
      onFocus={(event) => {
        log.ui(`focus ${name}`);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        log.ui(`blur ${name}`);
        onBlur?.(event);
      }}
      onSubmitEditing={(event) => {
        log.ui(`submit ${name}`);
        onSubmitEditing?.(event);
      }}
    />
  );
}

/** Logs scroll offset — verbose only, since it fires every frame. */
export function LoggedScrollView({ label, onScroll, ...rest }: ScrollViewProps & { label?: string }) {
  const name = label ?? 'scroll';
  return (
    <ScrollView
      {...rest}
      scrollEventThrottle={rest.scrollEventThrottle ?? 200}
      onScroll={(event) => {
        log.scroll(name, { y: Math.round(event.nativeEvent.contentOffset.y) });
        onScroll?.(event);
      }}
    />
  );
}
