import { useState } from 'react';
import { View } from 'react-native';

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
 * Offline indicator: bare amber slashed-cloud icon. Tapping opens a native SwiftUI
 * `Popover` that explains the queue. iOS file; Android/web get `OfflineBadge.tsx`.
 */
export function OfflineBadge() {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const box = { width: Metrics.iconButton, height: Metrics.iconButton };

  return (
    <View style={box}>
      <SwiftHost style={{ width: Metrics.iconButton, height: Metrics.iconButton, alignItems: 'center', justifyContent: 'center' }}>
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
              modifiers={[swiftForegroundStyle(colors.accent)]}
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
