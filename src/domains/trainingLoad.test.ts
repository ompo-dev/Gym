import { defaultOnboardingProfile, buildOnboardingSummary } from '@/core/onboarding';
import type { Entry } from '@/core/types';

import { dayTrainingLoad, setBurnKcal, trainingAdjustment } from './trainingLoad';
import type { WorkoutSet } from './schemas';

const profile = { ...defaultOnboardingProfile(), weightKg: 80, activity: 'sedentary' as const };

const workout = (sets: WorkoutSet[], status: Entry['status'] = 'done'): Entry => ({
  id: Math.random().toString(36).slice(2),
  date: '2026-07-21',
  domain: 'workout',
  text: 'supino',
  status,
  data: { exercise: 'supino', sets, synergists: [], stabilizers: [] },
  error: null,
  createdAt: 1,
});

test('a run is counted once, by distance, not twice', () => {
  // A run carries distance AND duration in the same set; counting both doubled
  // the same effort.
  const byBoth = setBurnKcal({ distanceMeters: 5000, durationSeconds: 1800 }, 80);
  const byDistance = setBurnKcal({ distanceMeters: 5000 }, 80);
  expect(byBoth).toBeCloseTo(byDistance);
  expect(byDistance).toBeCloseTo(5 * 1.036 * 80, 1);
});

test('a rest day changes nothing at all', () => {
  // Nobody who only uses the diet tab may lose a calorie because of this.
  expect(trainingAdjustment([], profile)).toEqual({ calories: 0, proteinPerKg: 0 });

  const declared = buildOnboardingSummary(profile, '2026-07-21');
  const rested = buildOnboardingSummary(profile, '2026-07-21', trainingAdjustment([], profile));
  expect(rested).toEqual(declared);
});

test('pending and errored notes do not feed the target', () => {
  const sets: WorkoutSet[] = [{ weight: 100, reps: 8 }];
  expect(dayTrainingLoad([workout(sets, 'thinking')], 80).burnKcal).toBe(0);
  expect(dayTrainingLoad([workout(sets, 'error')], 80).burnKcal).toBe(0);
  expect(dayTrainingLoad([workout(sets)], 80).burnKcal).toBeGreaterThan(0);
});

test('the declared activity level is deducted, so training is never paid twice', () => {
  const sets: WorkoutSet[] = Array.from({ length: 10 }, () => ({ weight: 100, reps: 8 }));
  const entries = [workout(sets)];

  const sedentary = trainingAdjustment(entries, { ...profile, activity: 'sedentary' });
  const high = trainingAdjustment(entries, { ...profile, activity: 'high' });

  expect(high.calories).toBeLessThan(sedentary.calories);
});

test('a mistyped distance cannot become a calorie licence', () => {
  const absurd = trainingAdjustment([workout([{ distanceMeters: 100_000 }])], profile);
  expect(absurd.calories).toBe(600);
});

test('lifting raises protein; moving the same amount does not', () => {
  const lifted = Array.from({ length: 10 }, () => ({ weight: 60, reps: 10 }));
  const bodyweight = Array.from({ length: 10 }, () => ({ reps: 10 }));

  expect(trainingAdjustment([workout(lifted)], profile).proteinPerKg).toBeGreaterThan(0);
  expect(trainingAdjustment([workout(bodyweight)], profile).proteinPerKg).toBe(0);
  // Bodyweight still burns — it just does not trigger the protein bonus.
  expect(trainingAdjustment([workout(bodyweight)], profile).calories).toBeGreaterThan(0);
});

test('a hard day raises calories and protein without breaking the ceiling', () => {
  const sets = Array.from({ length: 20 }, () => ({ weight: 100, reps: 8 }));
  const declared = buildOnboardingSummary(profile, '2026-07-21');
  const trained = buildOnboardingSummary(
    profile,
    '2026-07-21',
    trainingAdjustment([workout(sets)], profile),
  );

  expect(trained.calories).toBeGreaterThan(declared.calories);
  expect(trained.protein).toBeGreaterThan(declared.protein);
  expect(trained.calories).toBeLessThanOrEqual(4200);
});

// Lifting burns less than people expect: 12 sets at 80kg is ~176 kcal, and the
// "light" activity level already assumes 120 of it. The honest excess is small,
// so this pins non-zero — not a flattering number. What the user must never see
// again is a session that moves nothing at all.
test('a normal gym session raises the calorie target and the protein floor', () => {
  const lightProfile = { ...defaultOnboardingProfile(), weightKg: 80, activity: 'light' as const };
  const twelveSets = Array.from({ length: 12 }, () => ({ weight: 60, reps: 10 }));

  const adjustment = trainingAdjustment([workout(twelveSets)], lightProfile);

  expect(adjustment.calories).toBeGreaterThan(0);
  expect(adjustment.proteinPerKg).toBeGreaterThan(0);
});
