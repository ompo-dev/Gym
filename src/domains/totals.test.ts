import { defaultOnboardingProfile } from '@/core/onboarding';

import { foodConfig, foodGoalsFromProfile } from './food';
import { workoutConfig } from './workout';

test('food totals sum items across entries', () => {
  let totals = foodConfig.emptyTotals;
  totals = foodConfig.addToTotals(totals, {
    items: [
      {
        label: 'a',
        calories: 100,
        protein: 10,
        carbs: 20,
        fat: 5,
        waterMl: 250,
        sugarG: 6,
        fiberG: 2,
        sodiumMg: 300,
      },
    ],
  });
  totals = foodConfig.addToTotals(totals, {
    items: [
      { label: 'b', calories: 50, protein: 5, carbs: 0, fat: 1, waterMl: 0, sugarG: 1, fiberG: 0, sodiumMg: 50 },
      { label: 'c', calories: 30, protein: 2, carbs: 3, fat: 0, waterMl: 500, sugarG: 2, fiberG: 3, sodiumMg: 100 },
    ],
  });

  expect(totals.calories).toBe(180);
  expect(totals.waterMl).toBe(750);
  expect(totals.sugarG).toBe(9);
  expect(totals.fiberG).toBe(5);
  expect(totals.sodiumMg).toBe(450);
  expect(foodConfig.describeTotals(totals).find((item) => item.key === 'cal')?.value).toBe('180');
  expect(foodConfig.describeTotals(totals).find((item) => item.key === 'h')?.value).toBe('750ml');
});

test('food formatResult sums the entry items', () => {
  const line = foodConfig.formatResult({
    items: [
      { label: 'burger', calories: 600, protein: 0, carbs: 0, fat: 0, waterMl: 0 },
      { label: 'fries', calories: 400, protein: 0, carbs: 0, fat: 0, waterMl: 0 },
    ],
  });

  expect(line).toBe('1000 cal');
});

test('addToTotals never mutates the accumulator', () => {
  const empty = foodConfig.emptyTotals;
  foodConfig.addToTotals(empty, {
    items: [{ label: 'a', calories: 100, protein: 0, carbs: 0, fat: 0, waterMl: 0 }],
  });
  expect(empty.calories).toBe(0);
  expect(empty.waterMl).toBe(0);
  expect(empty.sugarG).toBe(0);
});

test('food goals come from the onboarding profile', () => {
  const goals = foodGoalsFromProfile({ ...defaultOnboardingProfile(), goalDate: '2026-10-06' });

  expect(goals.calories).toBeGreaterThan(2400);
  expect(goals.protein).toBe(153);
  expect(goals.waterMl).toBe(3450);
  expect(goals.sugarG).toBe(25);
  expect(goals.sodiumMg).toBe(2300);
});

test('workout volume converts lb to kg', () => {
  let totals = workoutConfig.emptyTotals;
  totals = workoutConfig.addToTotals(totals, {
    exercise: 'bench',
    sets: [{ weight: 100, unit: 'lb', reps: 10 }],
  });

  expect(totals.sets).toBe(1);
  expect(Math.round(totals.volumeKg)).toBe(454);
});

test('workout totals include cardio duration and distance', () => {
  let totals = workoutConfig.emptyTotals;
  totals = workoutConfig.addToTotals(totals, {
    exercise: 'run',
    sets: [{ distanceMeters: 5000, durationSeconds: 1500 }],
  });

  expect(totals.sets).toBe(1);
  expect(totals.volumeKg).toBe(0);
  expect(totals.durationSeconds).toBe(1500);
  expect(totals.distanceMeters).toBe(5000);
});

test('workout formatResult renders each set', () => {
  const line = workoutConfig.formatResult({
    exercise: 'Bench',
    sets: [{ weight: 95, unit: 'kg', reps: 7 }],
  });

  expect(line).toContain('95 kg x 7');
  expect(line).toContain('Bench');
});
