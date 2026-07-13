import { foodSchema, workoutSchema } from './schemas';

test('food schema parses items and coerces string numbers', () => {
  const result = foodSchema.parse({
    items: [{ label: 'burger', calories: '620', protein: 30, carbs: 40, fat: 35 }],
  });
  expect(result.items[0].calories).toBe(620);
});

test('food schema rejects empty items and items missing a label', () => {
  expect(foodSchema.safeParse({ items: [] }).success).toBe(false);
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

test('workout schema rejects empty sets and bad units', () => {
  expect(workoutSchema.safeParse({ exercise: 'bench', sets: [] }).success).toBe(false);
  expect(
    workoutSchema.safeParse({ exercise: null, sets: [{ weight: 1, unit: 'stone', reps: 1 }] })
      .success,
  ).toBe(false);
});
