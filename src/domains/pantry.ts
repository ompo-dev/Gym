import type { Entry } from '@/core/types';
import type { FoodItem, FoodRecipe, NutritionPer100g } from '@/domains/schemas';

import { foodLabelKey, mealItemGrams } from './food';
import { isPurchaseData } from './purchase';

const round = Math.round;

/**
 * The pantry, derived from the purchase notes rather than stored.
 *
 * No table of its own on purpose: the notes already are the record, and a
 * second copy would need to stay in sync with edits, deletes and undo. What the
 * user writes stays the single source of truth.
 */

export interface PantryPurchase {
  entryId: string;
  date: string;
  boughtAt: number;
  label: string;
  quantity?: number;
  unit?: string;
  grams?: number;
  price?: number;
  nutrition?: NutritionPer100g;
  /** Why the model read the note this way — the same field a meal note shows. */
  reasoning?: string;
  confidence?: number;
}

export interface PantryItem {
  key: string;
  label: string;
  /** Newest first. This is the price history: it grows on every repeat buy. */
  history: PantryPurchase[];
  lastBoughtAt: number;
  lastPrice?: number;
  /** Derived, never stored. */
  lastPricePerKg?: number;
  lastPricePerUnit?: number;
  /**
   * From the most recent purchase that carried it. Older notes predate the
   * field entirely, so falling back down the history is what keeps a pantry
   * built before this shipped from looking empty.
   */
  nutrition?: NutritionPer100g;
  reasoning?: string;
  confidence?: number;
  /** Total grams bought across the history, when any purchase stated a weight. */
  purchasedGrams?: number;
  /**
   * What is left after every meal that drew from this product — purchased minus
   * eaten, floored at zero. Undefined when no purchase ever stated a weight, so
   * "3 kg left" and "amount unknown" never read the same.
   */
  remainingGrams?: number;
}

/**
 * How many grams a meal item is, when that can be known. Purchases are weighed
 * in kilos, so this is what lets "comi 100 g de arroz" subtract from "comprei
 * 5 kg". Unknown for "comi arroz" — and an unknown amount subtracts nothing,
 * which is the honest floor.
 */
/** "4,9 kg" past a kilo, "300 g" below it — the way a fridge reads. */
export function formatPantryGrams(grams: number): string {
  if (grams >= 1000) {
    const kg = grams / 1000;
    const text = (Math.round(kg * 10) / 10).toString().replace('.', ',');
    return `${text} kg`;
  }
  return `${round(grams)} g`;
}

export function mealConsumption(entries: Entry[]): Map<string, number> {
  const byKey = new Map<string, number>();
  for (const entry of entries) {
    if (entry.status !== 'done' || !entry.data || !('items' in entry.data)) continue;
    for (const item of entry.data.items) {
      if (!item.from) continue;
      byKey.set(item.from.pantryItemId, (byKey.get(item.from.pantryItemId) ?? 0) + item.from.grams);
    }
  }
  return byKey;
}

export function purchaseLines(entries: Entry[]): PantryPurchase[] {
  return entries.flatMap((entry) => {
    if (entry.status !== 'done' || !isPurchaseData(entry.data)) return [];
    // Bound once: the narrowing from the guard does not survive into the
    // callback below, where `entry.data` widens back to the whole union.
    const data = entry.data;
    return data.purchase.map((item) => ({
      entryId: entry.id,
      date: entry.date,
      boughtAt: entry.createdAt,
      label: item.label,
      quantity: item.quantity,
      unit: item.unit,
      grams: item.grams,
      price: item.price,
      nutrition: item.nutrition,
      reasoning: data.reasoning,
      confidence: data.confidence,
    }));
  });
}

/**
 * Undefined rather than 0 when it cannot be known — an invented price per kilo
 * is worse than none, because the recipe phase will spend money on it.
 */
export function pricePerKg(line: PantryPurchase): number | undefined {
  if (line.price === undefined || !line.grams) return undefined;
  return (line.price / line.grams) * 1000;
}

export function pricePerUnit(line: PantryPurchase): number | undefined {
  if (line.price === undefined || !line.quantity) return undefined;
  return line.price / line.quantity;
}

