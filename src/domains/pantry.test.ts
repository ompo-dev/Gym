import type { Entry } from '@/core/types';

import { foodConfig } from './food';
import {
  attachPantryProvenance,
  matchRecipeToPantry,
  pantryItems,
  pantryItemToEntry,
  pantryPriceChart,
  pantryPriceSeries,
  pantryPromptContext,
  purchaseLines,
} from './pantry';
import type { FoodItem, PurchaseItem } from './schemas';

let clock = 0;
const bought = (items: PurchaseItem[], date = '2026-07-21'): Entry => ({
  id: `e${(clock += 1)}`,
  date,
  domain: 'food',
  text: 'comprei',
  status: 'done',
  data: { purchase: items },
  error: null,
  createdAt: clock,
});

const meal: Entry = {
  id: 'meal',
  date: '2026-07-21',
  domain: 'food',
  text: 'arroz e frango',
  status: 'done',
  data: { items: [{ label: 'arroz', calories: 200, protein: 4, carbs: 44, fat: 0 }] },
  error: null,
  createdAt: 99,
};

beforeEach(() => {
  clock = 0;
});

test('meals never enter the pantry', () => {
  expect(purchaseLines([meal])).toEqual([]);
  expect(pantryItems([meal])).toEqual([]);
});

test('unresolved purchases are not stock yet', () => {
  const pending = { ...bought([{ label: 'banana' }]), status: 'thinking' as const };
  expect(pantryItems([pending])).toEqual([]);
});

test('buying the same product twice builds one row with history', () => {
  const items = pantryItems([
    bought([{ label: 'Patinho', grams: 500, price: 30 }]),
    bought([{ label: 'patinho', grams: 1000, price: 55 }]),
  ]);

  expect(items).toHaveLength(1);
  expect(items[0].history).toHaveLength(2);
  // Newest first, and the price per kilo follows the newest buy.
  expect(items[0].lastPricePerKg).toBe(55);
});

test('a later purchase with no price keeps the last known price per kilo', () => {
  // "comprei banana" must not erase the R$/kg the previous buy established.
  const items = pantryItems([
    bought([{ label: 'patinho', grams: 500, price: 30 }]),
    bought([{ label: 'patinho' }]),
  ]);

  expect(items[0].history).toHaveLength(2);
  expect(items[0].lastPricePerKg).toBe(60);
  expect(items[0].lastPrice).toBe(30);
});

test('price per kilo is undefined rather than invented', () => {
  // The recipe phase spends money on this number; a made-up one is worse than none.
  const items = pantryItems([bought([{ label: 'sal', price: 4 }])]);
  expect(items[0].lastPricePerKg).toBeUndefined();
  expect(items[0].lastPrice).toBe(4);
});

test('price per unit comes from quantity when there is no weight', () => {
  const items = pantryItems([bought([{ label: 'ovo', quantity: 12, unit: 'un', price: 18 }])]);
  expect(items[0].lastPricePerUnit).toBe(1.5);
});

test('the shelf is ordered by what was bought most recently', () => {
  const items = pantryItems([
    bought([{ label: 'arroz' }]),
    bought([{ label: 'feijao' }]),
    bought([{ label: 'cafe' }]),
  ]);
  expect(items.map((i) => i.label)).toEqual(['cafe', 'feijao', 'arroz']);
});

test('one note buying several products yields several rows', () => {
  const items = pantryItems([
    bought([
      { label: 'patinho', price: 30 },
      { label: 'banana', price: 8 },
    ]),
  ]);
  expect(items.map((i) => i.label).sort()).toEqual(['banana', 'patinho']);
});

const boughtWithNutrition = (over: Record<string, unknown> = {}): Entry => ({
  id: 'e1',
  date: '2026-07-22',
  domain: 'food',
  text: 'comprei meio quilo de patinho por 30',
  status: 'done',
  data: {
    purchase: [
      {
        label: 'patinho',
        grams: 500,
        price: 30,
        nutrition: { calories: 143, protein: 26, carbs: 0, fat: 4, sodiumMg: 75 },
        ...over,
      },
    ],
  },
  error: null,
  createdAt: 1,
});

test('a purchase keeps the nutrition it was bought with', () => {
  const [item] = pantryItems([boughtWithNutrition()]);

  expect(item.nutrition?.calories).toBe(143);
});

// ---- eating from the fridge -------------------------------------------------

const ate = (items: FoodItem[]): Entry => ({
  id: `m${(clock += 1)}`,
  date: '2026-07-22',
  domain: 'food',
  text: 'comi',
  status: 'done',
  data: { items },
  error: null,
  createdAt: clock,
});

const item = (over: Partial<FoodItem>): FoodItem => ({
  label: 'arroz',
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  waterMl: 0,
  sugarG: 0,
  fiberG: 0,
  sodiumMg: 0,
  ...over,
});

