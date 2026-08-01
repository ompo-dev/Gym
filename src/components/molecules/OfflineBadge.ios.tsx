import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { glassCircleModifiers } from '@/components/molecules/NativeMenuButton';
import {
  SwiftButton,
  SwiftHost,
  SwiftPopover,
  SwiftText,
  SwiftVStack,
  swiftFont,
  swiftForegroundStyle,
  swiftFrame,
  swiftPadding,
  swiftFixedSize,
} from '@/components/onboarding/onboardingNative';
import { Metrics } from '@/constants/theme';
import { useColors } from '@/hooks/use-colors';
import { t } from '@/i18n';

/**
 * The offline pill: an amber glass circle with a slashed-cloud SF Symbol, sitting
 * in the header only while offline. Tapping it opens a native SwiftUI `Popover`
 * (self-anchoring — no manual positioning, unlike a free-floating overlay) that
 * explains the queue. iOS file; Android/web get `OfflineBadge.tsx`.
 */
export function OfflineBadge() {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const box = { width: Metrics.iconButton, height: Metrics.iconButton };

  return (
    <View style={box}>
      <SwiftHost style={[styles.frame, box]}>
        <SwiftPopover
          isPresented={open}
          onIsPresentedChange={setOpen}
          arrowEdge="top"
        >
          <SwiftPopover.Trigger>
            <SwiftButton
              label={t('offline.badge')}
              systemImage="icloud.slash"
              onPress={() => setOpen(true)}
              // ponytail: size calibrated by NativeMenuButton's recipe; if still off
              // vs the settings button, try controlSize('large') instead.
              modifiers={[
                ...glassCircleModifiers(Metrics.iconButton),
                swiftForegroundStyle(colors.accent),
              ]}
            />
          </SwiftPopover.Trigger>
          <SwiftPopover.Content>
            <SwiftVStack
              spacing={6}
              modifiers={[
                swiftPadding({ top: 16, bottom: 16, leading: 18, trailing: 18 }),
                swiftFrame({ width: 240 }),
              ]}
            >
              <SwiftText
                modifiers={[
                  swiftFont({ size: 16, weight: 'bold' }),
                  swiftForegroundStyle(colors.text),
                ]}
              >
                {t('offline.title')}
              </SwiftText>
              <SwiftText
                modifiers={[
                  swiftForegroundStyle(colors.textSecondary),
                  swiftFixedSize({ horizontal: false, vertical: true }),
                ]}
              >
                {t('offline.body')}
              </SwiftText>
            </SwiftVStack>
          </SwiftPopover.Content>
        </SwiftPopover>
      </SwiftHost>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: Metrics.iconButton,
    height: Metrics.iconButton,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
