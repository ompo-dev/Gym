import type { Entry } from '@/core/types';
import type { MealType } from '@/domains/schemas';

import {
  anchoredMinutes,
  buildRoutine,
  mealTypeFromHour,
  mealTypeFromText,
  mealTypeOf,
  median,
  slotTimes,
} from './mealTiming';

// Local-time epoch: constructed and read as local, so the test is timezone-safe.
const at = (day: number, hour: number, minute = 0): number =>
  new Date(2026, 0, day, hour, minute).getTime();

const meal = (id: string, createdAt: number, mealType?: MealType, text = 'comi'): Entry => ({
  id,
  date: '2026-01-01',
  domain: 'food',
  text,
  status: 'done',
  data: { items: [{ label: 'x', calories: 1, protein: 0, carbs: 0, fat: 0 }], mealType },
  error: null,
  createdAt,
});

describe('meal-type resolution', () => {
  test('reads the occasion from the words', () => {
    expect(mealTypeFromText('almocei arroz e frango')).toBe('lunch');
    expect(mealTypeFromText('jantei feijao')).toBe('dinner');
    expect(mealTypeFromText('café da manhã com pão')).toBe('breakfast');
    expect(mealTypeFromText('shake pós-treino')).toBe('postWorkout');
    expect(mealTypeFromText('só uma fruta')).toBeNull();
  });

  test('the model mealType wins over text and hour', () => {
    // Typed at 21:00 but tagged lunch: the tag wins, the clock is ignored.
    const entry = meal('a', at(1, 21, 0), 'lunch', 'jantei');
    expect(mealTypeOf(entry)).toBe('lunch');
  });

  test('falls back to text, then to the hour', () => {
    const noTag = meal('b', at(1, 21, 0), undefined, 'almocei tarde');
    expect(mealTypeOf(noTag)).toBe('lunch'); // from "almocei"
    const silent = meal('c', at(1, 8, 0), undefined, 'ovos');
    expect(mealTypeOf(silent)).toBe('breakfast'); // from the hour
  });

  test('hour buckets', () => {
    expect(mealTypeFromHour(at(1, 8))).toBe('breakfast');
    expect(mealTypeFromHour(at(1, 13))).toBe('lunch');
    expect(mealTypeFromHour(at(1, 20))).toBe('dinner');
    expect(mealTypeFromHour(at(1, 2))).toBe('nightSnack');
  });
});

describe('median', () => {
  test('odd and even', () => {
    expect(median([530, 100, 1000])).toBe(530);
    expect(median([100, 200])).toBe(150);
  });
});

describe('buildRoutine', () => {
  test('a single late log cannot move the learned lunch time', () => {
    // Six lunches at 12:50, one retroactive at 21:00 (same type, an outlier).
    const entries = [
      ...[1, 2, 3, 4, 5, 6].map((d) => meal(`l${d}`, at(d, 12, 50), 'lunch')),
      meal('late', at(7, 21, 0), 'lunch'),
    ];
    const routine = buildRoutine(entries);
    expect(routine.lunch).toBeDefined();
    expect(routine.lunch).toMatchObject({ hour: 12, minute: 50, samples: 7 });
  });

  test('two occasions logged together are dropped from timing', () => {
    const entries = [
      meal('l1', at(1, 12, 50), 'lunch'),
      meal('l2', at(2, 12, 50), 'lunch'),
      meal('l3', at(3, 12, 50), 'lunch'),
      // A night batch: lunch + dinner typed in the same minute → both retroactive.
      meal('batchLunch', at(4, 21, 0), 'lunch'),
      meal('batchDinner', at(4, 21, 0, ), 'dinner'),
    ];
    const routine = buildRoutine(entries);
    // The batched lunch at 21:00 was dropped, so lunch stays at 12:50...
    expect(routine.lunch).toMatchObject({ hour: 12, minute: 50, samples: 3 });
    // ...and dinner had only the batched sample, so it never learns.
    expect(routine.dinner).toBeUndefined();
  });

  test('too few samples do not become a learned slot', () => {
    const entries = [meal('b1', at(1, 8), 'breakfast'), meal('b2', at(2, 8), 'breakfast')];
    expect(buildRoutine(entries).breakfast).toBeUndefined();
  });
});

describe('slotTimes', () => {
  test('learned time when known, default otherwise', () => {
    const routine = buildRoutine(
      [1, 2, 3, 4].map((d) => meal(`l${d}`, at(d, 12, 40), 'lunch')),
    );
    const slots = slotTimes(routine);
    const lunch = slots.find((s) => s.type === 'lunch');
    const breakfast = slots.find((s) => s.type === 'breakfast');
    expect(lunch).toMatchObject({ hour: 12, minute: 40, learned: true });
    expect(breakfast).toMatchObject({ hour: 10, minute: 0, learned: false });
  });
});

describe('anchoredMinutes', () => {
  test('late-night wraps to the tail of the evening, not the head of the day', () => {
    // 04:00 is the anchor (0); 03:00 is near the end (1380); 13:00 is 540.
    expect(anchoredMinutes(at(1, 4, 0))).toBe(0);
    expect(anchoredMinutes(at(1, 13, 0))).toBe(540);
    expect(anchoredMinutes(at(1, 3, 0))).toBe(1380);
  });
});
