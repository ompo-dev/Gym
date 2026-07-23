import { foodConfig, foodNoteKind } from './food';
import {
  classifyFoodNote,
  isPurchaseData,
  pricePerKg,
  purchaseTotalPrice,
} from './purchase';
import { foodEntrySchema, type PurchaseData } from './schemas';
import { purchaseSchema, schemaByDomain } from './schemas';

const bought: PurchaseData = {
  purchase: [{ label: 'patinho', quantity: 0.5, unit: 'kg', grams: 500, price: 30 }],
};

test('buying is not eating', () => {
  expect(classifyFoodNote('comprei meio quilo de patinho por 30')).toBe('purchase');
  expect(classifyFoodNote('comprei banana')).toBe('purchase');
  expect(classifyFoodNote('paguei 12 no pao')).toBe('purchase');
});

test('eating wins over buying in the same note', () => {
  // Counting food only bought is a smaller lie than hiding food that was eaten.
  expect(classifyFoodNote('comprei um pastel e comi')).toBe('parse');
  expect(classifyFoodNote('arroz e frango')).toBe('parse');
});

test('"ate" the preposition does not become "ate" the verb', () => {
  // Accent folding would turn "até" into "ate" and kill this classification.
  expect(classifyFoodNote('comprei arroz ate sexta')).toBe('purchase');
  expect(classifyFoodNote('comprei arroz até sexta')).toBe('purchase');
});

test('a purchase never reaches the day totals', () => {
  // This is the whole reason the intent exists: "comprei meio quilo de patinho"
  // used to land ~1100 kcal on the day.
  const after = foodConfig.addToTotals(foodConfig.emptyTotals, bought);
  expect(after).toEqual(foodConfig.emptyTotals);
});

test('a meal still reaches the day totals', () => {
  const meal = { items: [{ label: 'arroz', calories: 200, protein: 4, carbs: 44, fat: 0 }] };
  const after = foodConfig.addToTotals(foodConfig.emptyTotals, schemaByDomain.food.parse(meal));
  expect(after.calories).toBe(200);
});

test('the row shows money for a purchase, calories for a meal', () => {
  expect(foodConfig.formatResult(bought)).toMatch(/30/);
  const meal = schemaByDomain.food.parse({
    items: [{ label: 'arroz', calories: 200, protein: 4, carbs: 44, fat: 0 }],
  });
  expect(foodConfig.formatResult(meal)).toBe('200 cal');
});

test('an empty purchase is rejected, not stored as a zero-price note', () => {
  expect(purchaseSchema.safeParse({ purchase: [] }).success).toBe(false);
});

test('the union keeps meal and purchase apart', () => {
  expect(isPurchaseData(bought)).toBe(true);
  expect(isPurchaseData({ items: [] })).toBe(false);
});

test('price per kilo is derived, never stored', () => {
  expect(pricePerKg({ price: 30, grams: 500 })).toBe(60);
  expect(pricePerKg({ price: 30 })).toBeUndefined();
  expect(pricePerKg({ grams: 500 })).toBeUndefined();
});

test('the line total adds up across products', () => {
  expect(
    purchaseTotalPrice({
      purchase: [
        { label: 'patinho', price: 30 },
        { label: 'banana', price: 8 },
        { label: 'sal' },
      ],
    }),
  ).toBe(38);
});

// The row colours and wires itself off this: money green, fridge blue, recipe
// purple. Deriving it in JSX instead would drift from `formatResult`, which
// makes the very same purchase/meal distinction a few lines above it.
test('a resolved food note reports which of the three things it is', () => {
  const bought = { purchase: [{ label: 'patinho', price: 30 }] };
  const meal = { items: [{ label: 'arroz', calories: 200, protein: 4, carbs: 44, fat: 0 }] };
  const recipe = {
    ...meal,
    recipe: {
      servings: 2,
      ingredients: [{ label: 'patinho' }],
      steps: [{ text: 'refogar' }],
    },
  };

  expect(foodNoteKind(foodEntrySchema.parse(bought))).toBe('purchase');
  expect(foodNoteKind(foodEntrySchema.parse(meal))).toBe('meal');
  expect(foodNoteKind(foodEntrySchema.parse(recipe))).toBe('recipe');
});
