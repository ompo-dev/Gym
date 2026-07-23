import { parseWorkoutText } from './workout';
import {
  planLabel,
  plannedExerciseToText,
  planToNotes,
  workoutPlanSchema,
  type WorkoutPlan,
} from './workoutPlan';

const plan: WorkoutPlan = {
  days: [
    {
      dayOffset: 0,
      title: 'Full body',
      exercises: [
        { exercise: 'Supino reto', sets: [{ weight: 80, reps: 8 }, { weight: 80, reps: 8 }] },
        { exercise: 'Corrida', sets: [{ distanceMeters: 5000 }] },
      ],
    },
    { dayOffset: 2, exercises: [{ exercise: 'Agachamento', sets: [{ weight: 100, reps: 5 }] }] },
  ],
};

test('a planned exercise reads back through the ordinary parser', () => {
  // The plan becomes plain notes; if `parseWorkoutText` could not read them,
  // a generated session would behave differently from a typed one.
  const text = plannedExerciseToText(plan.days[0].exercises[0]);
  expect(text).toBe('Supino reto\n80x8\n80x8');

  const parsed = parseWorkoutText(text);
  expect(parsed.exercise).toBe('Supino reto');
  expect(parsed.sets).toHaveLength(2);
  expect(parsed.sets[0]).toMatchObject({ weight: 80, reps: 8 });
});

test('cardio survives the round trip too', () => {
  const text = plannedExerciseToText(plan.days[0].exercises[1]);
  expect(text).toBe('Corrida\n5km');
  expect(parseWorkoutText(text).sets[0].distanceMeters).toBe(5000);
});

test('a plan lands on real dates, not seven copies of today', () => {
  const notes = planToNotes(plan, '2026-07-21');
  expect(notes).toHaveLength(3);
  expect(notes.map((n) => n.date)).toEqual(['2026-07-21', '2026-07-21', '2026-07-23']);
  expect(notes.every((n) => n.domain === 'workout')).toBe(true);
});

test('an exercise with no known load omits the weight instead of inventing one', () => {
  const text = plannedExerciseToText({ exercise: 'Remada', sets: [{ reps: 10 }, { reps: 10 }] });
  expect(text).toBe('Remada\n10 reps\n10 reps');
  expect(parseWorkoutText(text).sets[0].weight).toBeUndefined();
});

test('the undo label describes the plan, not its last note', () => {
  expect(planLabel(plan)).toBe('2 days');
  expect(planLabel({ days: [plan.days[0]] })).toBe('Full body');
});

test('a plan longer than a week is rejected', () => {
  const tooLong = {
    days: Array.from({ length: 8 }, (_, i) => ({
      dayOffset: i,
      exercises: [{ exercise: 'x', sets: [{ reps: 1 }] }],
    })),
  };
  expect(workoutPlanSchema.safeParse(tooLong).success).toBe(false);
});

test('a day with no exercises is rejected rather than written as nothing', () => {
  expect(
    workoutPlanSchema.safeParse({ days: [{ dayOffset: 0, exercises: [] }] }).success,
  ).toBe(false);
});

test('dayOffset defaults to today when the model omits it', () => {
  const parsed = workoutPlanSchema.parse({
    days: [{ exercises: [{ exercise: 'Supino', sets: [{ reps: 8 }] }] }],
  });
  expect(parsed.days[0].dayOffset).toBe(0);
});
