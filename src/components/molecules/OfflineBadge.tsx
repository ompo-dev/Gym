import { Alert, StyleSheet } from 'react-native';

import { AppIcon } from '@/components/atoms/AppIcon';
import { GlassSurface } from '@/components/atoms/GlassSurface';
import { LoggedPressable } from '@/components/atoms/Logged';
import { Metrics, Radii } from '@/constants/theme';
import { useColors } from '@/hooks/use-colors';
import { t } from '@/i18n';

/**
 * Android/web offline pill. No SwiftUI Popover here — tapping opens a native
 * `Alert` with the same copy. iOS gets the real popover in `OfflineBadge.ios.tsx`.
 */
export function OfflineBadge() {
  const colors = useColors();
  return (
    <LoggedPressable
      onPress={() => Alert.alert(t('offline.title'), t('offline.body'))}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={t('offline.badge')}
    >
      <GlassSurface glass="regular" isInteractive style={styles.button}>
        <AppIcon name="cloudOff" color={colors.accent} size={18} />
      </GlassSurface>
    </LoggedPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: Metrics.iconButton,
    height: Metrics.iconButton,
    borderRadius: Radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
