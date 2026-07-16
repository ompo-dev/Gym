import { Pressable, StyleSheet } from 'react-native';

import { AppIcon } from '@/components/atoms/AppIcon';
import { AppText } from '@/components/atoms/AppText';
import { GlassSurface } from '@/components/atoms/GlassSurface';
import { Metrics, Radii, Spacing } from '@/constants/theme';
import { dayLabel } from '@/core/date';
import { useColors } from '@/hooks/use-colors';

interface DateNavProps {
  date: string;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}

export function DateNav({ date, canNext, onPrev, onNext, onToday }: DateNavProps) {
  const colors = useColors();

  return (
    <GlassSurface glass="regular" isInteractive style={styles.pill}>
      <Pressable
        onPress={onPrev}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Previous day"
        style={styles.iconButton}>
        <AppIcon name="chevronLeft" color={colors.textSecondary} size={18} />
      </Pressable>

      <Pressable
        onPress={onToday}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={`Selected day ${dayLabel(date)}. Tap to jump to today`}
        style={styles.labelButton}>
        <AppText variant="value" style={styles.label}>
          {dayLabel(date)}
        </AppText>
      </Pressable>

      <Pressable
        onPress={canNext ? onNext : undefined}
        disabled={!canNext}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Next day"
        style={styles.iconButton}>
        <AppIcon
          name="chevronRight"
          color={canNext ? colors.textSecondary : colors.textTertiary}
          size={18}
        />
      </Pressable>
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: Metrics.control,
    paddingHorizontal: Spacing.three,
    borderRadius: Radii.pill,
    overflow: 'hidden',
  },
  iconButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelButton: {
    minWidth: 92,
    paddingHorizontal: Spacing.two,
  },
  label: {
    textAlign: 'center',
  },
});