/** One row per product, most recently bought first. */
export function pantryItems(entries: Entry[]): PantryItem[] {
  const byKey = new Map<string, PantryPurchase[]>();
  for (const line of purchaseLines(entries)) {
    const key = foodLabelKey(line.label);
    byKey.set(key, [...(byKey.get(key) ?? []), line]);
  }
  const consumed = mealConsumption(entries);

  return [...byKey.entries()]
    .map(([key, lines]): PantryItem => {
      const history = [...lines].sort((a, b) => b.boughtAt - a.boughtAt);
      const last = history[0];
      // The newest *priced* line, not the newest line: "comprei banana" with no
      // price must not erase the R$/kg the previous purchase established.
      const priced = history.find((line) => line.price !== undefined);
      const weighed = history.filter((line) => line.grams !== undefined);
      const purchasedGrams = weighed.length
        ? weighed.reduce((sum, line) => sum + (line.grams ?? 0), 0)
        : undefined;
      return {
        key,
        label: last.label,
        history,
        lastBoughtAt: last.boughtAt,
        lastPrice: priced?.price,
        lastPricePerKg: priced ? pricePerKg(priced) : undefined,
        lastPricePerUnit: priced ? pricePerUnit(priced) : undefined,
        nutrition: history.find((line) => line.nutrition)?.nutrition,
        reasoning: history.find((line) => line.reasoning)?.reasoning,
        confidence: history.find((line) => line.confidence !== undefined)?.confidence,
        purchasedGrams,
        remainingGrams:
          purchasedGrams === undefined
            ? undefined
            : Math.max(0, round(purchasedGrams - (consumed.get(key) ?? 0))),
      };
    })
    .sort((a, b) => b.lastBoughtAt - a.lastBoughtAt);
}

/**
 * Links each meal item to the pantry product it was drawn from, and rewrites its
 * macros from that product's real per-100 g figures.
 *
 * Set by the app, not the model, for the same reason the recipe's pantry match
 * is: the model only knows the fridge through what we inject. Once linked, the
 * item carries where it came from and how much it took — the note becomes
 * self-documenting, the pantry subtracts the grams, and deleting the note
 * restores the stock with nothing to reverse.
 *
 * Macros come from the product because that is the honest number: "100 g de
 * arroz" should cost what YOUR bag of rice costs, not a generic guess. Only when
 * the product carries nutrition and the item states a weight we can scale.
 */
export function attachPantryProvenance(items: FoodItem[], pantry: PantryItem[]): FoodItem[] {
  if (!pantry.length) return items;
  const byKey = new Map(pantry.map((item) => [item.key, item]));
  return items.map((item) => {
    if (item.from) return item;
    const match = byKey.get(foodLabelKey(item.label));
    const grams = mealItemGrams(item);
    if (!match || grams === undefined) return item;
    const from = { pantryItemId: match.key, label: match.label, grams };
    const n = match.nutrition;
    if (!n) return { ...item, from };
    const scale = grams / 100;
    return {
      ...item,
      from,
      calories: round(n.calories * scale),
      protein: round(n.protein * scale),
      carbs: round(n.carbs * scale),
      fat: round(n.fat * scale),
      sugarG: round((n.sugarG ?? 0) * scale),
      fiberG: round((n.fiberG ?? 0) * scale),
      sodiumMg: round((n.sodiumMg ?? 0) * scale),
    };
  });
}

/**
 * A pantry item seen as a 100 g meal, so the existing nutrition sheet renders
 * it with no special case — the same trick `savedMealToEntry` uses for saved
 * meals. Returns null when nothing was ever recorded about the product, since
 * a detail sheet full of zeroes reads as "no calories", not "not known".
 *
 * 100 g and not the amount bought: half a kilo of mince in the fridge is not a
 * portion, and pretending it is would put 1100 kcal behind a tap.
 */
export function pantryItemToEntry(item: PantryItem): Entry | null {
  if (!item.nutrition) return null;
  const n = item.nutrition;
  return {
    id: item.key,
    date: '',
    domain: 'food',
    text: `${item.label} (100 g)`,
    status: 'done',
    data: {
      items: [
        {
          label: `${item.label} (100 g)`,
          calories: n.calories,
          protein: n.protein,
          carbs: n.carbs,
          fat: n.fat,
          waterMl: 0,
          sugarG: n.sugarG ?? 0,
          fiberG: n.fiberG ?? 0,
          sodiumMg: n.sodiumMg ?? 0,
        },
      ],
      reasoning: item.reasoning,
      confidence: item.confidence,
    },
    error: null,
    createdAt: item.lastBoughtAt,
  };
}

/** How many items the model is told about. Enough to cook from, short enough
 * to ride on every diet note without crowding out the note itself. */
const PANTRY_CONTEXT_LIMIT = 40;

/**
 * The fridge, as one line the model can read.
 *
 * The recipe prompt has always said "when a pantry list is provided, prefer
 * what is already there" — and nothing ever provided one. Asked for a recipe
 * with what was in the fridge, the model answered with ingredients the user
 * did not own, because it had never been told what they owned.
 */
