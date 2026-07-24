import { useEffect } from 'react';
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

/**
 * Mirrors today's diet + workout totals (and food goals) into the App Group so
 * the native widgets can render them. Re-runs whenever the day's entries or the
 * profile change. iOS-only and best-effort — a missing native module (Expo Go)
 * or a failed write just leaves the widget on its last snapshot.
 */
export function useWidgetSync(ready: boolean): void {
  const foodSignal = useAppStore((s) => s.food.entries);
  const workoutSignal = useAppStore((s) => s.workout.entries);
  const storedProfile = useAppStore((s) => s.onboardingProfile);

  useEffect(() => {
    if (!ready || Platform.OS !== 'ios') return;
    let alive = true;
    const today = todayISO();
    const profile = storedProfile ?? defaultOnboardingProfile();

    void Promise.all([
      EntryRepository.findByDate('food', today),
      EntryRepository.findByDate('workout', today),
    ]).then(([foodEntries, workoutEntries]) => {
      if (!alive) return;

      const food = foodEntries.reduce(
        (acc, entry) => {
          if (entry.status !== 'done' || !entry.data || !('items' in entry.data)) return acc;
          const t = sumFoodData(entry.data as FoodData);
          return {
            calories: acc.calories + t.calories,
            protein: acc.protein + t.protein,
            carbs: acc.carbs + t.carbs,
            fat: acc.fat + t.fat,
          };
        },
        { calories: 0, protein: 0, carbs: 0, fat: 0 },
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
      });

      const workout = workoutEntries.reduce(
        (acc, entry) => {
          if (entry.status !== 'done' || !entry.data || !('sets' in entry.data)) return acc;
          const data = entry.data as WorkoutData;
          return {
            sets: acc.sets + data.sets.length,
            volumeKg: acc.volumeKg + data.sets.reduce((s, set) => s + getWorkoutSetVolume(set), 0),
          };
        },
        { sets: 0, volumeKg: 0 },
      );
      writeWorkoutWidget({ sets: workout.sets, volumeKg: Math.round(workout.volumeKg) });
    });

    return () => {
      alive = false;
    };
  }, [ready, foodSignal, workoutSignal, storedProfile]);
}
