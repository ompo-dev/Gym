import { mapOpenFoodFactsProduct } from './openFoodFacts';

test('maps Open Food Facts product nutriments into food data', () => {
  const result = mapOpenFoodFactsProduct('3017624010701', {
    product_name: 'Nutella',
    brands: 'Ferrero',
    image_front_url: 'https://example.com/front.jpg',
    nutriments: {
      'energy-kcal_100g': 539,
      proteins_100g: 6.3,
      carbohydrates_100g: 57.5,
      fat_100g: 30.9,
      sugars_100g: 56.3,
      fiber_100g: 6.3,
      sodium_100g: 0.107,
    },
  });

  expect(result?.text).toBe('Nutella (Ferrero)');
  expect(result?.imageUri).toBe('https://example.com/front.jpg');
  expect(result?.data.items[0]).toMatchObject({
    label: 'Nutella',
    quantity: 1,
    unit: 'unidade',
    calories: 539,
    protein: 6.3,
    carbs: 57.5,
    fat: 30.9,
    waterMl: 0,
    sugarG: 56.3,
    fiberG: 6.3,
    sodiumMg: 107,
  });
});

test('maps hydrating liquid package volume into water ml', () => {
  const result = mapOpenFoodFactsProduct('7890000000000', {
    product_name: 'Leite integral',
    quantity: '1 L',
    categories_tags: ['en:milks', 'en:dairy'],
    nutriments: {
      'energy-kcal_100g': 61,
      proteins_100g: 3.2,
      carbohydrates_100g: 4.7,
      fat_100g: 3.4,
    },
  });

  expect(result?.data.items[0].waterMl).toBe(1000);
});

test('does not count oil volume as hydration', () => {
  const result = mapOpenFoodFactsProduct('7890000000001', {
    product_name: 'Azeite de oliva',
    quantity: '500 ml',
    categories_tags: ['en:oils'],
    nutriments: {
      'energy-kcal_100g': 884,
      fat_100g: 100,
    },
  });

  expect(result?.data.items[0].waterMl).toBe(0);
});
