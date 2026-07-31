import { StyleSheet, View } from 'react-native';
import { LoggedPressable } from '@/components/atoms/Logged';

import { AppIcon } from '@/components/atoms/AppIcon';
import { GlassSurface } from '@/components/atoms/GlassSurface';
import { DateNav } from '@/components/molecules/DateNav';
import { OfflineBadge } from '@/components/molecules/OfflineBadge';
import { Metrics, Radii, Spacing } from '@/constants/theme';
import { useColors } from '@/hooks/use-colors';
import { t } from '@/i18n';

interface DayHeaderProps {
  date: string;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onOpenSettings: () => void;
  /** Absent (or with nothing to save) leaves the slot empty, keeping the nav centred. */
  onSaveDay?: () => void;
  canSaveDay?: boolean;
  /** True once this day's routine has been saved — fills the bookmark, matching the meal-save affordance. */
  daySaved?: boolean;
  /** Shows the offline pill left of settings. A matching spacer is added on the
   *  other side so the centred DateNav never shifts when it appears. */
  isOffline?: boolean;
}

export function DayHeader({
  date,
  canNext,
  onPrev,
  onNext,
  onToday,
  onOpenSettings,
  onSaveDay,
  canSaveDay = false,
  daySaved = false,
  isOffline = false,
}: DayHeaderProps) {
  const colors = useColors();

  return (
    <View style={styles.header}>
      {/* Left cluster mirrors the right: save-or-spacer, plus a spacer that
          balances the offline badge so the DateNav stays dead-centre. */}
      <View style={styles.side}>
        {onSaveDay && canSaveDay ? (
          <LoggedPressable
            onPress={onSaveDay}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityState={{ selected: daySaved }}
            accessibilityLabel={t('routine.saveDay')}>
            {daySaved ? (
              <View style={[styles.settingsButton, styles.savedButton]}>
                <AppIcon name="bookmark" color={colors.background} fill={colors.background} size={18} />
              </View>
            ) : (
              <GlassSurface glass="regular" isInteractive style={styles.settingsButton}>
                <AppIcon name="bookmark" color={colors.textSecondary} size={18} />
              </GlassSurface>
            )}
          </LoggedPressable>
        ) : (
          <View style={styles.sideSpacer} />
        )}
        {isOffline ? <View style={styles.sideSpacer} /> : null}
      </View>

      <DateNav date={date} canNext={canNext} onPrev={onPrev} onNext={onNext} onToday={onToday} />

      <View style={styles.side}>
        {isOffline ? <OfflineBadge /> : null}
        <LoggedPressable
          onPress={onOpenSettings}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t('settings.title')}>
          <GlassSurface glass="regular" isInteractive style={styles.settingsButton}>
            <AppIcon name="settings" color={colors.textSecondary} size={18} />
          </GlassSurface>
        </LoggedPressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: Spacing.three,
  },
  side: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  sideSpacer: {
    width: Metrics.iconButton,
  },
  settingsButton: {
    width: Metrics.iconButton,
    height: Metrics.iconButton,
    borderRadius: Radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  savedButton: {
    backgroundColor: '#FFFFFF',
  },
});
