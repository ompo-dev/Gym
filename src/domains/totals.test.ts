import { foodConfig } from './food';
import { workoutConfig } from './workout';

test('food totals sum items across entries (we do the math, not the AI)', () => {
  let t = foodConfig.emptyTotals;
  t = foodConfig.addToTotals(t, { items: [{ label: 'a', calories: 100, protein: 10, carbs: 20, fat: 5 }] });
  t = foodConfig.addToTotals(t, {
    items: [
      { label: 'b', calories: 50, protein: 5, carbs: 0, fat: 1 },
      { label: 'c', calories: 30, protein: 2, carbs: 3, fat: 0 },
    ],
  });

  expect(t.calories).toBe(180);
  expect(foodConfig.describeTotals(t).find((d) => d.key === 'cal')?.value).toBe('180');
});

test('food formatResult sums the entry items', () => {
  const line = foodConfig.formatResult({
    items: [
      { label: 'burger', calories: 600, protein: 0, carbs: 0, fat: 0 },
      { label: 'fries', calories: 400, protein: 0, carbs: 0, fat: 0 },
    ],
  });
  expect(line).toBe('1000 cal');
});

test('addToTotals never mutates the accumulator', () => {
  const empty = foodConfig.emptyTotals;
  foodConfig.addToTotals(empty, { items: [{ label: 'a', calories: 100, protein: 0, carbs: 0, fat: 0 }] });
  expect(empty.calories).toBe(0);
});

test('workout volume converts lb to kg', () => {
  let t = workoutConfig.emptyTotals;
  t = workoutConfig.addToTotals(t, {
    exercise: 'bench',
    sets: [{ weight: 100, unit: 'lb', reps: 10 }],
  });
  expect(t.sets).toBe(1);
  expect(Math.round(t.volumeKg)).toBe(454); // 100lb × 10 × 0.4536 ≈ 453.6
});

test('workout formatResult renders each set', () => {
  const line = workoutConfig.formatResult({
    exercise: 'Bench',
    sets: [{ weight: 95, unit: 'kg', reps: 7 }],
  });
  expect(line).toContain('95 kg × 7');
  expect(line).toContain('Bench');
});
