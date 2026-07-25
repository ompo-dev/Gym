import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';

import {
  SwiftHost,
  SwiftMenu,
  swiftButtonBorderShape,
  swiftButtonStyle,
  swiftControlSize,
  swiftFrame,
  swiftLabelStyle,
  swiftTint,
} from '@/components/onboarding/onboardingNative';
import { Metrics, Spacing } from '@/constants/theme';

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
 * Circular glass SwiftUI menu button, sized to match the sheet's RN close
 * button (a `Metrics.iconButton` glass circle). The size recipe, tuned on
 * device: `buttonBorderShape('circle')` makes it round despite a wide symbol;
 * `controlSize('extraLarge')` grows the glass to fill the box; `frame` pins it
 * to exactly `iconButton` so it matches the X beside it. iOS-only: render
 * behind an `IOS_NATIVE_ENABLED` guard, the caller keeps its own RN fallback.
 */
export function NativeMenuButton({
  systemImage,
  label,
  tint,
  marginRight,
  children,
}: NativeMenuButtonProps) {
  return (
    <SwiftHost style={marginRight ? styles.hostMargin : styles.host}>
      <SwiftMenu
        label={label}
        systemImage={systemImage}
        modifiers={[
          swiftButtonStyle?.('glass'),
          swiftButtonBorderShape?.('circle'),
          swiftControlSize?.('extraLarge'),
          swiftLabelStyle?.('iconOnly'),
          tint ? swiftTint?.(tint) : undefined,
          swiftFrame?.({ width: Metrics.iconButton, height: Metrics.iconButton }),
        ].filter(Boolean)}>
        {children}
      </SwiftMenu>
    </SwiftHost>
  );
}

const styles = StyleSheet.create({
  host: {
    width: Metrics.iconButton,
    height: Metrics.iconButton,
  },
  hostMargin: {
    width: Metrics.iconButton,
    height: Metrics.iconButton,
    marginRight: Spacing.two,
  },
});