// The whole point of provenance: 5 kg bought, 100 g eaten, 4.9 kg left — and
// deleting the meal note makes it 5 kg again on the next read, no ledger.
test('eating a linked item subtracts its grams from the shelf', () => {
  const shelf = pantryItems([
    bought([{ label: 'arroz', grams: 5000, price: 30 }]),
    ate([item({ label: 'arroz', from: { pantryItemId: 'arroz', label: 'arroz', grams: 100 } })]),
  ]);

  expect(shelf[0].remainingGrams).toBe(4900);
});

test('an unlinked meal touches no stock', () => {
  const shelf = pantryItems([
    bought([{ label: 'arroz', grams: 5000, price: 30 }]),
    ate([item({ label: 'arroz' })]),
  ]);

  expect(shelf[0].remainingGrams).toBe(5000);
});

test('a shelf whose purchases never stated a weight has no remaining', () => {
  const shelf = pantryItems([bought([{ label: 'arroz', price: 8 }])]);
  expect(shelf[0].remainingGrams).toBeUndefined();
});

test('stock never goes negative when more was eaten than the note weighed', () => {
  const shelf = pantryItems([
    bought([{ label: 'arroz', grams: 500, price: 8 }]),
    ate([item({ label: 'arroz', from: { pantryItemId: 'arroz', label: 'arroz', grams: 900 } })]),
  ]);
  expect(shelf[0].remainingGrams).toBe(0);
});

// ---- linking a meal to the shelf --------------------------------------------

// Set by the app, not the model: "100 g de arroz" is priced with YOUR bag, and
// the item records where it came from so the fridge can subtract it.
test('a weighed item that matches the shelf is linked and repriced', () => {
  const shelf = pantryItems([bought([{ label: 'arroz', grams: 1000, price: 8, nutrition: { calories: 130, protein: 2, carbs: 28, fat: 0 } }])]);

  const [linked] = attachPantryProvenance([item({ label: 'arroz', quantity: 100, unit: 'g' })], shelf);

  expect(linked.from).toEqual({ pantryItemId: 'arroz', label: 'arroz', grams: 100 });
  expect(linked.calories).toBe(130); // 130/100g × 100g
});

test('an item with no weight cannot be linked', () => {
  const shelf = pantryItems([bought([{ label: 'arroz', grams: 1000, price: 8 }])]);
  expect(attachPantryProvenance([item({ label: 'arroz' })], shelf)[0].from).toBeUndefined();
});

test('a food not on the shelf is left untouched', () => {
  const shelf = pantryItems([bought([{ label: 'arroz', grams: 1000, price: 8 }])]);
  const [untouched] = attachPantryProvenance([item({ label: 'frango', quantity: 100, unit: 'g', calories: 99 })], shelf);
  expect(untouched.from).toBeUndefined();
  expect(untouched.calories).toBe(99);
});

// The figure is per 100 g of product, never per the amount bought: half a kilo
// of mince is stock, not a portion, and showing 715 kcal behind a tap would
// read as something the user ate.
test('the detail shows 100 g, not the amount bought', () => {
  const entry = pantryItemToEntry(pantryItems([boughtWithNutrition()])[0]);

  expect(entry?.text).toContain('100 g');
  expect(entry?.data && 'items' in entry.data && entry.data.items[0].calories).toBe(143);
});

// Notes written before nutrition was captured have none, and a sheet of zeroes
// would claim the product is calorie-free rather than unknown.
test('a purchase with no nutrition has no detail to open', () => {
  const [item] = pantryItems([boughtWithNutrition({ nutrition: undefined })]);

  expect(pantryItemToEntry(item)).toBeNull();
});

// The recipe prompt asked the model to cook from the pantry, and the pantry was
// never in the request. It answered with ingredients the user did not own.
test('the pantry is rendered as something the model can read', () => {
  const context = pantryPromptContext(pantryItems([boughtWithNutrition()]));

  expect(context).toContain('patinho');
});

test('an empty pantry sends nothing rather than an empty list', () => {
  expect(pantryPromptContext([])).toBeUndefined();
});

// One note, several products: they belong in the fridge as separate items, and
// the badge on the note shows what the whole shop cost — not the first line.
test('a note with several purchases splits into separate pantry items', () => {
  const entry: Entry = {
    id: 'e2',
    date: '2026-07-22',
    domain: 'food',
    text: 'comprei 1kg de arroz por 8, 500g de patinho por 30 e 12 ovos por 14',
    status: 'done',
    data: {
      purchase: [
        { label: 'arroz', grams: 1000, price: 8 },
        { label: 'patinho', grams: 500, price: 30 },
        { label: 'ovos', quantity: 12, unit: 'unidade', price: 14 },
      ],
    },
    error: null,
    createdAt: 2,
  };

  expect(pantryItems([entry]).map((item) => item.label).sort()).toEqual([
    'arroz',
    'ovos',
    'patinho',
  ]);
  expect(foodConfig.formatResult(entry.data as never)).toContain('52');
});

