import { StyleSheet, View } from 'react-native';
import { LoggedPressable } from '@/components/atoms/Logged';

import { AppIcon, type AppIconName } from '@/components/atoms/AppIcon';
import { AppText } from '@/components/atoms/AppText';
import { AnimatedValueText } from '@/components/atoms/AnimatedValueText';
import { GlassSurface } from '@/components/atoms/GlassSurface';
import { Metrics, Radii, Spacing } from '@/constants/theme';
import type { TotalItem } from '@/domains/types';
import { useColors } from '@/hooks/use-colors';

const iconByKey: Record<string, AppIconName> = {
  cal: 'flame',
  sets: 'squareStack',
  vol: 'dumbbell',
  time: 'clock',
  dist: 'navigation',
};

const macroKeys = new Set(['c', 'p', 'f', 'h']);

interface TotalsDockProps {
  items: TotalItem[];
  compact?: boolean;
  onPress?: () => void;
  attachedTop?: boolean;
  /** Fill the parent's height instead of using `minHeight` — lets the caller
   *  animate the bar's height (the keyboard dock shrinks it toward the buttons). */
  fill?: boolean;
}

export function TotalsDock({
  items,
  compact = false,
  onPress,
  attachedTop = false,
  fill = false,
}: TotalsDockProps) {
  const colors = useColors();
  const visibleItems = items;
  const body = (
    <GlassSurface
      glass="regular"
      // Interactive glass when it's a button, matching the header day-changer.
      isInteractive={!!onPress}
      style={[
        styles.dock,
        compact && styles.dockCompact,
        fill && styles.dockFill,
        attachedTop && styles.attachedTop,
      ]}>
      {visibleItems.map((item, index) => (
        <View key={item.key} style={styles.itemGroup}>
          {index > 0 ? (
            <AppText variant="label" color={colors.textTertiary} style={styles.separator}>
              •
            </AppText>
          ) : null}
          <View style={styles.item}>
            <TotalMarker item={item} />
            <AnimatedValueText value={item.value} variant="value" color={colors.text} />
          </View>
        </View>
      ))}
    </GlassSurface>
  );

  return onPress ? (
    <LoggedPressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Open totals details"
      style={fill ? styles.pressableFill : undefined}
    >
      {body}
    </LoggedPressable>
  ) : (
    body
  );
}

function TotalMarker({ item }: { item: TotalItem }) {
  if (macroKeys.has(item.key)) {
    return (
      <AppText variant="label" color={item.color} style={styles.macroLetter}>
        {item.label.slice(0, 1)}
      </AppText>
    );
  }

  return <AppIcon name={iconByKey[item.key] ?? 'circleDot'} color={item.color} size={15} />;
}

const styles = StyleSheet.create({
  dock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    minHeight: Metrics.dock,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderRadius: Radii.pill,
    overflow: 'hidden',
  },
  dockCompact: {
    paddingHorizontal: Spacing.three,
    borderRadius: Radii.pill,
    gap: Spacing.one,
  },
  // Fill the wrapper's (animated) height and centre content in it; no minHeight
  // or vertical padding of its own, so the caller owns the bar's height.
  dockFill: {
    minHeight: 0,
    flex: 1,
    paddingVertical: 0,
  },
  pressableFill: {
    flex: 1,
  },
  attachedTop: {
    borderTopLeftRadius: Radii.md,
    borderTopRightRadius: Radii.md,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  itemGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  macroLetter: {
    minWidth: 10,
    textAlign: 'center',
  },
  separator: {
    opacity: 0.75,
  },
});
