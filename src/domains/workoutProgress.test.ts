import type { Entry } from '@/core/types';

import type { WorkoutData } from './schemas';
import { buildProgressRows, isCardioSession, paceOf } from './workoutProgress';

let seq = 0;
function entry(date: string, text: string, data: WorkoutData): Entry {
  seq += 1;
  return {
    id: `e${seq}`,
    date,
    domain: 'workout',
    text,
    status: 'done',
    data,
    error: null,
    createdAt: seq,
  };
}

const lift = (exercise: string, weight: number, reps: number, sets = 1): WorkoutData => ({
  exercise,
  kind: 'strength',
  sets: Array.from({ length: sets }, () => ({ weight, unit: 'kg' as const, reps })),
});

const run = (exercise: string, meters: number, seconds: number): WorkoutData => ({
  exercise,
  kind: 'cardio',
  sets: [{ distanceMeters: meters, durationSeconds: seconds }],
});

const TODAY = '2026-07-19';
const YESTERDAY = '2026-07-18';

test('a cardio session is one row, not one row per metric', () => {
  // The old shape emitted distance AND duration as separate achievements.
  const today = [entry(TODAY, 'corrida', run('Corrida', 6000, 3600))];

  const rows = buildProgressRows(today, [], TODAY);

  expect(rows).toHaveLength(1);
  expect(rows[0].name).toBe('Corrida');
  // Distance leads; time and pace are demoted to the supporting line.
  expect(rows[0].headline).toBe('6 km');
  expect(rows[0].detail).toBe('1 h · 10:00/km');
});

test('an exercise with no history is a first log, not a PR', () => {
  const today = [entry(TODAY, 'supino', lift('Supino', 100, 8))];

  const rows = buildProgressRows(today, [], TODAY);

  expect(rows[0].tone).toBe('first');
  expect(rows[0].deltaPct).toBeUndefined();
  expect(rows[0].reference).toBeUndefined();
});

test('beating the previous best volume is a PR and shows both numbers', () => {
  const today = [entry(TODAY, 'leg press', lift('Leg press', 200, 15))]; // 3000 kg
  const history = [entry(YESTERDAY, 'leg press', lift('Leg press', 200, 12))]; // 2400 kg

  const rows = buildProgressRows(today, history, TODAY);

  expect(rows[0].tone).toBe('pr');
  expect(rows[0].headline).toBe('3000 kg');
  expect(rows[0].reference).toBe('2400 kg');
  expect(rows[0].deltaPct).toBe(25);
});

test('same-day entries are summed before comparing against history', () => {
  // Three sets logged as three separate entries must not each be compared alone.
  const today = [
    entry(TODAY, 'supino', lift('Supino', 100, 8)),
    entry(TODAY, 'supino', lift('Supino', 100, 8)),
    entry(TODAY, 'supino', lift('Supino', 100, 8)),
  ];
  const history = [entry(YESTERDAY, 'supino', lift('Supino', 100, 8, 2))];

  const rows = buildProgressRows(today, history, TODAY);

  expect(rows).toHaveLength(1);
  expect(rows[0].tone).toBe('pr'); // 2400 today vs 1600 best
  expect(rows[0].headline).toBe('2400 kg');
  expect(rows[0].reference).toBe('1600 kg');
});

test('past sessions are also summed per day, so a split past day is not undercounted', () => {
  const today = [entry(TODAY, 'supino', lift('Supino', 100, 8, 2))]; // 1600
  const history = [
    entry(YESTERDAY, 'supino', lift('Supino', 100, 8)),
    entry(YESTERDAY, 'supino', lift('Supino', 100, 8)),
  ]; // 1600 summed, not 800

  const rows = buildProgressRows(today, history, TODAY);

  expect(rows[0].tone).not.toBe('pr'); // tied, not beaten
});

test('improving on the last session without beating the record reads as improved', () => {
  const today = [entry(TODAY, 'supino', lift('Supino', 100, 8, 2))]; // 1600
  const history = [
    entry('2026-07-10', 'supino', lift('Supino', 100, 8, 4)), // 3200 best
    entry(YESTERDAY, 'supino', lift('Supino', 100, 8)), // 800 last
  ];

  const rows = buildProgressRows(today, history, TODAY);

  expect(rows[0].tone).toBe('up');
  expect(rows[0].reference).toBe('800 kg');
  expect(rows[0].deltaPct).toBe(100);
});

test('a faster pace is a PR even when the distance is shorter', () => {
  const today = [entry(TODAY, 'corrida', run('Corrida', 3000, 900))]; // 5:00/km
  const history = [entry(YESTERDAY, 'corrida', run('Corrida', 10000, 3600))]; // 6:00/km

  const rows = buildProgressRows(today, history, TODAY);

  expect(rows[0].tone).toBe('pr');
  expect(rows[0].reference).toBe('6:00/km');
  // Pace is inverted so positive always means better: 360s/km -> 300s/km is a
  // 20% speed gain, which is what the user is being congratulated for.
  expect(rows[0].deltaPct).toBe(20);
});

test('wins are ordered ahead of flat rows', () => {
  const today = [
    entry(TODAY, 'supino', lift('Supino', 100, 8)), // flat vs history
    entry(TODAY, 'leg press', lift('Leg press', 200, 15)), // PR
  ];
  const history = [
    entry(YESTERDAY, 'supino', lift('Supino', 100, 8)),
    entry(YESTERDAY, 'leg press', lift('Leg press', 200, 12)),
  ];

  const rows = buildProgressRows(today, history, TODAY);

  expect(rows.map((r) => r.tone)).toEqual(['pr', 'flat']);
});

test('pace helpers', () => {
  expect(paceOf({ sets: 0, volumeKg: 0, durationSeconds: 1800, distanceMeters: 6000 })).toBe(300);
  expect(paceOf({ sets: 0, volumeKg: 0, durationSeconds: 0, distanceMeters: 6000 })).toBeNull();
  expect(isCardioSession({ sets: 1, volumeKg: 0, durationSeconds: 60, distanceMeters: 0 })).toBe(true);
  expect(isCardioSession({ sets: 1, volumeKg: 800, durationSeconds: 60, distanceMeters: 0 })).toBe(
    false,
  );
});
