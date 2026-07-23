import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppIcon } from '@/components/atoms/AppIcon';
import { AppText } from '@/components/atoms/AppText';
import { GlassSurface } from '@/components/atoms/GlassSurface';
import { Radii, Spacing } from '@/constants/theme';
import { MultiLineChart } from '@/components/molecules/MultiLineChart';
import { PantryRepository } from '@/data/PantryRepository';
import { pantryPriceChart, type PantryPriceChart } from '@/domains/pantry';
import { formatMoney } from '@/domains/purchase';
import { useColors } from '@/hooks/use-colors';
import { t } from '@/i18n';

/**
 * How many products the chart draws.
 *
 * Past a handful the lines stop being readable and the legend eats the screen.
 * The shelf is ordered by what was bought most recently, so the cut keeps what
 * the user is actually shopping for.
 */
const MAX_LINES = 6;

/**
 * What the groceries have cost over time, one line per product.
 *
 * The same chart the workout monitor draws for muscles, pointed at the fridge:
 * a purchase note answers "what did I buy" on its own, and the thing it cannot
 * answer — "is this getting more expensive?" — is exactly what a price history
 * is for. All of its logic lives in `pantryPriceChart`; jest only runs
 * `*.test.ts`, so anything decided in here would be untestable by construction.
 */
export function PantryPriceHistoryCard() {
  const colors = useColors();
  const [chart, setChart] = useState<PantryPriceChart | null>(null);

  // Read on open, like `PantrySheet` and `FoodRecipeCard`: the shelf is derived
  // from every purchase note, not held in memory.
  useEffect(() => {
    let alive = true;
    void PantryRepository.all().then((items) => {
      if (alive) setChart(pantryPriceChart(items.slice(0, MAX_LINES)));
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!chart) return null;

  // The metric palette the notes rows and the totals dock already use, so a
  // product's line is the same kind of colour as a macro's.
  const palette = [
    colors.calories,
    colors.protein,
    colors.carbs,
    colors.fat,
    colors.water,
    colors.accent,
  ];

  return (
    <GlassSurface glass="regular" style={styles.card}>
      <View style={styles.header}>
        <AppIcon name="scale" color={colors.accentStrong} size={16} />
        <AppText variant="heading">{t('pantry.priceHistory')}</AppText>
      </View>

      <MultiLineChart
        labels={chart.labels}
        lines={chart.lines.map((line, index) => ({
          ...line,
          color: palette[index % palette.length],
        }))}
        formatValue={(value) => formatMoney(value)}
        summary="average"
        // Not zero-based: groceries never cost nothing, and anchoring at zero
        // flattens the swing the chart exists to show.
        zeroBased={false}
        yLabel={t('pantry.pricePerKg')}
        yAxisWidth={34}
      />
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radii.xl,
    padding: Spacing.four,
    gap: Spacing.three,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
