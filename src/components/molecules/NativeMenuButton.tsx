import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';

import {
  SwiftHost,
  SwiftMenu,
  swiftButtonBorderShape,
  swiftButtonStyle,
  swiftControlSize,
  swiftLabelStyle,
  swiftTint,
} from '@/components/onboarding/onboardingNative';
import { Spacing } from '@/constants/theme';

interface NativeMenuButtonProps {
  /** SF Symbol shown on the button itself (e.g. "ellipsis", "camera"). */
  systemImage: string;
  /** Accessibility label for the menu trigger. */
  label: string;
  /** Tints the button's symbol; omit for the default glass foreground. */
  tint?: string;
  /** Trailing gap, e.g. when it sits next to a sheet close button. */
  marginRight?: boolean;
  /** The menu's items — SwiftButton / nested SwiftMenu / SwiftDivider. */
  children: ReactNode;
}

/**
 * Circular glass SwiftUI menu button — the sheet's native close-button shape.
 * `buttonBorderShape('circle')` keeps a wide symbol like `ellipsis` from making
 * a flattened capsule; `controlSize('large')` sizes it like a native icon
 * button (a bare frame was ignored by the glass shape and rendered tiny). The
 * Host matches contents so it wraps that natural size. iOS-only: render behind
 * an `IOS_NATIVE_ENABLED` guard, the caller keeps its own RN fallback.
 */
export function NativeMenuButton({
  systemImage,
  label,
  tint,
  marginRight,
  children,
}: NativeMenuButtonProps) {
  return (
    <SwiftHost
      matchContents={{ horizontal: true, vertical: true }}
      style={marginRight ? styles.margin : undefined}>
      <SwiftMenu
        label={label}
        systemImage={systemImage}
        modifiers={[
          swiftButtonStyle?.('glass'),
          swiftButtonBorderShape?.('circle'),
          swiftControlSize?.('large'),
          swiftLabelStyle?.('iconOnly'),
          tint ? swiftTint?.(tint) : undefined,
        ].filter(Boolean)}>
        {children}
      </SwiftMenu>
    </SwiftHost>
  );
}

const styles = StyleSheet.create({
  margin: {
    marginRight: Spacing.two,
  },
});
