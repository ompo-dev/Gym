import {
  formatFoodQuantity,
  mealItemGrams,
  mergeDuplicateFoodItems,
  mergeFoodEdit,
  recipeShoppingList,
} from './food';
import { foodSchema, type FoodRecipeIngredient } from './schemas';

// The unit that lets a meal subtract from a purchase: "100 g" and "0,5 kg" are
// grams the fridge can weigh; "1 prato" is a portion it cannot, so it stays
// unknown rather than guessing.
test('a meal item weighs in grams only when its unit converts', () => {
  expect(mealItemGrams({ quantity: 100, unit: 'g' })).toBe(100);
  expect(mealItemGrams({ quantity: 0.5, unit: 'kg' })).toBe(500);
  expect(mealItemGrams({ quantity: 2, unit: 'L' })).toBe(2000);
  expect(mealItemGrams({ quantity: 1, unit: 'prato' })).toBeUndefined();
  expect(mealItemGrams({ quantity: undefined, unit: 'g' })).toBeUndefined();
});

test('food AI edit merges duplicate returned items and replaces reasoning', () => {
  const result = mergeFoodEdit(
    {
      items: [
        { label: 'ovo frito', calories: 90, protein: 6, carbs: 1, fat: 7, waterMl: 0 },
        { label: 'arroz', calories: 120, protein: 2, carbs: 24, fat: 1, waterMl: 0 },
      ],
      reasoning: 'Estimativa original com arroz e ovo frito.',
      confidence: 70,
    },
    {
      meal: {
        items: [
          { label: 'ovo frito', calories: 90, protein: 6, carbs: 1, fat: 7, waterMl: 0 },
          { label: 'ovo frito', quantity: 2, unit: 'ovos', calories: 180, protein: 12, carbs: 2, fat: 14, waterMl: 0 },
        ],
        reasoning: 'A refeicao final contem arroz e ovo frito, com a porcao de ovos estimada como tres unidades.',
        confidence: 72,
      },
      changes: [{ action: 'edited', item: 'ovo frito' }],
    },
  );

  expect(result.items).toHaveLength(2);
  const eggs = result.items.find((item) => item.label === 'ovo frito');
  expect(eggs?.calories).toBe(270);
  expect(formatFoodQuantity(eggs!)).toBe('3');
  expect(result.items.find((item) => item.label === 'arroz')?.calories).toBe(120);
  expect(result.reasoning).toBe(
    'A refeicao final contem arroz e ovo frito, com a porcao de ovos estimada como tres unidades.',
  );
});

test('food AI edit renames an item in place instead of duplicating it', () => {
  // "muda o feijão para feijão preto": the model returns the new item under a
  // new label and marks the original as edited. The old row must not survive.
  const result = mergeFoodEdit(
    {
      items: [
        { label: 'arroz', calories: 120, protein: 2, carbs: 24, fat: 1, waterMl: 0 },
        { label: 'feijão', calories: 100, protein: 6, carbs: 18, fat: 1, waterMl: 0 },
      ],
    },
    {
      meal: {
        items: [
          { label: 'arroz', calories: 120, protein: 2, carbs: 24, fat: 1, waterMl: 0 },
          { label: 'feijão preto', calories: 110, protein: 7, carbs: 20, fat: 1, waterMl: 0 },
        ],
      },
      changes: [{ action: 'edited', item: 'feijão' }],
    },
    'muda o feijão para feijão preto',
  );

  expect(result.items).toHaveLength(2);
  expect(result.items.map((item) => item.label).sort()).toEqual(['arroz', 'feijão preto']);
  expect(result.items.find((item) => item.label === 'feijão')).toBeUndefined();
});

test('food quantity label only shows useful quantities over one', () => {
  expect(formatFoodQuantity({ label: 'ovo', quantity: 2, unit: 'ovos', calories: 1, protein: 1, carbs: 1, fat: 1, waterMl: 0 })).toBe('2');
  expect(formatFoodQuantity({ label: 'arroz branco cozido', quantity: 2, calories: 1, protein: 1, carbs: 1, fat: 1, waterMl: 0 })).toBeNull();
  expect(formatFoodQuantity({ label: 'arroz', calories: 1, protein: 1, carbs: 1, fat: 1, waterMl: 0 })).toBeNull();
  expect(formatFoodQuantity({ label: 'ovo', quantity: 1, unit: 'ovo', calories: 1, protein: 1, carbs: 1, fat: 1, waterMl: 0 })).toBeNull();
});

