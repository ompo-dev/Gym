import type { Entry } from '@/core/types';

import { foodRoutineItems, weekdayOf, workoutRoutineItems } from './routines';
import type { FoodData, WorkoutData } from './schemas';

let seq = 0;
function entry(partial: Partial<Entry> & Pick<Entry, 'domain' | 'text' | 'data'>): Entry {
  seq += 1;
  return {
    id: `e${seq}`,
    date: '2026-07-19',
    status: 'done',
    error: null,
    createdAt: seq,
    ...partial,
  } as Entry;
}

const lift = (exercise: string): WorkoutData => ({
  exercise,
  kind: 'strength',
  sets: [{ weight: 100, unit: 'kg', reps: 8 }],
});

const meal = (label: string, calories: number): FoodData => ({
  items: [
    {
      label,
      calories,
      protein: 10,
      carbs: 20,
      fat: 5,
      waterMl: 0,
      sugarG: 0,
      fiberG: 0,
      sodiumMg: 0,
    },
  ],
});

test('a saved workout keeps only exercise names, never the loads', () => {
  const entries = [
    entry({ domain: 'workout', text: 'supino\n100x8', data: lift('Supino') }),
    entry({ domain: 'workout', text: 'leg press\n200x10', data: lift('Leg press') }),
  ];

  const items = workoutRoutineItems(entries);

  expect(items).toEqual(['Supino', 'Leg press']);
  expect(JSON.stringify(items)).not.toContain('100');
  expect(JSON.stringify(items)).not.toContain('sets');
});

test('a saved workout drops duplicate exercises', () => {
  const entries = [
    entry({ domain: 'workout', text: 'supino', data: lift('Supino') }),
    entry({ domain: 'workout', text: 'supino', data: lift('supino') }),
  ];

  expect(workoutRoutineItems(entries)).toEqual(['Supino']);
});

test('a saved diet keeps the full nutrition of every meal', () => {
  const entries = [
    entry({ domain: 'food', text: 'cafe da manha', data: meal('pao', 250) }),
    entry({ domain: 'food', text: 'almoco', data: meal('arroz', 600) }),
  ];

  const items = foodRoutineItems(entries);

  expect(items).toHaveLength(2);
  expect(items[0].text).toBe('cafe da manha');
  expect(items[0].data.items[0].calories).toBe(250);
  expect(items[1].data.items[0].calories).toBe(600);
});

test('unresolved entries are not saved into a routine', () => {
  const entries = [
    entry({ domain: 'food', text: 'pensando', data: null, status: 'thinking' }),
    entry({ domain: 'food', text: 'erro', data: null, status: 'error' }),
    entry({ domain: 'food', text: 'ok', data: meal('ovo', 90) }),
  ];

  expect(foodRoutineItems(entries)).toHaveLength(1);
});

test('weekday is derived in local time, not UTC', () => {
  // 2026-07-19 is a Sunday; a UTC-based parse would slip to Saturday in BRT.
  expect(weekdayOf('2026-07-19')).toBe(0);
  expect(weekdayOf('2026-07-20')).toBe(1);
  expect(weekdayOf('2026-07-24')).toBe(5);
});
