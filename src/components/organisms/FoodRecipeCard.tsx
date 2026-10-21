import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { AppIcon } from '@/components/atoms/AppIcon';
import { AppText } from '@/components/atoms/AppText';
import { GlassSurface } from '@/components/atoms/GlassSurface';
import { LoggedPressable } from '@/components/atoms/Logged';
import { Radii, Spacing } from '@/constants/theme';
import { PantryRepository } from '@/data/PantryRepository';
import { recipeShoppingList } from '@/domains/food';
import { matchRecipeToPantry, type PantryItem } from '@/domains/pantry';
import { formatMoney } from '@/domains/purchase';
import { useRepositoryData } from '@/hooks/useRepositoryData';
import type { FoodRecipe } from '@/domains/schemas';
import { useColors } from '@/hooks/use-colors';
import { t } from '@/i18n';

interface FoodRecipeCardProps {
  recipe: FoodRecipe;
  onChange?: (recipe: FoodRecipe) => Promise<void> | void;
}

/** Servings and time, in the same chip strip the meal rows use for macros. */
function RecipeMetric({ icon, label }: { icon: 'utensils' | 'clock'; label: string }) {
  const colors = useColors();
  return (
    <View style={[styles.metric, { backgroundColor: colors.backgroundElement }]}>
      <AppIcon name={icon} color={colors.textSecondary} size={14} />
      <AppText variant="caption" color={colors.textSecondary}>
        {label}
      </AppText>
    </View>
  );
}

/**
 * The step-by-step under the nutrition detail. Every decision it renders is
 * made in `recipeShoppingList` and `matchRecipeToPantry` — jest only runs
 * `*.test.ts`, so anything settled in here would be untestable by construction.
 */
export function FoodRecipeCard({ recipe, onChange }: FoodRecipeCardProps) {
  const colors = useColors();
  const [saving, setSaving] = useState(false);
  // Read when the sheet opens, not frozen when the recipe was written: what is
  // in the fridge changes, and a list that answers "do I have this" answers for
  // now. Same load `PantrySheet` does.
  const pantry = useRepositoryData<PantryItem[]>(() => PantryRepository.all(), [], []);

  const matched = matchRecipeToPantry(recipe, pantry);
  const { missing, totalCents } = recipeShoppingList(matched);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={[styles.titleBadge, { backgroundColor: colors.accent }]}>
            <AppIcon name="utensils" color="#FFFFFF" size={16} />
          </View>
          <AppText variant="heading">{t('recipe.title')}</AppText>
        </View>
        <View style={styles.metrics}>
          <RecipeMetric icon="utensils" label={`${recipe.servings} ${t('recipe.servings')}`} />
          {recipe.totalMinutes ? (
            <RecipeMetric icon="clock" label={`${recipe.totalMinutes} min`} />
          ) : null}
        </View>
      </View>

      <GlassSurface glass="regular" style={styles.section}>
        <AppText variant="label" color={colors.textSecondary}>
          {t('recipe.ingredients')}
        </AppText>
        {matched.ingredients.map((item, index) => {
          const owned = item.available ?? Boolean(item.pantryItemId);
          return (
            <LoggedPressable key={`${item.label}-${index}`} style={styles.line}
              disabled={!onChange || saving}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: owned, disabled: !onChange || saving }}
              accessibilityLabel={item.label}
              onPress={async () => {
                setSaving(true);
                try {
                  await onChange?.({ ...recipe, ingredients: recipe.ingredients.map((ingredient, i) =>
                    i === index ? { ...ingredient, available: !owned } : ingredient) });
                } catch {
                  Alert.alert(t('common.error'), t('recipe.saveError'));
                } finally { setSaving(false); }
              }}>
              <View
                style={[
                  styles.bullet,
                  owned
                    ? { backgroundColor: colors.success }
                    : { borderWidth: 1.5, borderColor: colors.border },
                ]}>
                {owned ? <AppIcon name="check" color="#FFFFFF" size={11} /> : null}
              </View>
              <AppText variant="body" style={styles.lineText}>
                {[item.quantity, item.unit, item.label].filter(Boolean).join(' ')}
              </AppText>
              <AppText variant="caption" color={owned ? colors.success : colors.accent}>
                {owned
                  ? t('recipe.have')
                  : item.estimatedCostCents !== undefined
                    ? formatMoney(item.estimatedCostCents / 100)
                    : t('recipe.needBuy')}
              </AppText>
            </LoggedPressable>
          );
        })}
          {/* Suppressed when any price is unknown: a partial total reads as the
              whole cost, and it is not. */}
          {missing.length && totalCents !== null ? (
            <View style={[styles.totalRow, { borderTopColor: colors.border }]}>
              <View style={styles.totalLabel}>
                <AppIcon name="scale" color={colors.accentStrong} size={15} />
                <AppText variant="label" color={colors.accentStrong}>
                  {t('recipe.toBuy')}
                </AppText>
              </View>
              <AppText variant="value">{formatMoney(totalCents / 100)}</AppText>
            </View>
          ) : null}
        </GlassSurface>

      <GlassSurface glass="regular" style={styles.section}>
        <AppText variant="label" color={colors.textSecondary}>
          {t('recipe.steps')}
        </AppText>
        {matched.steps.map((step, index) => (
          <View key={`step-${index}`} style={styles.step}>
            <View style={[styles.stepIndex, { backgroundColor: colors.backgroundElement }]}>
              <AppText variant="caption" color={colors.textSecondary}>
                {index + 1}
              </AppText>
            </View>
            <View style={styles.stepBody}>
              <AppText variant="body">{step.text}</AppText>
              {step.minutes ? (
                <View style={styles.stepMinutes}>
                  <AppIcon name="clock" color={colors.textTertiary} size={12} />
                  <AppText variant="caption" color={colors.textTertiary}>
                    {`${step.minutes} min`}
                  </AppText>
                </View>
              ) : null}
            </View>
          </View>
        ))}
      </GlassSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.three },
  header: { gap: Spacing.two },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  titleBadge: {
    width: 28,
    height: 28,
    borderRadius: Radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  metric: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: Radii.pill,
  },
  section: {
    borderRadius: Radii.xl,
    padding: Spacing.four,
    gap: Spacing.two,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  line: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  bullet: {
    width: 18,
    height: 18,
    borderRadius: Radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lineText: { flex: 1 },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.two,
    marginTop: Spacing.one,
  },
  totalLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  stepIndex: {
    width: 22,
    height: 22,
    borderRadius: Radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepBody: { flex: 1, gap: Spacing.half },
  stepMinutes: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
});
