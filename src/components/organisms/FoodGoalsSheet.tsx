import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { AppIcon } from '@/components/atoms/AppIcon';
import { AnimatedValueText } from '@/components/atoms/AnimatedValueText';
import { ProgressRing } from '@/components/atoms/ProgressRing';
import { AppText } from '@/components/atoms/AppText';
import { GlassSurface } from '@/components/atoms/GlassSurface';
import { Radii, Spacing } from '@/constants/theme';
import { formatWaterMl, type FoodTotals } from '@/domains/food';
import { useColors } from '@/hooks/use-colors';
import { useFoodGoals } from '@/hooks/useFoodGoals';
import { t } from '@/i18n';

interface FoodGoalsSheetProps {
  totals: FoodTotals;
  visible: boolean;
}

function progress(current: number, goal: number): number {
  if (goal <= 0) return 0;
  return Math.max(0, Math.min(current / goal, 1));
}

function MacroRing({
  color,
  current,
  displayValue,
  goal,
  label,
}: {
  color: string;
  current: number;
  displayValue?: string;
  goal: number;
  label: string;
}) {
  const colors = useColors();

  return (
    <View style={styles.macroItem}>
      <View style={styles.ringWrap}>
        <ProgressRing
          progress={progress(current, goal)}
          color={color}
          trackColor={colors.surfaceStrong}
          size={76}
          stroke={7}>
          <AnimatedValueText
            value={displayValue ?? `${Math.round(current)}`}
            variant="value"
            style={styles.ringValue}
          />
        </ProgressRing>
      </View>

      <AppText
        variant="secondary"
        color={colors.textSecondary}
        numberOfLines={1}
        adjustsFontSizeToFit>
        {label}
      </AppText>
    </View>
  );
}

function AnimatedCaloriesBar({
  progress,
  color,
  trackColor,
}: {
  progress: number;
  color: string;
  trackColor: string;
}) {
  const width = useSharedValue(0);
  const fill = useSharedValue(0);
  const clamped = Math.max(0, Math.min(progress, 1));

  useEffect(() => {
    fill.value = withTiming(clamped, {
      duration: 480,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
    });
  }, [clamped, fill]);

  const animatedStyle = useAnimatedStyle(() => ({
    width: width.value * fill.value,
  }));

  return (
    <View
      style={[styles.progressTrack, { backgroundColor: trackColor }]}
      onLayout={({ nativeEvent }) => {
        width.value = nativeEvent.layout.width;
      }}>
      <Animated.View
        style={[
          styles.progressFill,
          animatedStyle,
          {
            backgroundColor: color,
          },
        ]}
      />
    </View>
  );
}

export function FoodGoalsSheet({ totals, visible }: FoodGoalsSheetProps) {
  const colors = useColors();
  const goals = useFoodGoals();
  const caloriesProgress = progress(totals.calories, goals.calories);

  if (!visible) return null;

  return (
    <GlassSurface glass="regular" style={styles.panel}>
      <AppText variant="heading">{t('goals.title')}</AppText>

      <View style={styles.caloriesBlock}>
        <View style={styles.caloriesHeader}>
          <View style={styles.caloriesLabel}>
            <AppIcon name="flame" color={colors.calories} size={18} />
            <AppText variant="body" color={colors.textSecondary}>
              {t('goals.calories')}
            </AppText>
          </View>

          <View style={styles.caloriesValueRow}>
            <AnimatedValueText
              value={`${Math.round(totals.calories)}`}
              variant="heading"
              style={styles.caloriesValue}
            />
            <AppText variant="heading" style={styles.caloriesValue}>
              {' / '}
              {goals.calories}
            </AppText>
          </View>
        </View>

        <AnimatedCaloriesBar
          progress={caloriesProgress}
          color={colors.calories}
          trackColor={colors.backgroundElement}
        />
      </View>

      <View style={styles.macroRow}>
        <MacroRing
          color={colors.protein}
          current={totals.protein}
          goal={goals.protein}
          label={t('goals.protein')}
        />
        <MacroRing
          color={colors.carbs}
          current={totals.carbs}
          goal={goals.carbs}
          label={t('goals.carbs')}
        />
        <MacroRing
          color={colors.fat}
          current={totals.fat}
          goal={goals.fat}
          label={t('goals.fat')}
        />
        <MacroRing
          color={colors.water}
          current={totals.waterMl}
          displayValue={formatWaterMl(totals.waterMl)}
          goal={goals.waterMl}
          label={t('goals.water')}
        />
      </View>
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: Spacing.four,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.five,
    borderRadius: Radii.xl,
    overflow: 'hidden',
  },
  caloriesBlock: {
    gap: Spacing.three,
  },
  caloriesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  caloriesLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  caloriesValue: {
    fontSize: 18,
  },
  caloriesValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  progressTrack: {
    height: 14,
    borderRadius: Radii.pill,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: Radii.pill,
  },
  macroRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  macroItem: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.two,
  },
  ringWrap: {
    width: 76,
    height: 76,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringValue: {
    fontSize: 18,
    lineHeight: 20,
  },
});
