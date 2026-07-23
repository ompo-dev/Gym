import { z } from 'zod';

import { addDays } from '@/core/date';

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
    if (set.distanceMeters) return `${set.distanceMeters / 1000}km`;
    if (set.durationSeconds) return `${Math.round(set.durationSeconds / 60)}min`;
    if (set.weight !== undefined && set.reps !== undefined) return `${set.weight}x${set.reps}`;
    if (set.reps !== undefined) return `${set.reps} reps`;
    return '';
  });
  return [exercise.exercise, ...lines.filter(Boolean)].join('\n');
}

export interface PlannedNote {
  text: string;
  domain: 'workout';
  date: string;
}

/**
 * Flattens the plan into the notes it becomes. `startDate` anchors day 0, so
 * "the whole week" lands on seven real dates rather than seven copies of today.
 */
export function planToNotes(plan: WorkoutPlan, startDate: string): PlannedNote[] {
  return plan.days.flatMap((day) =>
    day.exercises.map((exercise) => ({
      text: plannedExerciseToText(exercise),
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
