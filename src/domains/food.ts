import { type FoodData, foodSchema } from '@/domains/schemas';
import type { DomainConfig } from '@/domains/types';
import { t } from '@/i18n';

export interface FoodTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

const round = Math.round;

/** Sum the AI's per-item values — the model never adds, we do. */
function sumItems(data: FoodData): FoodTotals {
  return data.items.reduce<FoodTotals>(
    (acc, it) => ({
      calories: acc.calories + it.calories,
      protein: acc.protein + it.protein,
      carbs: acc.carbs + it.carbs,
      fat: acc.fat + it.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

export const foodConfig: DomainConfig<FoodData, FoodTotals> = {
  id: 'food',
  title: t('diet.title'),
  placeholder: t('diet.placeholder'),
  accent: '#FF7A1A',
  schema: foodSchema,
  formatResult: (d) => `${round(sumItems(d).calories)} cal`,
  emptyTotals: { calories: 0, protein: 0, carbs: 0, fat: 0 },
  addToTotals: (totals, d) => {
    const s = sumItems(d);
    return {
      calories: totals.calories + s.calories,
      protein: totals.protein + s.protein,
      carbs: totals.carbs + s.carbs,
      fat: totals.fat + s.fat,
    };
  },
  describeTotals: (t2) => [
    { key: 'cal', label: '🔥', value: `${round(t2.calories)}` },
    { key: 'c', label: t('macro.carbs'), value: `${round(t2.carbs)}`, color: '#E5484D' },
    { key: 'p', label: t('macro.protein'), value: `${round(t2.protein)}`, color: '#30A46C' },
    { key: 'f', label: t('macro.fat'), value: `${round(t2.fat)}`, color: '#8E4EC6' },
  ],
};
