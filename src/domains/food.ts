import { Colors } from '@/constants/theme';
import { buildOnboardingSummary, type OnboardingProfile } from '@/core/onboarding';
import { type FoodData, foodSchema } from '@/domains/schemas';
import type { DomainConfig } from '@/domains/types';
import { t } from '@/i18n';

export interface FoodTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  waterMl: number;
}

export interface FoodGoals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  waterMl: number;
}

const round = Math.round;
const foodColors = Colors.dark;

export const defaultFoodGoals: FoodGoals = {
  calories: 2000,
  protein: 150,
  carbs: 250,
  fat: 70,
  waterMl: 3000,
};

export function foodGoalsFromProfile(profile: OnboardingProfile): FoodGoals {
  const summary = buildOnboardingSummary(profile);
  return {
    calories: summary.calories,
    protein: summary.protein,
    carbs: summary.carbs,
    fat: summary.fat,
    waterMl: summary.waterMl,
  };
}

export function sumFoodData(data: FoodData): FoodTotals {
  return data.items.reduce<FoodTotals>(
    (acc, item) => ({
      calories: acc.calories + item.calories,
      protein: acc.protein + item.protein,
      carbs: acc.carbs + item.carbs,
      fat: acc.fat + item.fat,
      waterMl: acc.waterMl + item.waterMl,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, waterMl: 0 },
  );
}

export function formatWaterMl(value: number): string {
  const rounded = Math.round(value);
  if (rounded >= 1000) {
    const liters = rounded / 1000;
    return `${Number.isInteger(liters) ? liters.toFixed(0) : liters.toFixed(1)}L`;
  }
  return `${rounded}ml`;
}

export const foodConfig: DomainConfig<FoodData, FoodTotals> = {
  id: 'food',
  get title() {
    return t('diet.title');
  },
  get placeholder() {
    return t('diet.placeholder');
  },
  accent: foodColors.calories,
  schema: foodSchema,
  formatResult: (data) => `${round(sumFoodData(data).calories)} cal`,
  emptyTotals: { calories: 0, protein: 0, carbs: 0, fat: 0, waterMl: 0 },
  addToTotals: (totals, data) => {
    const summed = sumFoodData(data);
    return {
      calories: totals.calories + summed.calories,
      protein: totals.protein + summed.protein,
      carbs: totals.carbs + summed.carbs,
      fat: totals.fat + summed.fat,
      waterMl: totals.waterMl + summed.waterMl,
    };
  },
  describeTotals: (totals) => [
    { key: 'cal', label: 'cal', value: `${round(totals.calories)}`, color: foodColors.calories },
    {
      key: 'p',
      label: t('macro.protein'),
      value: `${round(totals.protein)}`,
      color: foodColors.protein,
    },
    { key: 'c', label: t('macro.carbs'), value: `${round(totals.carbs)}`, color: foodColors.carbs },
    { key: 'f', label: t('macro.fat'), value: `${round(totals.fat)}`, color: foodColors.fat },
    { key: 'h', label: t('macro.water'), value: formatWaterMl(totals.waterMl), color: foodColors.water },
  ],
};