test('food AI edit merges serving-label variants like refri and copo de refrigerante', () => {
  const result = mergeFoodEdit(
    {
      items: [
        {
          label: 'refrigerante',
          quantity: 1,
          unit: 'copo',
          calories: 100,
          protein: 0,
          carbs: 25,
          fat: 0,
          waterMl: 250,
          sugarG: 25,
          fiberG: 0,
          sodiumMg: 20,
        },
      ],
    },
    {
      meal: {
        items: [
          {
            label: 'copo de refri',
            quantity: 1,
            unit: 'copo',
            calories: 100,
            protein: 0,
            carbs: 25,
            fat: 0,
            waterMl: 250,
            sugarG: 25,
            fiberG: 0,
            sodiumMg: 20,
          },
        ],
      },
      changes: [{ action: 'edited', item: 'refrigerante' }],
    },
    'adicione mais um copo de refri',
  );

  expect(result.items).toHaveLength(1);
  expect(result.items[0].label).toBe('refrigerante');
  expect(result.items[0].calories).toBe(200);
  expect(result.items[0].sugarG).toBe(50);
  expect(result.items[0].sodiumMg).toBe(40);
  expect(formatFoodQuantity(result.items[0])).toBe('2');
});

test('merges duplicate barcode products into one countable item', () => {
  const result = mergeDuplicateFoodItems([
    {
      label: 'Leite integral',
      quantity: 1,
      unit: 'unidade',
      calories: 610,
      protein: 32,
      carbs: 47,
      fat: 34,
      waterMl: 1000,
      sugarG: 47,
      fiberG: 0,
      sodiumMg: 400,
    },
    {
      label: 'Leite integral',
      quantity: 1,
      unit: 'unidade',
      calories: 610,
      protein: 32,
      carbs: 47,
      fat: 34,
      waterMl: 1000,
      sugarG: 47,
      fiberG: 0,
      sodiumMg: 400,
    },
  ]);

  expect(result).toHaveLength(1);
  expect(result[0].calories).toBe(1220);
  expect(result[0].waterMl).toBe(2000);
  expect(result[0].sugarG).toBe(94);
  expect(result[0].sodiumMg).toBe(800);
  expect(formatFoodQuantity(result[0])).toBe('2');
});

// ---- recipe shopping list ---------------------------------------------------

const ingredient = (over: Partial<FoodRecipeIngredient> = {}): FoodRecipeIngredient => ({
  label: 'patinho',
  pantryItemId: null,
  ...over,
});

test('only what is missing goes on the shopping list', () => {
  const list = recipeShoppingList({
    servings: 2,
    ingredients: [
      ingredient({ label: 'patinho', pantryItemId: 'p1', estimatedCostCents: 3000 }),
      ingredient({ label: 'cebola', estimatedCostCents: 200 }),
    ],
    steps: [{ text: 'refogar' }],
  });

  expect(list.missing.map((i) => i.label)).toEqual(['cebola']);
  expect(list.totalCents).toBe(200);
});

test('one unknown price suppresses the total instead of under-reporting it', () => {
  // A partial total reads as "this is what it costs" and it is not.
  const list = recipeShoppingList({
    servings: 1,
    ingredients: [
      ingredient({ label: 'cebola', estimatedCostCents: 200 }),
      ingredient({ label: 'açafrão' }),
    ],
    steps: [{ text: 'refogar' }],
  });

  expect(list.missing).toHaveLength(2);
  expect(list.totalCents).toBeNull();
});

test('having everything at home costs nothing, not null', () => {
  const list = recipeShoppingList({
    servings: 1,
    ingredients: [ingredient({ pantryItemId: 'p1' })],
    steps: [{ text: 'grelhar' }],
  });
  expect(list.missing).toEqual([]);
  expect(list.totalCents).toBe(0);
});

test('a meal saved before recipes existed still parses', () => {
  // EntryRepository revalidates every persisted row against the current schema.
  const old = foodSchema.parse({
    items: [{ label: 'arroz', calories: 200, protein: 4, carbs: 44, fat: 0 }],
  });
  expect(old.recipe).toBeUndefined();
  expect(old.items).toHaveLength(1);
});

test('a malformed recipe drops alone, never taking the meal with it', () => {
  const parsed = foodSchema.parse({
    items: [{ label: 'arroz', calories: 200, protein: 4, carbs: 44, fat: 0 }],
    recipe: { servings: 'muitas', ingredients: [], steps: [] },
  });
  expect(parsed.recipe).toBeUndefined();
  expect(parsed.items).toHaveLength(1);
});
