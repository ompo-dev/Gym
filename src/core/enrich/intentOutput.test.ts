import { intentOutputSchema } from './deepseek';

/**
 * The gate in front of every caller. These pin the SHAPES it must let through,
 * not merely that a schema exists — `INTENT_COVERAGE` already asserted presence,
 * and the `workoutAuto` union still shipped without the split shape. The result:
 * the model split "supino 3x10 e corrida 10km" correctly, this gate rejected it
 * as "did not match schema", and the bus silently fell back to the local
 * one-exercise parse. Every branch the router prompt can answer with needs a
 * case here.
 */

const strengthLog = {
  exercise: 'Supino reto',
  kind: 'series',
  sets: [
    { reps: 10, weight: 100, unit: 'kg' },
    { reps: 10, weight: 100, unit: 'kg' },
  ],
};
const cardioLog = {
  exercise: 'Corrida',
  kind: 'cardio',
  sets: [{ distanceMeters: 10000, durationSeconds: 3600 }],
};
const meal = (label: string) => ({
  items: [{ label, calories: 300, protein: 20, carbs: 40, fat: 5 }],
});

describe('workoutAuto output gate', () => {
  const schema = intentOutputSchema('workoutAuto', 'workout');

  test('accepts a multi-exercise split — the shape the router prompt asks for', () => {
    const parsed = schema.safeParse({
      notes: [
        { text: 'supino reto 3 de 10 com 50 cada lado', data: strengthLog },
        { text: 'corrida de 10km em 1 hora', data: cardioLog },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  test('still accepts a single bare log', () => {
    expect(schema.safeParse(strengthLog).success).toBe(true);
  });

  test('still accepts a plan', () => {
    const parsed = schema.safeParse({
      days: [{ dayOffset: 0, exercises: [{ exercise: 'Supino', sets: [{ reps: 8, weight: 80 }] }] }],
    });
    expect(parsed.success).toBe(true);
  });

  test('rejects junk', () => {
    expect(schema.safeParse({ nope: true }).success).toBe(false);
  });
});

describe('foodAuto output gate', () => {
  const schema = intentOutputSchema('foodAuto', 'food');

  test('accepts a two-meal split — lunch and dinner in one note', () => {
    const parsed = schema.safeParse({
      notes: [
        { text: 'almocei arroz e frango', data: meal('arroz com frango') },
        { text: 'jantei arroz e feijao', data: meal('arroz com feijao') },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  test('accepts a purchase + meal split', () => {
    const parsed = schema.safeParse({
      notes: [
        { text: 'comprei arroz', data: { purchase: [{ label: 'arroz', grams: 5000, price: 30 }] } },
        { text: 'comi frango', data: meal('frango') },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  test('still accepts a single meal and a single purchase', () => {
    expect(schema.safeParse(meal('frango')).success).toBe(true);
    expect(
      schema.safeParse({ purchase: [{ label: 'arroz', grams: 1000 }] }).success,
    ).toBe(true);
  });
});
