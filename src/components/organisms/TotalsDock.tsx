import { Pressable, StyleSheet, View } from 'react-native';

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
};

const macroKeys = new Set(['c', 'p', 'f', 'h']);

interface TotalsDockProps {
  items: TotalItem[];
  compact?: boolean;
  onPress?: () => void;
  attachedTop?: boolean;
}

export function TotalsDock({
  items,
  compact = false,
  onPress,
  attachedTop = false,
}: TotalsDockProps) {
  const colors = useColors();
  const visibleItems = compact ? items.slice(0, 2) : items;
  const body = (
    <GlassSurface
      glass="regular"
      style={[
        styles.dock,
        compact && styles.dockCompact,
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
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Open totals details">
      {body}
    </Pressable>
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
    minHeight: Metrics.control,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radii.pill,
    gap: Spacing.one,
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
