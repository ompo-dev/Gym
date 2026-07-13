import { Pressable, StyleSheet } from 'react-native';

import { AppText } from '@/components/atoms/AppText';
import { GlassSurface } from '@/components/atoms/GlassSurface';
import { Spacing } from '@/constants/theme';
import { dayLabel } from '@/core/date';

interface DateNavProps {
  date: string;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}

export function DateNav({ date, canNext, onPrev, onNext, onToday }: DateNavProps) {
  return (
    <GlassSurface glass="regular" isInteractive style={styles.pill}>
      <Pressable onPress={onPrev} hitSlop={10} accessibilityRole="button" accessibilityLabel="Previous day">
        <AppText style={styles.chevron}>‹</AppText>
      </Pressable>
      <Pressable
        onPress={onToday}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={`Selected day ${dayLabel(date)}. Tap to jump to today`}>
        <AppText variant="label" style={styles.label}>
          {dayLabel(date)}
        </AppText>
      </Pressable>
      <Pressable
        onPress={canNext ? onNext : undefined}
        disabled={!canNext}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Next day">
        <AppText style={[styles.chevron, !canNext && styles.disabled]}>›</AppText>
      </Pressable>
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: 22,
    overflow: 'hidden',
  },
  chevron: { fontSize: 22, fontWeight: '500', lineHeight: 26 },
  label: { minWidth: 84, textAlign: 'center' },
  disabled: { opacity: 0.3 },
});
