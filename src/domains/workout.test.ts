import {
  chooseWorkoutSets,
  formatWorkoutLoad,
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

test('parseWorkoutSetLine captures BOTH cardio metrics across shorthand forms', () => {
  // "5k" shorthand for 5km — used to drop the distance entirely.
  expect(parseWorkoutSetLine('5k 30min')).toEqual({ distanceMeters: 5000, durationSeconds: 1800 });
  // "30m" beside a km distance is 30 minutes, not 30 metres.
  expect(parseWorkoutSetLine('5km 30m')).toEqual({ distanceMeters: 5000, durationSeconds: 1800 });
  // ...but a lone "500 m" is still metres (guarded by the km-present check).
  expect(parseWorkoutSetLine('500 m')).toEqual({ distanceMeters: 500 });
  // Explicit metres survive even with a duration present.
  expect(parseWorkoutSetLine('5000m 30min')).toEqual({
    distanceMeters: 5000,
    durationSeconds: 1800,
  });
  // The hour must not eat the next token's distance digit ("1h 10km" ≠ 1h10min).
  expect(parseWorkoutSetLine('1h 10km')).toEqual({ distanceMeters: 10000, durationSeconds: 3600 });
  // "30'" prime = minutes.
  expect(parseWorkoutSetLine("5km 30'")).toEqual({ distanceMeters: 5000, durationSeconds: 1800 });
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

test('parseWorkoutText expands "N de R Wkg" into N identical sets', () => {
  expect(parseWorkoutText('leg press 3 de 20 50kg')).toEqual({
    exercise: 'leg press',
    synergists: [],
    stabilizers: [],
    kind: 'strength',
    sets: [
      { reps: 20, weight: 50, unit: 'kg' },
      { reps: 20, weight: 50, unit: 'kg' },
      { reps: 20, weight: 50, unit: 'kg' },
    ],
  });
});

test('parseWorkoutText expands "Wkg N de R" into N identical loaded sets', () => {
  expect(parseWorkoutText('supino reto 50kg 3 de 8')).toEqual({
    exercise: 'supino reto',
    synergists: [],
    stabilizers: [],
    kind: 'strength',
    sets: [
      { reps: 8, weight: 50, unit: 'kg' },
      { reps: 8, weight: 50, unit: 'kg' },
      { reps: 8, weight: 50, unit: 'kg' },
    ],
  });
});

test('parseWorkoutText expands "N x R Wkg" but keeps "N x R" as one set', () => {
  expect(parseWorkoutText('supino 3x10 80kg').sets).toEqual([
    { reps: 10, weight: 80, unit: 'kg' },
    { reps: 10, weight: 80, unit: 'kg' },
    { reps: 10, weight: 80, unit: 'kg' },
  ]);
  // No trailing weight → "8x100" is 8 reps × 100, a single set, not 8 sets.
  expect(parseWorkoutText('bench\n8x100').sets).toEqual([{ weight: 100, unit: 'kg', reps: 8 }]);
});

test('formatWorkoutSetVolume shows the set volume in kg', () => {
  expect(formatWorkoutSetVolume({ weight: 50, unit: 'kg', reps: 10 })).toBe('500 kg');
});

test('formatWorkoutLoad switches to tonnes once a session passes 1 t', () => {
  expect(formatWorkoutLoad(0)).toBe('0 kg');
  expect(formatWorkoutLoad(999)).toBe('999 kg');
  expect(formatWorkoutLoad(1000)).toBe('1 t');
  expect(formatWorkoutLoad(1500)).toBe('1.5 t');
  // A single set still moves the reading below 10 t.
  expect(formatWorkoutLoad(1560)).toBe('1.6 t');
  expect(formatWorkoutLoad(15000)).toBe('15 t');
  expect(formatWorkoutLoad(15400)).toBe('15 t');
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

describe('chooseWorkoutSets', () => {
  const prose = 'supino reto uma de 3 com 20kg outra de 5 com 50kg e mais uma serie de 4 com 70kg';
  const aiThree = [
    { weight: 20, unit: 'kg' as const, reps: 3 },
    { weight: 50, unit: 'kg' as const, reps: 5 },
    { weight: 70, unit: 'kg' as const, reps: 4 },
  ];

  test('a one-line prose note takes the model read the line parser cannot see', () => {
    // What the line parser actually gets from that sentence: the first set only.
    const local = parseWorkoutText(prose).sets;
    expect(local).toHaveLength(1);
    expect(chooseWorkoutSets(prose, local, aiThree)).toEqual(aiThree);
  });

  test('a multi-line note keeps the numbers the user typed', () => {
    const text = 'Supino reto\n20kg x 3\n50kg x 5';
    const local = parseWorkoutText(text).sets;
    expect(local).toHaveLength(2);
    expect(chooseWorkoutSets(text, local, aiThree)).toEqual(local);
  });

  test('a set multiplier the parser already expanded is not overridden', () => {
    const text = 'supino 3x10 80kg';
    const local = parseWorkoutText(text).sets;
    expect(local).toHaveLength(3);
    expect(chooseWorkoutSets(text, local, [...aiThree, ...aiThree])).toEqual(local);
  });

  test('an absurd set count is a hallucination, not a read', () => {
    const many = Array.from({ length: 21 }, () => ({ reps: 10 }));
    expect(chooseWorkoutSets('supino', [], many)).toEqual([]);
  });

  test('the model adding nothing leaves the local parse alone', () => {
    const local = [{ weight: 100, unit: 'kg' as const, reps: 8 }];
    expect(chooseWorkoutSets('supino 100x8', local, [])).toEqual(local);
  });
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
