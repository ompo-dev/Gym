import { Pressable, StyleSheet, View } from 'react-native';

import { AppIcon } from '@/components/atoms/AppIcon';
import { GlassSurface } from '@/components/atoms/GlassSurface';
import { DateNav } from '@/components/molecules/DateNav';
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
}: DayHeaderProps) {
  const colors = useColors();

  return (
    <View style={styles.header}>
      {onSaveDay && canSaveDay ? (
        <Pressable
          onPress={onSaveDay}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t('routine.saveDay')}>
          <GlassSurface glass="regular" isInteractive style={styles.settingsButton}>
            <AppIcon name="bookmark" color={colors.textSecondary} size={18} />
          </GlassSurface>
        </Pressable>
      ) : (
        <View style={styles.sideSpacer} />
      )}
      <DateNav date={date} canNext={canNext} onPrev={onPrev} onNext={onNext} onToday={onToday} />
      <Pressable
        onPress={onOpenSettings}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={t('settings.title')}>
        <GlassSurface glass="regular" isInteractive style={styles.settingsButton}>
          <AppIcon name="settings" color={colors.textSecondary} size={18} />
        </GlassSurface>
      </Pressable>
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
});
