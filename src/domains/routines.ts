import type { Entry } from '@/core/types';
import type { SavedRoutine, Weekday } from '@/data/SavedRoutineRepository';

import type { FoodData, RoutineFoodItem, WorkoutData } from './schemas';
import { uniqueWorkoutExerciseNames } from './workout';

function isFoodData(data: Entry['data']): data is FoodData {
  return Boolean(data && 'items' in data);
}

function isWorkoutData(data: Entry['data']): data is WorkoutData {
  return Boolean(data && 'sets' in data);
}

/**
 * A saved workout is the exercise list, nothing else. Loads, reps, distance and
 * time belong to the session you actually did — reapplying the routine gives
 * you the empty session to fill in.
 */
export function workoutRoutineItems(entries: Entry[], locale?: string): string[] {
  return uniqueWorkoutExerciseNames(
    entries
      .filter((entry) => entry.status === 'done' && isWorkoutData(entry.data))
      .map((entry) => ({ text: entry.text, data: entry.data as WorkoutData })),
    locale,
  );
}

/**
 * A saved diet is the opposite: the numbers are the point. Media is left out on
 * purpose — a photo belongs to the day it was taken, not to every repeat.
 */
export function foodRoutineItems(entries: Entry[]): RoutineFoodItem[] {
  return entries.flatMap((entry) =>
    entry.status === 'done' && isFoodData(entry.data)
      ? [{ text: entry.text, data: entry.data }]
      : [],
  );
}

export function routineItemsFor(
  domain: Entry['domain'],
  entries: Entry[],
  locale?: string,
): string[] | RoutineFoodItem[] {
  return domain === 'food' ? foodRoutineItems(entries) : workoutRoutineItems(entries, locale);
}

/** Today's weekday in the same 0-6 space the repository stores. */
export function weekdayOf(date: string): Weekday {
  // Parsed as local midnight so the weekday matches the user's calendar day.
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1).getDay() as Weekday;
}

/** One-line preview for list rows: exercise names, or meal names. */
export function routineSummary(routine: SavedRoutine): string {
  return routine.items
    .map((item) => (typeof item === 'string' ? item : item.text))
    .filter(Boolean)
    .join('  ·  ');
}
