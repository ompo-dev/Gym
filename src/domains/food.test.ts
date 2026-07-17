import { formatFoodQuantity, mergeDuplicateFoodItems, mergeFoodEdit } from './food';

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
    },
  ]);

  expect(result).toHaveLength(1);
  expect(result[0].calories).toBe(1220);
  expect(result[0].waterMl).toBe(2000);
  expect(formatFoodQuantity(result[0])).toBe('2');
});
