import { useEffect, useMemo, useState } from 'react';

import { defaultOnboardingProfile } from '@/core/onboarding';
import type { Entry } from '@/core/types';
import { EntryRepository } from '@/data/EntryRepository';
import { type FoodGoals, foodGoalsFromProfile } from '@/domains/food';
import { trainingAdjustment } from '@/domains/trainingLoad';
import { useAppStore } from '@/store/useAppStore';

/**
 * Without `date` this returns the declared target — what Settings and the
 * onboarding should show. With `date`, the target *for that day*: it adds what
 * was actually logged as training on that date.
 */
export function useFoodGoals(date?: string): FoodGoals {
  const storedProfile = useAppStore((s) => s.onboardingProfile);
  const profile = useMemo(() => storedProfile ?? defaultOnboardingProfile(), [storedProfile]);

  // Change signal, not source: the store only knows the workout tab once it has
  // been opened (`emptyDay()` claims today with zero entries), so the read
  // still comes from SQLite. Logging a set swaps the array identity and
  // re-fires the effect.
  // ponytail: one SELECT per workout mutation. If that ever costs, the fix is
  // the store publishing the loaded workout day.
  const workoutSignal = useAppStore((s) => s.workout.entries);
  const [dayWorkout, setDayWorkout] = useState<Entry[]>([]);

  useEffect(() => {
    if (!date) {
      setDayWorkout([]);
      return;
    }
    let alive = true;
    void EntryRepository.findByDate('workout', date).then((entries) => {
      if (alive) setDayWorkout(entries);
    });
    return () => {
      alive = false;
    };
  }, [date, workoutSignal]);

  return useMemo(
    () => foodGoalsFromProfile(profile, trainingAdjustment(dayWorkout, profile)),
    [dayWorkout, profile],
  );
}