// Per kilo, not per purchase: half a kilo one week and a whole one the next is
// not a price rise, and a chart of what was paid would claim it was.
test('the price history is charted per kilo', () => {
  const buy = (id: string, date: string, grams: number, price: number): Entry => ({
    id,
    date,
    domain: 'food',
    text: 'comprei patinho',
    status: 'done',
    data: { purchase: [{ label: 'patinho', grams, price }] },
    error: null,
    createdAt: Number(id),
  });

  const [item] = pantryItems([buy('1', '2026-07-01', 500, 30), buy('2', '2026-07-20', 1000, 64)]);
  const series = pantryPriceSeries(item);

  // 30 for 500 g is 60/kg; 64 for 1 kg is 64/kg — a real rise, oldest first.
  expect(series?.pricePerKg).toEqual([60, 64]);
});

test('a single purchase is not a trend', () => {
  expect(pantryPriceSeries(pantryItems([boughtWithNutrition()])[0])).toBeNull();
});

// ---- the whole shelf on one axis --------------------------------------------

const buyOn = (date: string, label: string, grams: number, price: number): Entry => ({
  id: `${date}-${label}`,
  date,
  domain: 'food',
  text: 'comprei',
  status: 'done',
  data: { purchase: [{ label, grams, price }] },
  error: null,
  createdAt: Number(date.replace(/-/g, '')),
});

test('every product shares one date axis', () => {
  const shelf = pantryItems([
    buyOn('2026-07-01', 'arroz', 1000, 8),
    buyOn('2026-07-01', 'patinho', 1000, 60),
    buyOn('2026-07-20', 'arroz', 1000, 10),
    buyOn('2026-07-20', 'patinho', 1000, 64),
  ]);

  const chart = pantryPriceChart(shelf);

  expect(chart?.labels).toEqual(['07-01', '07-20']);
  expect(chart?.lines.map((line) => [line.label, line.points])).toEqual([
    ['arroz', [8, 10]],
    ['patinho', [60, 64]],
  ]);
});

// Drawing "not bought" at the floor reads as the week the rice was free.
test('a shopping trip without a product is a gap, not a zero', () => {
  const shelf = pantryItems([
    buyOn('2026-07-01', 'arroz', 1000, 8),
    buyOn('2026-07-20', 'patinho', 1000, 64),
  ]);

  expect(pantryPriceChart(shelf)?.lines.map((line) => line.points)).toEqual([
    [null, 64],
    [8, null],
  ]);
});

test('one shopping trip is not a trend', () => {
  expect(pantryPriceChart(pantryItems([buyOn('2026-07-01', 'arroz', 1000, 8)]))).toBeNull();
});

test('products bought without a price have no line to draw', () => {
  const shelf = pantryItems([bought([{ label: 'arroz' }]), bought([{ label: 'feijao' }])]);
  expect(pantryPriceChart(shelf)).toBeNull();
});

// ---- matching a recipe against the shelf ------------------------------------

const recipeOf = (...labels: string[]) => ({
  servings: 2,
  ingredients: labels.map((label) => ({ label, pantryItemId: null })),
  steps: [{ text: 'cozinhar' }],
});

// `recipePrompt` forbids the model from setting pantryItemId, because "the app
// fills those in from the pantry" — and nothing did, so a recipe told the user
// to go buy the five kilos of rice standing in their kitchen.
test('an ingredient already on the shelf is not on the shopping list', () => {
  const shelf = pantryItems([bought([{ label: '5 kg de arroz', grams: 5000, price: 30 }])]);

  const matched = matchRecipeToPantry(recipeOf('arroz', 'cebola'), shelf);

  expect(matched.ingredients.map((i) => i.pantryItemId)).toEqual([shelf[0].key, null]);
});

test('owning it costs nothing, so any estimate on it is dropped', () => {
  const shelf = pantryItems([bought([{ label: 'arroz', grams: 1000, price: 8 }])]);
  const recipe = {
    ...recipeOf('arroz'),
    ingredients: [{ label: 'arroz', pantryItemId: null, estimatedCostCents: 800 }],
  };

  expect(matchRecipeToPantry(recipe, shelf).ingredients[0].estimatedCostCents).toBeUndefined();
});

test('an empty fridge leaves the recipe exactly as the model wrote it', () => {
  const recipe = recipeOf('arroz');
  expect(matchRecipeToPantry(recipe, [])).toBe(recipe);
});
