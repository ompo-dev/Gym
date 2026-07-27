import { z } from 'zod';

import { addDays } from '@/core/date';
import type { WorkoutData, WorkoutSet } from '@/domains/schemas';
import { inferWorkoutKind } from '@/domains/workout';

/**
 * A generated workout plan, on its way to becoming ordinary notes.
 *
 * The plan is never a stored entity: it is turned into workout notes and then
 * forgotten. That is what makes a generated session editable, deletable and
 * undoable exactly like one typed by hand — there is no second representation
 * to keep in sync.
 */

export const plannedSetSchema = z.object({
  reps: z.coerce.number().int().positive().max(1000).optional().catch(undefined),
  weight: z.coerce.number().nonnegative().max(1000).optional().catch(undefined),
  durationSeconds: z.coerce.number().int().positive().max(36_000).optional().catch(undefined),
  distanceMeters: z.coerce.number().positive().max(500_000).optional().catch(undefined),
});

export const plannedExerciseSchema = z.object({
  exercise: z.string().trim().min(1).max(80),
  sets: z.array(plannedSetSchema).min(1).max(12),
});

export const plannedDaySchema = z.object({
  /** Offset from the first day of the plan. 0 = today. */
  dayOffset: z.coerce.number().int().min(0).max(30).default(0),
  title: z.string().trim().min(1).max(60).optional().catch(undefined),
  exercises: z.array(plannedExerciseSchema).min(1).max(15),
});

export const workoutPlanSchema = z.object({
  days: z.array(plannedDaySchema).min(1).max(7),
  reasoning: z.string().max(2000).optional().catch(undefined),
});
export type WorkoutPlan = z.infer<typeof workoutPlanSchema>;
export type PlannedExercise = z.infer<typeof plannedExerciseSchema>;

/**
 * One exercise as the text of a note — the same shape a person types, so
 * `parseWorkoutText` reads it back with no special case.
 */
export function plannedExerciseToText(exercise: PlannedExercise): string {
  const lines = exercise.sets.map((set) => {
    const parts: string[] = [];

    // Distance
    if (set.distanceMeters) {
      parts.push(
        set.distanceMeters >= 1000
          ? `${set.distanceMeters / 1000}km`
          : `${set.distanceMeters}m`,
      );
    }

    // Duration: format so parseDurationSeconds() can read it back
    if (set.durationSeconds) {
      if (set.durationSeconds < 60) {
        parts.push(`${set.durationSeconds}s`);
      } else {
        const mins = Math.round(set.durationSeconds / 60);
        if (mins < 60) {
          parts.push(`${mins}min`);
        } else {
          const h = Math.floor(set.durationSeconds / 3600);
          const remainingMin = Math.round((set.durationSeconds % 3600) / 60);
          parts.push(remainingMin > 0 ? `${h}h${remainingMin}min` : `${h}h`);
        }
      }
    }

    // Strength: weight × reps
    if (set.weight !== undefined && set.reps !== undefined) {
      parts.push(`${set.weight}x${set.reps}`);
    } else if (set.reps !== undefined) {
      parts.push(`${set.reps} reps`);
    }

    return parts.join(' ');
  });
  return [exercise.exercise, ...lines.filter(Boolean)].join('\n');
}

export interface PlannedNote {
  text: string;
  domain: 'workout';
  date: string;
  /** Pre-parsed data so the plan never re-parses its own text. */
  data: WorkoutData;
}

/**
 * Converts a planned exercise directly to {@link WorkoutData}, skipping the
 * text round-trip through `parseWorkoutText`. The plan is the source of truth
 * for its own numbers; serializing and re-parsing them can only lose precision.
 */
export function plannedExerciseToData(exercise: PlannedExercise): WorkoutData {
  const sets: WorkoutSet[] = exercise.sets.map((set) => ({
    ...(set.weight !== undefined ? { weight: set.weight } : {}),
    unit: 'kg' as const,
    ...(set.reps !== undefined ? { reps: set.reps } : {}),
    ...(set.durationSeconds !== undefined ? { durationSeconds: set.durationSeconds } : {}),
    ...(set.distanceMeters !== undefined ? { distanceMeters: set.distanceMeters } : {}),
  }));

  return {
    exercise: exercise.exercise,
    kind: inferWorkoutKind({ sets }, exercise.exercise),
    sets,
    synergists: [],
    stabilizers: [],
  };
}

/**
 * Flattens the plan into the notes it becomes. `startDate` anchors day 0, so
 * "the whole week" lands on seven real dates rather than seven copies of today.
 */
export function planToNotes(plan: WorkoutPlan, startDate: string): PlannedNote[] {
  return plan.days.flatMap((day) =>
    day.exercises.map((exercise) => ({
      text: plannedExerciseToText(exercise),
      data: plannedExerciseToData(exercise),
      domain: 'workout' as const,
      date: addDays(startDate, day.dayOffset),
    })),
  );
}

/** A label the undo toast can show for the whole plan, not for its last note. */
export function planLabel(plan: WorkoutPlan): string {
  const notes = plan.days.reduce((sum, day) => sum + day.exercises.length, 0);
  return plan.days.length === 1
    ? (plan.days[0].title ?? `${notes} exercises`)
    : `${plan.days.length} days`;
}
