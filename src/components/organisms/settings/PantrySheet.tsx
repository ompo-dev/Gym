import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { LoggedPressable } from '@/components/atoms/Logged';

import { AppText } from '@/components/atoms/AppText';
import { MultiLineChart } from '@/components/molecules/MultiLineChart';
import { Spacing } from '@/constants/theme';
import { PantryRepository } from '@/data/PantryRepository';
import { useRepositoryData } from '@/hooks/useRepositoryData';
import { pantryItemToEntry, pantryPriceSeries, type PantryItem } from '@/domains/pantry';
import { formatMoney } from '@/domains/purchase';
import { useColors } from '@/hooks/use-colors';
import { t } from '@/i18n';

import { FoodEntryDetailSheet } from '../FoodEntryDetailSheet';
import { PantryPriceHistoryCard } from '../PantryPriceHistoryCard';
import { SheetFrame } from '../SheetFrame';
import { Chevron, Divider } from './primitives';
import { SavedMealMetric, SavedMealMetrics } from './SavedMealsSheet';
import { savedListStyles, settingsStyles } from './styles';

/**
 * What this product has cost over time, on the same chart the workout monitor
 * draws. Renders nothing below two priced purchases — one point is not a trend,
 * and a chart of it would invent a history the notes do not have.
 */
function PantryPriceChart({ item }: { item: PantryItem }) {
  const colors = useColors();
  const series = pantryPriceSeries(item);
  if (!series) return null;

  return (
    <View style={chartStyles.section}>
      <AppText variant="heading">{t('pantry.priceHistory')}</AppText>
      <MultiLineChart
        labels={series.labels}
        lines={[
          {
            key: 'pricePerKg',
            label: t('pantry.pricePerKg'),
            color: colors.success,
            points: series.pricePerKg,
          },
        ]}
        formatValue={(value) => formatMoney(value)}
        summary="average"
        // Not zero-based: groceries never cost nothing, and anchoring at zero
        // flattens the swing the chart exists to show.
        zeroBased={false}
      />
    </View>
  );
}

const chartStyles = StyleSheet.create({
  section: { gap: Spacing.two, paddingTop: Spacing.three },
});

interface PantrySheetProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * The fridge is a saved-meals list that happens to hold groceries, so it is
 * built from the same pieces: `SheetFrame`, `settingsStyles.card`, `Divider`,
 * `savedListStyles.savedMealRow` and `SavedMealMetric`. Nothing here defines a
 * layout of its own — that is what let it drift into looking like a different
 * app in the first place.
 */
export function PantrySheet({ visible, onClose }: PantrySheetProps) {
  const colors = useColors();
  const items = useRepositoryData<PantryItem[]>(() => PantryRepository.all(), [], [visible], visible);
  // The very same sheet a meal note opens — a pantry item is just read as a
  // 100 g meal on the way in. See `pantryItemToEntry`.
  const [detail, setDetail] = useState<PantryItem | null>(null);

  return (
    <SheetFrame visible={visible} title={t('pantry.title')} onClose={onClose} centerTitle size="full">
      {items.length === 0 ? (
        <View
          style={[
            settingsStyles.card,
            settingsStyles.emptySavedMeals,
            { backgroundColor: colors.backgroundElement },
          ]}>
          <AppText variant="body" color={colors.textSecondary}>
            {t('pantry.empty')}
          </AppText>
        </View>
      ) : (
        <>
          {/* Above the shelf, not buried in a row: "is my shopping getting more
              expensive" is the question the whole fridge answers, and it should
              not need a tap on one product to be asked. Renders nothing until
              two dated purchases exist — one column is not a trend. */}
          <PantryPriceHistoryCard />
          <View style={[settingsStyles.card, { backgroundColor: colors.backgroundElement }]}>
          {items.map((item, index) => (
            <View key={item.key}>
              {index > 0 ? <Divider /> : null}
              <LoggedPressable
                onPress={() => setDetail(item)}
                // Nothing was ever recorded about this product, so there is no
                // detail to open and the row must not pretend otherwise.
                disabled={!item.nutrition}
                style={savedListStyles.savedMealRow}
                accessibilityRole="button"
                accessibilityLabel={item.label}>
                <View style={savedListStyles.savedMealContent}>
                  <AppText
                    variant="body"
                    color={colors.text}
                    numberOfLines={1}
                    style={savedListStyles.savedMealName}>
                    {item.label}
                  </AppText>
                  <SavedMealMetrics>
                    {item.lastPrice !== undefined ? (
                      <SavedMealMetric
                        icon="asterisk"
                        color={colors.success}
                        value={formatMoney(item.lastPrice)}
                      />
                    ) : null}
                    {item.lastPricePerKg !== undefined ? (
                      <SavedMealMetric
                        icon="squareStack"
                        color={colors.water}
                        value={`${formatMoney(item.lastPricePerKg)}/kg`}
                      />
                    ) : null}
                    <SavedMealMetric
                      icon="apple"
                      color={colors.textTertiary}
                      value={`${item.history.length} ${t('pantry.times')}`}
                    />
                  </SavedMealMetrics>
                </View>
                {item.nutrition ? <Chevron /> : null}
              </LoggedPressable>
            </View>
          ))}
          </View>
        </>
      )}
      <FoodEntryDetailSheet
        visible={detail !== null}
        entry={detail ? pantryItemToEntry(detail) : null}
        onClose={() => setDetail(null)}
        belowNutrition={
          detail ? (
            <>
              <PantryPriceChart item={detail} />
              {/* This product first, then the shelf around it: the single
                  series answers "is this getting dearer", the shared axis
                  answers "or is everything?". */}
              <PantryPriceHistoryCard />
            </>
          ) : null
        }
      />
    </SheetFrame>
  );
}