export function pantryPromptContext(items: PantryItem[]): string | undefined {
  if (!items.length) return undefined;
  const list = items
    .slice(0, PANTRY_CONTEXT_LIMIT)
    .map((item) => {
      const facts = [
        item.lastPrice !== undefined ? `R$${item.lastPrice}` : '',
        // The product's own macros, so a meal drawn from the fridge is costed
        // with the real bag of rice and not a generic estimate.
        item.nutrition ? `${item.nutrition.calories}kcal/100g` : '',
        item.remainingGrams !== undefined ? `${item.remainingGrams}g left` : '',
      ].filter(Boolean);
      return facts.length ? `${item.label} (${facts.join(', ')})` : item.label;
    })
    .join('; ');
  return `In the pantry right now: ${list}.`;
}

/**
 * Marks the ingredients the kitchen already has.
 *
 * `recipePrompt` forbids the model from setting `pantryItemId` because "the app
 * fills those in from the pantry" — and nothing ever did. Every ingredient came
 * back unmatched, so `recipeShoppingList` counted all of them as missing and
 * the shopping list told the user to go buy the five kilos of rice standing in
 * their kitchen.
 *
 * Matched on `foodLabelKey`, the same key `pantryItems` groups by, so "5 kg de
 * arroz" in a purchase note and "arroz" in a recipe land on each other.
 */
export function matchRecipeToPantry(recipe: FoodRecipe, items: PantryItem[]): FoodRecipe {
  if (!items.length) return recipe;
  const owned = new Map(items.map((item) => [item.key, item]));
  return {
    ...recipe,
    ingredients: recipe.ingredients.map((ingredient) => {
      const match = owned.get(foodLabelKey(ingredient.label));
      // A price is what the missing ones cost. Owning it means nothing is
      // spent, and leaving an estimate on it would inflate the total.
      return match
        ? { ...ingredient, pantryItemId: match.key, estimatedCostCents: undefined }
        : ingredient;
    }),
  };
}

export interface PantryPriceSeries {
  labels: string[];
  /** Oldest first — a chart reads left to right, the history reads newest first. */
  pricePerKg: number[];
}

export interface PantryPriceChart {
  labels: string[];
  /** `null` is a shopping trip that did not include this product, not R$ 0. */
  lines: { key: string; label: string; points: (number | null)[] }[];
}

/**
 * Every product's price per kilo on one shared date axis — the shelf read the
 * way the workout monitor reads muscles, one line each across the weeks.
 *
 * Per kilo, like {@link pantryPriceSeries}: buying 500 g one week and 1 kg the
 * next is not a price rise, and a chart of what was paid would say it was.
 * Products bought on only one of the dates get a gap there rather than a zero —
 * plotting "not bought" at the floor reads as a giveaway.
 *
 * Null below two dates. One column is not a trend, and drawing it invents a
 * history the notes do not have.
 */
export function pantryPriceChart(items: PantryItem[]): PantryPriceChart | null {
  const priced = items.map((item) => {
    const byDate = new Map<string, number>();
    // Oldest first, so a product bought twice on one day settles on the price
    // that was paid last.
    for (const line of [...item.history].reverse()) {
      const perKg = pricePerKg(line);
      if (perKg !== undefined) byDate.set(line.date, perKg);
    }
    return { item, byDate };
  });

  const dates = [...new Set(priced.flatMap(({ byDate }) => [...byDate.keys()]))].sort();
  if (dates.length < 2) return null;

  const lines = priced
    .filter(({ byDate }) => byDate.size > 0)
    .map(({ item, byDate }) => ({
      key: item.key,
      label: item.label,
      points: dates.map((date) => byDate.get(date) ?? null),
    }));
  return lines.length ? { labels: dates.map((date) => date.slice(5)), lines } : null;
}

/**
 * The price of one product over time, ready for the same chart the workout
 * monitor uses.
 *
 * Per kilo rather than per purchase: buying 500 g one week and 1 kg the next is
 * not a price rise, and a chart of what was paid would say it was. Returns null
 * with fewer than two priced points — a single dot is not a trend, and drawing
 * one implies a history that does not exist.
 */
export function pantryPriceSeries(item: PantryItem): PantryPriceSeries | null {
  const points = [...item.history]
    .reverse()
    .flatMap((line) => {
      const perKg = pricePerKg(line);
      return perKg === undefined ? [] : [{ date: line.date, perKg }];
    });
  if (points.length < 2) return null;
  return {
    labels: points.map((point) => point.date.slice(5)),
    pricePerKg: points.map((point) => point.perKg),
  };
}
