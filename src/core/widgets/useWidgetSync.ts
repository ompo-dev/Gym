import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import { todayISO } from '@/core/date';
import { defaultOnboardingProfile } from '@/core/onboarding';
import { EntryRepository } from '@/data/EntryRepository';
import { foodGoalsFromProfile, sumFoodData } from '@/domains/food';
import type { FoodData, WorkoutData } from '@/domains/schemas';
import { trainingAdjustment } from '@/domains/trainingLoad';
import { getWorkoutSetVolume } from '@/domains/workout';
import { useAppStore } from '@/store/useAppStore';

import { writeFoodWidget, writeWorkoutWidget } from './widgetSync';

/** How long to wait after the last store change before writing the snapshot.
 *  Entries resolve thinking → done in ~1-2 s; coalescing avoids writing
 *  empty data that WidgetKit may rate-limit past the real snapshot. */
const COALESCE_MS = 1_500;

/**
 * Mirrors today's diet + workout totals (and food goals) into the App Group so
 * the native widgets can render them. Re-runs whenever the day's entries or the
 * profile change. iOS-only and best-effort — a missing native module (Expo Go)
 * or a failed write just leaves the widget on its last snapshot.
 *
 * Uses a coalesce window: rapid store updates (thinking → done for the same
 * entry) are collapsed into one write so the widget never sees the intermediate
 * empty state.
 */
export function useWidgetSync(ready: boolean): void {
  const foodSignal = useAppStore((s) => s.food.entries);
  const workoutSignal = useAppStore((s) => s.workout.entries);
  const storedProfile = useAppStore((s) => s.onboardingProfile);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!ready || Platform.OS !== 'ios') return;

    if (timer.current) clearTimeout(timer.current);
    const today = todayISO();
    const profile = storedProfile ?? defaultOnboardingProfile();

    timer.current = setTimeout(() => {
      timer.current = null;
      void Promise.all([
        EntryRepository.findByDate('food', today),
        EntryRepository.findByDate('workout', today),
      ]).then(([foodEntries, workoutEntries]) => {
        const food = foodEntries.reduce(
          (acc, entry) => {
            if (entry.status !== 'done' || !entry.data || !('items' in entry.data)) return acc;
            const t = sumFoodData(entry.data as FoodData);
            return {
              calories: acc.calories + t.calories,
              protein: acc.protein + t.protein,
              carbs: acc.carbs + t.carbs,
              fat: acc.fat + t.fat,
              sugarG: acc.sugarG + t.sugarG,
              fiberG: acc.fiberG + t.fiberG,
              sodiumMg: acc.sodiumMg + t.sodiumMg,
            };
          },
          { calories: 0, protein: 0, carbs: 0, fat: 0, sugarG: 0, fiberG: 0, sodiumMg: 0 },
        );
        const goals = foodGoalsFromProfile(profile, trainingAdjustment(workoutEntries, profile));
        writeFoodWidget({
          calories: Math.round(food.calories),
          caloriesGoal: Math.round(goals.calories),
          protein: Math.round(food.protein),
          proteinGoal: Math.round(goals.protein),
          carbs: Math.round(food.carbs),
          carbsGoal: Math.round(goals.carbs),
          fat: Math.round(food.fat),
          fatGoal: Math.round(goals.fat),
          sugarG: Math.round(food.sugarG),
          sugarGoal: Math.round(goals.sugarG),
          fiberG: Math.round(food.fiberG),
          fiberGoal: Math.round(goals.fiberG),
          sodiumMg: Math.round(food.sodiumMg),
          sodiumGoal: Math.round(goals.sodiumMg),
        });

        const workout = workoutEntries.reduce(
          (acc, entry) => {
            if (entry.status !== 'done' || !entry.data || !('sets' in entry.data)) return acc;
            const data = entry.data as WorkoutData;
            return {
              sets: acc.sets + data.sets.length,
              volumeKg: acc.volumeKg + data.sets.reduce((s, set) => s + getWorkoutSetVolume(set), 0),
              durationSeconds:
                acc.durationSeconds + data.sets.reduce((s, set) => s + (set.durationSeconds ?? 0), 0),
              distanceMeters:
                acc.distanceMeters + data.sets.reduce((s, set) => s + (set.distanceMeters ?? 0), 0),
            };
          },
          { sets: 0, volumeKg: 0, durationSeconds: 0, distanceMeters: 0 },
        );
        writeWorkoutWidget({
          sets: workout.sets,
          volumeKg: Math.round(workout.volumeKg),
          durationSeconds: workout.durationSeconds,
          distanceMeters: Math.round(workout.distanceMeters),
        });
      }).catch(() => {
        // SQLite read failed — widget keeps its last snapshot. The coalesce
        // timer guarantees this is not a transient thinking-state read.
      });
    }, COALESCE_MS);

    return () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [ready, foodSignal, workoutSignal, storedProfile]);
}
