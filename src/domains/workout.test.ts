import {
  formatWorkoutPace,
  formatWorkoutSetSummary,
  formatWorkoutSetPace,
  formatWorkoutSetVolume,
  getWorkoutSetPaceSecondsPerKm,
  parseWorkoutSetLine,
  parseWorkoutText,
  serializeWorkoutLines,
  uniqueWorkoutExerciseNames,
  workoutConfig,
} from './workout';

test('serializeWorkoutLines joins exercise + non-empty sets, dropping blanks', () => {
  expect(serializeWorkoutLines(['Bench', '100x8', '', '95x7'])).toBe('Bench\n100x8\n95x7');
});

test('serializeWorkoutLines keeps a set-less exercise', () => {
  expect(serializeWorkoutLines(['Squat', '', ''])).toBe('Squat');
});

test('serializeWorkoutLines trims each line', () => {
  expect(serializeWorkoutLines(['  Deadlift  ', '  140x5 '])).toBe('Deadlift\n140x5');
});

test('serializeWorkoutLines returns empty when everything is blank', () => {
  expect(serializeWorkoutLines(['', '', ''])).toBe('');
});

test('formatResult shows just the exercise when there are no sets', () => {
  expect(workoutConfig.formatResult({ exercise: 'Bench', sets: [] })).toBe('Bench');
});

test('parseWorkoutSetLine accepts weight-first shorthand', () => {
  expect(parseWorkoutSetLine('100x8')).toEqual({ weight: 100, unit: 'kg', reps: 8 });
});

test('parseWorkoutSetLine accepts reps-first shorthand and flips it', () => {
  expect(parseWorkoutSetLine('8x100')).toEqual({ weight: 100, unit: 'kg', reps: 8 });
  expect(parseWorkoutSetLine('8 x 100kg')).toEqual({ weight: 100, unit: 'kg', reps: 8 });
  expect(parseWorkoutSetLine('10x50kg')).toEqual({ weight: 50, unit: 'kg', reps: 10 });
});

test('parseWorkoutSetLine carries the previous unit when omitted', () => {
  expect(parseWorkoutSetLine('8x225lb')).toEqual({ weight: 225, unit: 'lb', reps: 8 });
  expect(parseWorkoutSetLine('6x205', 'lb')).toEqual({ weight: 205, unit: 'lb', reps: 6 });
});

test('parseWorkoutSetLine accepts cardio distance and duration', () => {
  expect(parseWorkoutSetLine('5km')).toEqual({ distanceMeters: 5000 });
  expect(parseWorkoutSetLine('500 m')).toEqual({ distanceMeters: 500 });
  expect(parseWorkoutSetLine('30 min')).toEqual({ durationSeconds: 1800 });
  expect(parseWorkoutSetLine('1h30')).toEqual({ durationSeconds: 5400 });
  expect(parseWorkoutSetLine('1h/5km')).toEqual({
    durationSeconds: 3600,
    distanceMeters: 5000,
  });
  expect(parseWorkoutSetLine('5 km 30 min')).toEqual({
    distanceMeters: 5000,
    durationSeconds: 1800,
  });
});

test('parseWorkoutSetLine accepts reps without load', () => {
  expect(parseWorkoutSetLine('20 reps')).toEqual({ reps: 20 });
  expect(parseWorkoutSetLine('15 repeticoes')).toEqual({ reps: 15 });
});

test('parseWorkoutSetLine keeps cardio metrics from becoming load when reps are explicit', () => {
  expect(parseWorkoutSetLine('5km 30 min 20 reps')).toEqual({
    distanceMeters: 5000,
    durationSeconds: 1800,
    reps: 20,
  });
});

test('parseWorkoutText expands abbreviations and keeps only complete sets', () => {
  expect(parseWorkoutText('bp\n100x8\n95', { locale: 'en-US' })).toEqual({
    exercise: 'bench press',
    synergists: [],
    stabilizers: [],
    kind: 'strength',
    sets: [{ weight: 100, unit: 'kg', reps: 8 }],
  });
});

test('parseWorkoutText falls back to the previous exercise when the line is only sets', () => {
  expect(parseWorkoutText('8x100\n6x95', { fallbackExercise: 'Bench Press' })).toEqual({
    exercise: 'Bench Press',
    synergists: [],
    stabilizers: [],
    kind: 'strength',
    sets: [
      { weight: 100, unit: 'kg', reps: 8 },
      { weight: 95, unit: 'kg', reps: 6 },
    ],
  });
});

test('parseWorkoutText keeps cardio lines under the exercise', () => {
  expect(parseWorkoutText('corrida\n5km\n30 min')).toEqual({
    exercise: 'corrida',
    synergists: [],
    stabilizers: [],
    kind: 'cardio',
    sets: [{ distanceMeters: 5000 }, { durationSeconds: 1800 }],
  });
});

test('parseWorkoutText accepts exercise and cardio metrics on one line', () => {
  expect(parseWorkoutText('corrida 5km 30 min')).toEqual({
    exercise: 'corrida',
    synergists: [],
    stabilizers: [],
    kind: 'cardio',
    sets: [{ distanceMeters: 5000, durationSeconds: 1800 }],
  });
});

test('parseWorkoutText treats mixed cardio plus reps as cardio when no load exists', () => {
  expect(parseWorkoutText('5km 30 min 20 reps')).toEqual({
    exercise: null,
    synergists: [],
    stabilizers: [],
    kind: 'cardio',
    sets: [{ distanceMeters: 5000, durationSeconds: 1800, reps: 20 }],
  });
});

test('formatWorkoutSetVolume shows the set volume in kg', () => {
  expect(formatWorkoutSetVolume({ weight: 50, unit: 'kg', reps: 10 })).toBe('500 kg');
});

test('formatWorkoutSetSummary shows cardio metrics', () => {
  expect(formatWorkoutSetSummary({ distanceMeters: 5000, durationSeconds: 1500 })).toBe(
    '5 km - 25 min',
  );
});

test('formatWorkoutPace shows cardio pace when time and distance exist', () => {
  const set = { distanceMeters: 5000, durationSeconds: 1500 };
  expect(getWorkoutSetPaceSecondsPerKm(set)).toBe(300);
  expect(formatWorkoutPace(300)).toBe('5:00/km');
  expect(formatWorkoutSetPace(set)).toBe('5:00/km');
});

test('uniqueWorkoutExerciseNames extracts templates without results', () => {
  expect(
    uniqueWorkoutExerciseNames([
      { text: 'supino\n100x8', data: { exercise: 'Supino reto', sets: [] } },
      { text: 'Supino reto\n90x8', data: { exercise: 'supino reto', sets: [] } },
      { text: 'corrida\n5km', data: { exercise: 'Corrida', sets: [] } },
    ]),
  ).toEqual(['Supino reto', 'Corrida']);
});
