import type { Entry } from '@/core/types';
import {
  assumedDailyTrainingKcal,
  noTrainingAdjustment,
  type OnboardingProfile,
  type TrainingAdjustment,
} from '@/core/onboarding';

import type { WorkoutSet } from './schemas';
import { isWorkoutData } from './workout';

/**
 * Turns the day's workout log into a calorie and protein adjustment.
 *
 * This is the bridge that was missing: every existing link runs declaration →
 * diet (`activity`, `considerations`), so someone who trained six times a week
 * ate exactly like someone who trained none.
 */

/** ~1 kcal per kg of body weight per km covered — holds for running and walking. */
const KCAL_PER_KG_PER_KM = 1.036;
/** Cardio with no distance logged: only the clock says anything. */
const CARDIO_MET = 7;
/** Lifting, counting the rest between sets. */
const STRENGTH_MET = 3.5;
/** One working set plus its rest. */
const SECONDS_PER_STRENGTH_SET = 180;
/**
 * Not all the burn comes back to the plate — estimates run high and appetite
 * compensates. But this multiplies a figure the assumed baseline was *already*
 * subtracted from, so 0.5 was a second haircut on top of the first: a real
 * 12-set session came out at +48 kcal on a 2500 kcal target, which reads on
 * screen as "I trained and nothing happened".
 * ponytail: this is the main knob of the whole bridge.
 */
const TRAINING_CREDIT = 0.75;
/** Sanity ceiling: a mistyped "100km" must not become 5000 kcal of licence. */
const MAX_TRAINING_BONUS_KCAL = 600;
const STRENGTH_PROTEIN_BONUS_PER_KG = 0.2;
const MIN_SETS_FOR_PROTEIN_BONUS = 8;

const kcalPerMinute = (met: number, weightKg: number): number => (met * 3.5 * weightKg) / 200;

/**
 * One set, one cost — never two. A run carries distance AND duration in the
 * same set; counting both doubled the same effort.
 */
export function setBurnKcal(set: WorkoutSet, weightKg: number): number {
  if (set.distanceMeters) return (set.distanceMeters / 1000) * KCAL_PER_KG_PER_KM * weightKg;
  if (set.durationSeconds) return kcalPerMinute(CARDIO_MET, weightKg) * (set.durationSeconds / 60);
  if (set.reps !== undefined) {
    return kcalPerMinute(STRENGTH_MET, weightKg) * (SECONDS_PER_STRENGTH_SET / 60);
  }
  return 0;
}

export interface DayTrainingLoad {
  burnKcal: number;
  /**
   * Sets with a declared load. Bodyweight work burns (it lands in `burnKcal`)
   * but does not trigger the protein bonus: the trigger is lifting, not moving.
   */
  strengthSets: number;
}

/** `entries` are the workout notes OF THAT DAY. Pending and errored ones do not count. */
export function dayTrainingLoad(entries: Entry[], weightKg: number): DayTrainingLoad {
  return entries.reduce<DayTrainingLoad>(
    (load, entry) => {
      if (entry.status !== 'done' || !isWorkoutData(entry.data)) return load;
      return entry.data.sets.reduce<DayTrainingLoad>(
        (acc, set) => ({
          burnKcal: acc.burnKcal + setBurnKcal(set, weightKg),
          strengthSets: acc.strengthSets + (set.weight !== undefined ? 1 : 0),
        }),
        load,
      );
    },
    { burnKcal: 0, strengthSets: 0 },
  );
}

/**
 * Additive and never subtractive: `max(0, ...)`. A rest day returns exactly the
 * declared target, which is today's behaviour — nobody who only uses the diet
 * tab loses a calorie because of this feature.
 */
export function trainingAdjustment(
  entries: Entry[],
  profile: OnboardingProfile,
): TrainingAdjustment {
  const load = dayTrainingLoad(entries, profile.weightKg);
  if (load.burnKcal <= 0) return noTrainingAdjustment;

  // Net of what the declared activity level already assumes, or someone who
  // said "high" and then trained would be paid for the session twice.
  const net = load.burnKcal - assumedDailyTrainingKcal(profile.activity);
  const calories = Math.min(
    MAX_TRAINING_BONUS_KCAL,
    Math.max(0, Math.round(net * TRAINING_CREDIT)),
  );
  return {
    calories,
    proteinPerKg:
      load.strengthSets >= MIN_SETS_FOR_PROTEIN_BONUS ? STRENGTH_PROTEIN_BONUS_PER_KG : 0,
  };
}
