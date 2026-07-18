import { Colors } from '@/constants/theme';
import { buildOnboardingSummary, type OnboardingProfile } from '@/core/onboarding';
import { type FoodData, type FoodEditData, type FoodItem, foodSchema } from '@/domains/schemas';
import type { DomainConfig } from '@/domains/types';
import { t } from '@/i18n';

export interface FoodTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  waterMl: number;
  sugarG: number;
  fiberG: number;
  sodiumMg: number;
}

export interface FoodGoals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  waterMl: number;
  sugarG: number;
  fiberG: number;
  sodiumMg: number;
}

const round = Math.round;
const foodColors = Colors.dark;

export const defaultFoodGoals: FoodGoals = {
  calories: 2000,
  protein: 150,
  carbs: 250,
  fat: 70,
  waterMl: 3000,
  sugarG: 25,
  fiberG: 25,
  sodiumMg: 2300,
};

export function foodGoalsFromProfile(profile: OnboardingProfile): FoodGoals {
  const summary = buildOnboardingSummary(profile);
  return {
    calories: summary.calories,
    protein: summary.protein,
    carbs: summary.carbs,
    fat: summary.fat,
    waterMl: summary.waterMl,
    sugarG: summary.sugarG,
    fiberG: summary.fiberG,
    sodiumMg: summary.sodiumMg,
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
      sugarG: acc.sugarG + item.sugarG,
      fiberG: acc.fiberG + item.fiberG,
      sodiumMg: acc.sodiumMg + item.sodiumMg,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, waterMl: 0, sugarG: 0, fiberG: 0, sodiumMg: 0 },
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

const countableFoodUnits = new Set([
  'copo',
  'copos',
  'glass',
  'glasses',
  'xicara',
  'xicaras',
  'cup',
  'cups',
  'ovo',
  'ovos',
  'egg',
  'eggs',
  'fatia',
  'fatias',
  'slice',
  'slices',
  'pedaco',
  'pedacos',
  'piece',
  'pieces',
  'lata',
  'latas',
  'can',
  'cans',
  'garrafa',
  'garrafas',
  'bottle',
  'bottles',
  'unidade',
  'unidades',
  'unit',
  'units',
  'porcao',
  'porcoes',
  'serving',
  'servings',
]);

function normalizeFoodUnit(unit: string): string {
  return unit
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function formatFoodQuantity(item: FoodItem): string | null {
  if (!item.quantity || item.quantity <= 1 || !item.unit) return null;
  if (!countableFoodUnits.has(normalizeFoodUnit(item.unit))) return null;
  const quantity = Number.isInteger(item.quantity)
    ? String(item.quantity)
    : String(Number(item.quantity.toFixed(1))).replace('.', ',');
  return quantity;
}

function hasAdditiveIntent(instruction: string): boolean {
  return /\b(mais|outro|outra|adicion|adicionar|add|another|more)\b/i.test(instruction);
}

function foodLabelKey(label: string): string {
  let key = label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  key = key.replace(/^(um|uma|\d+(?:\.\d+)?)\s+/, '');
  for (const unit of [
    'copo',
    'copos',
    'xicara',
    'xicaras',
    'fatia',
    'fatias',
    'pedaco',
    'pedacos',
    'lata',
    'latas',
    'garrafa',
    'garrafas',
    'glass',
    'cup',
    'slice',
    'piece',
    'can',
    'bottle',
  ]) {
    key = key.replace(new RegExp(`^${unit}\\s+(de|da|do|das|dos|of)\\s+`), '');
  }
  return key.replace(/\brefri\b/g, 'refrigerante');
}

function sumFoodItems(base: FoodItem, next: FoodItem): FoodItem {
  const sameUnit = !base.unit || !next.unit || base.unit === next.unit;
  const quantity = sameUnit ? (base.quantity ?? 1) + (next.quantity ?? 1) : base.quantity;
  const unit = base.unit ?? next.unit;
  const amount = (value: number | undefined) => value ?? 0;
  return {
    label: base.label,
    mediaId: base.mediaId ?? next.mediaId,
    ...(quantity && quantity > 1 ? { quantity } : {}),
    ...(sameUnit && unit ? { unit } : {}),
    calories: amount(base.calories) + amount(next.calories),
    protein: amount(base.protein) + amount(next.protein),
    carbs: amount(base.carbs) + amount(next.carbs),
    fat: amount(base.fat) + amount(next.fat),
    waterMl: amount(base.waterMl) + amount(next.waterMl),
    sugarG: amount(base.sugarG) + amount(next.sugarG),
    fiberG: amount(base.fiberG) + amount(next.fiberG),
    sodiumMg: amount(base.sodiumMg) + amount(next.sodiumMg),
  };
}

export function mergeDuplicateFoodItems(items: FoodItem[]): FoodItem[] {
  const byLabel = new Map<string, FoodItem>();
  for (const item of items) {
    const key = foodLabelKey(item.label);
    const previous = byLabel.get(key);
    byLabel.set(key, previous ? sumFoodItems(previous, item) : item);
  }
  return [...byLabel.values()];
}

export function mergeFoodEdit(current: FoodData, edit: FoodEditData, instruction = ''): FoodData {
  const removed = new Set(
    edit.changes
      .filter((change) => change.action === 'removed')
      .map((change) => foodLabelKey(change.item)),
  );
  const returnedItems = new Map(
    mergeDuplicateFoodItems(edit.meal.items).map((item) => [foodLabelKey(item.label), item]),
  );
  const keptOrEdited = current.items
    .filter((item) => !removed.has(foodLabelKey(item.label)))
    .map((item) => {
      const key = foodLabelKey(item.label);
      const returned = returnedItems.get(key);
      if (!returned) return item;
      returnedItems.delete(key);
      const additive =
        hasAdditiveIntent(instruction) ||
        edit.changes.some((change) => change.action === 'added' && foodLabelKey(change.item) === key);
      const returnedLooksFinal =
        (returned.quantity ?? 1) > (item.quantity ?? 1) || returned.calories > item.calories;
      const merged = additive && !returnedLooksFinal ? sumFoodItems(item, returned) : returned;
      return {
        ...merged,
        label: item.label,
        mediaId: merged.mediaId ?? item.mediaId,
        quantity: merged.quantity ?? item.quantity,
        unit: merged.unit ?? item.unit,
      };
    });

  return foodSchema.parse({
    ...current,
    ...edit.meal,
    items: mergeDuplicateFoodItems([...keptOrEdited, ...returnedItems.values()]),
    reasoning: edit.meal.reasoning ?? current.reasoning,
    confidence: edit.meal.confidence ?? current.confidence,
  });
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
  emptyTotals: { calories: 0, protein: 0, carbs: 0, fat: 0, waterMl: 0, sugarG: 0, fiberG: 0, sodiumMg: 0 },
  addToTotals: (totals, data) => {
    const summed = sumFoodData(data);
    return {
      calories: totals.calories + summed.calories,
      protein: totals.protein + summed.protein,
      carbs: totals.carbs + summed.carbs,
      fat: totals.fat + summed.fat,
      waterMl: totals.waterMl + summed.waterMl,
      sugarG: totals.sugarG + summed.sugarG,
      fiberG: totals.fiberG + summed.fiberG,
      sodiumMg: totals.sodiumMg + summed.sodiumMg,
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
