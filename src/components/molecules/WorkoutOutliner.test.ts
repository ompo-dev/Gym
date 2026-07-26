import { getAnimatedMarkerIndex, workoutLinesFromEntry } from './WorkoutOutliner';

test('getAnimatedMarkerIndex skips flex animation when reopening resolved rows', () => {
  expect(
    getAnimatedMarkerIndex({
      isInitialSync: true,
      previousStatus: 'done',
      nextStatus: 'done',
      previousResolved: [],
      resolvedNow: [true, true],
      latestResolvedSet: 1,
    }),
  ).toBe(-1);
});

test('getAnimatedMarkerIndex animates the latest resolved set when thinking finishes', () => {
  expect(
    getAnimatedMarkerIndex({
      isInitialSync: false,
      previousStatus: 'thinking',
      nextStatus: 'done',
      previousResolved: [false, false],
      resolvedNow: [true, true],
      latestResolvedSet: 1,
    }),
  ).toBe(1);
});

test('workoutLinesFromEntry renders resolved strength metrics from one-line notes', () => {
  expect(
    workoutLinesFromEntry({
      id: 'entry-1',
      domain: 'workout',
      text: 'supino reto 50kg 3 de 8',
      status: 'done',
      createdAt: 1,
      data: {
        exercise: 'supino reto',
        kind: 'strength',
        synergists: [],
        stabilizers: [],
        sets: [
          { weight: 50, unit: 'kg', reps: 8 },
          { weight: 50, unit: 'kg', reps: 8 },
          { weight: 50, unit: 'kg', reps: 8 },
        ],
      },
    }),
  ).toEqual(['supino reto', '50 kg x 8', '50 kg x 8', '50 kg x 8']);
});

test('workoutLinesFromEntry renders resolved cardio metrics from one-line notes', () => {
  expect(
    workoutLinesFromEntry({
      id: 'entry-2',
      domain: 'workout',
      text: 'corrida 5km 30 minutos',
      status: 'done',
      createdAt: 1,
      data: {
        exercise: 'corrida',
        kind: 'cardio',
        synergists: [],
        stabilizers: [],
        sets: [{ distanceMeters: 5000, durationSeconds: 1800 }],
      },
    }),
  ).toEqual(['corrida', '5 km - 30 min']);
});
