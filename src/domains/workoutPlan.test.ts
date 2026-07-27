import { parseWorkoutText } from './workout';
import {
  planLabel,
  plannedExerciseToData,
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
        { exercise: 'Corrida', sets: [{ distanceMeters: 5000, durationSeconds: 1800 }] },
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
  expect(text).toBe('Corrida\n5km 30min');
  const parsed = parseWorkoutText(text);
  expect(parsed.sets[0].distanceMeters).toBe(5000);
  expect(parsed.sets[0].durationSeconds).toBe(1800);
});

test('a cardio set with only distance omits time', () => {
  const text = plannedExerciseToText({
    exercise: 'Caminhada',
    sets: [{ distanceMeters: 3000 }],
  });
  expect(text).toBe('Caminhada\n3km');
  const parsed = parseWorkoutText(text);
  expect(parsed.sets[0].distanceMeters).toBe(3000);
  expect(parsed.sets[0].durationSeconds).toBeUndefined();
});

test('a cardio set with only duration omits distance', () => {
  const text = plannedExerciseToText({
    exercise: 'Alongamento',
    sets: [{ durationSeconds: 600 }],
  });
  expect(text).toBe('Alongamento\n10min');
  const parsed = parseWorkoutText(text);
  expect(parsed.sets[0].durationSeconds).toBe(600);
  expect(parsed.sets[0].distanceMeters).toBeUndefined();
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

// -- plannedExerciseToData -------------------------------------------------

test('plannedExerciseToData preserves all cardio metrics directly', () => {
  const data = plannedExerciseToData({
    exercise: 'Corrida',
    sets: [{ distanceMeters: 5000, durationSeconds: 1800 }],
  });
  expect(data.exercise).toBe('Corrida');
  expect(data.kind).toBe('cardio');
  expect(data.sets).toHaveLength(1);
  expect(data.sets[0].distanceMeters).toBe(5000);
  expect(data.sets[0].durationSeconds).toBe(1800);
});

test('plannedExerciseToData preserves all strength metrics directly', () => {
  const data = plannedExerciseToData({
    exercise: 'Supino reto',
    sets: [
      { weight: 80, reps: 8 },
      { weight: 80, reps: 8 },
    ],
  });
  expect(data.exercise).toBe('Supino reto');
  expect(data.kind).toBe('strength');
  expect(data.sets).toHaveLength(2);
  expect(data.sets[0]).toMatchObject({ weight: 80, unit: 'kg', reps: 8 });
});

test('plannedExerciseToData classifies mixed sets as cardio', () => {
  const data = plannedExerciseToData({
    exercise: 'HIIT',
    sets: [{ durationSeconds: 600 }],
  });
  expect(data.kind).toBe('cardio');
});

test('plannedExerciseToData sets unit to kg for weighted sets', () => {
  const data = plannedExerciseToData({
    exercise: 'Agachamento',
    sets: [{ weight: 100, reps: 5 }],
  });
  expect(data.sets[0].unit).toBe('kg');
});

test('plan notes carry pre-parsed data to skip text round-trip', () => {
  const notes = planToNotes(
    {
      days: [
        {
          dayOffset: 0,
          exercises: [
            { exercise: 'Corrida', sets: [{ distanceMeters: 5000, durationSeconds: 1800 }] },
          ],
        },
      ],
    },
    '2026-07-21',
  );
  expect(notes).toHaveLength(1);
  expect(notes[0].data.exercise).toBe('Corrida');
  expect(notes[0].data.kind).toBe('cardio');
  expect(notes[0].data.sets[0].distanceMeters).toBe(5000);
  expect(notes[0].data.sets[0].durationSeconds).toBe(1800);
  // Text still exists for display/editing
  expect(notes[0].text).toBe('Corrida\n5km 30min');
});
