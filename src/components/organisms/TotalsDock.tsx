import { type ReactNode, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { LoggedPressable } from '@/components/atoms/Logged';

import { AppIcon, type AppIconName } from '@/components/atoms/AppIcon';
import { AppText } from '@/components/atoms/AppText';
import { AnimatedValueText } from '@/components/atoms/AnimatedValueText';
import { GlassSurface } from '@/components/atoms/GlassSurface';
import { Metrics, Radii, Spacing } from '@/constants/theme';
import type { TotalItem } from '@/domains/types';
import { useColors } from '@/hooks/use-colors';
import { t } from '@/i18n';

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
  expanded?: boolean;
  children?: ReactNode;
  onHeightChange?: (height: number) => void;
}

export function TotalsDock({
  items,
  compact = false,
  onPress,
  attachedTop = false,
  fill = false,
  expanded = false,
  children,
  onHeightChange,
}: TotalsDockProps) {
  const colors = useColors();
  const { height: windowHeight } = useWindowDimensions();
  const [contentHeight, setContentHeight] = useState<number>(Metrics.dock);
  const progress = useSharedValue(0);
  const panelHeight = useSharedValue<number>(Metrics.dock);
  const expandedHeight = Math.min(Math.max(contentHeight, Metrics.dock), Math.max(Metrics.dock, windowHeight * 0.6));
  useEffect(() => {
    onHeightChange?.(expanded ? expandedHeight : Metrics.dock);
    progress.value = withTiming(expanded ? 1 : 0, { duration: 180 });
    panelHeight.value = withSpring(expanded ? expandedHeight : Metrics.dock, { damping: 28, stiffness: 280, overshootClamping: true });
  }, [expanded, expandedHeight, panelHeight, progress, onHeightChange]);
  const shellStyle = useAnimatedStyle(() => ({
    height: compact ? '100%' : panelHeight.value,
    borderRadius: 28 - progress.value * 4,
  }));
  const summaryStyle = useAnimatedStyle(() => ({ opacity: 1 - progress.value }));
  const detailsStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const visibleItems = items;
  return <View style={fill ? styles.pressableFill : { height: Metrics.dock }}>
    <Animated.View style={[styles.shell, shellStyle]}>
    <GlassSurface
      glass="regular"
      // Interactive glass when it's a button, matching the header day-changer.
      isInteractive={!!onPress && !expanded}
      style={[
        styles.dock,
        compact && styles.dockCompact,
        styles.dockFill,
        expanded && { borderRadius: Radii.xl },
        attachedTop && styles.attachedTop,
      ]}>
      <Animated.View style={[styles.summary, summaryStyle]} pointerEvents={expanded ? 'none' : 'auto'} accessibilityElementsHidden={expanded} importantForAccessibility={expanded ? 'no-hide-descendants' : 'auto'}>
      <LoggedPressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Open totals details" accessibilityState={{ expanded }} style={styles.summaryButton}>
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
      </LoggedPressable>
      </Animated.View>
      {children ? <Animated.View style={[styles.details, detailsStyle]} pointerEvents={expanded ? 'auto' : 'none'} accessibilityElementsHidden={!expanded} importantForAccessibility={!expanded ? 'no-hide-descendants' : 'auto'}>
        <LoggedPressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={onPress} style={styles.detailsButton}>
          <ScrollView style={{ maxHeight: expandedHeight }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
            <View onLayout={({ nativeEvent }) => setContentHeight(nativeEvent.layout.height)}>{children}</View>
          </ScrollView>
        </LoggedPressable>
      </Animated.View> : null}
    </GlassSurface>
    </Animated.View>
  </View>;
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
  shell: { position: 'absolute', bottom: 0, left: 0, right: 0, overflow: 'hidden' },
  summary: { ...StyleSheet.absoluteFill, justifyContent: 'center' },
  summaryButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.one, paddingHorizontal: Spacing.three },
  details: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  detailsButton: { flex: 1 },
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
