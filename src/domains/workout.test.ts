import {
  formatWorkoutSetVolume,
  parseWorkoutSetLine,
  parseWorkoutText,
  serializeWorkoutLines,
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

test('parseWorkoutText expands abbreviations and keeps only complete sets', () => {
  expect(parseWorkoutText('bp\n100x8\n95', { locale: 'en-US' })).toEqual({
    exercise: 'bench press',
    sets: [{ weight: 100, unit: 'kg', reps: 8 }],
  });
});

test('parseWorkoutText falls back to the previous exercise when the line is only sets', () => {
  expect(parseWorkoutText('8x100\n6x95', { fallbackExercise: 'Bench Press' })).toEqual({
    exercise: 'Bench Press',
    sets: [
      { weight: 100, unit: 'kg', reps: 8 },
      { weight: 95, unit: 'kg', reps: 6 },
    ],
  });
});

test('formatWorkoutSetVolume shows the set volume in kg', () => {
  expect(formatWorkoutSetVolume({ weight: 50, unit: 'kg', reps: 10 })).toBe('500 kg');
});
