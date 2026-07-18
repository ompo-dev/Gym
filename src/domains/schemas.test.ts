import { foodEditSchema, foodSchema, workoutSchema } from './schemas';

test('food schema parses items and coerces string numbers', () => {
  const result = foodSchema.parse({
    items: [
      {
        label: 'burger',
        quantity: '2',
        unit: 'unidades',
        calories: '620',
        protein: 30,
        carbs: 40,
        fat: 35,
        waterMl: '500',
        sugarG: '12.5',
        fiberG: '2',
        sodiumMg: '900',
      },
    ],
  });

  expect(result.items[0].calories).toBe(620);
  expect(result.items[0].quantity).toBe(2);
  expect(result.items[0].unit).toBe('unidades');
  expect(result.items[0].waterMl).toBe(500);
  expect(result.items[0].sugarG).toBe(12.5);
  expect(result.items[0].fiberG).toBe(2);
  expect(result.items[0].sodiumMg).toBe(900);
});

test('food schema defaults missing hydration and micronutrients to zero', () => {
  const result = foodSchema.parse({
    items: [{ label: 'burger', calories: 620, protein: 30, carbs: 40, fat: 35 }],
  });

  expect(result.items[0].waterMl).toBe(0);
  expect(result.items[0].sugarG).toBe(0);
  expect(result.items[0].fiberG).toBe(0);
  expect(result.items[0].sodiumMg).toBe(0);
});

test('food edit schema parses updated meal and change list', () => {
  const result = foodEditSchema.parse({
    description: 'arroz ajustado',
    meal: {
      items: [{ label: 'arroz', calories: 120, protein: 2, carbs: 24, fat: 1 }],
    },
    changes: [{ action: 'edited', item: 'arroz', note: 'porcao ajustada' }],
  });

  expect(result.description).toBe('arroz ajustado');
  expect(result.meal.items[0].waterMl).toBe(0);
  expect(result.changes[0].action).toBe('edited');
});

test('food schema allows empty items and rejects items missing a label', () => {
  expect(foodSchema.safeParse({ items: [] }).success).toBe(true);
  expect(
    foodSchema.safeParse({ items: [{ calories: 100, protein: 0, carbs: 0, fat: 0 }] }).success,
  ).toBe(false);
});

test('workout schema parses shorthand and coerces reps', () => {
  const result = workoutSchema.parse({
    exercise: null,
    sets: [{ weight: 95, unit: 'kg', reps: '7' }],
  });

  expect(result.sets[0].reps).toBe(7);
});

test('workout schema allows a set-less exercise but rejects bad units', () => {
  // An exercise with no sets yet is valid — the outliner builds sets after.
  expect(workoutSchema.safeParse({ exercise: 'bench', sets: [] }).success).toBe(true);
  expect(
    workoutSchema.safeParse({ exercise: null, sets: [{ weight: 1, unit: 'stone', reps: 1 }] })
      .success,
  ).toBe(false);
});
