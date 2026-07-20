import type { Entry } from '@/core/types';

import type { MuscleRef, WorkoutData } from './schemas';
import { buildMonitorReport } from './workoutMonitor';

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

/** Mirrors what the schema produces: anatomy present, empty unless given. */
const lift = (
  exercise: string,
  weight: number,
  reps: number,
  sets = 1,
  primary?: MuscleRef,
  synergists: MuscleRef[] = [],
): WorkoutData => ({
  exercise,
  kind: 'strength',
  primary,
  synergists,
  stabilizers: [],
  sets: Array.from({ length: sets }, () => ({ weight, unit: 'kg' as const, reps })),
});

const run = (meters: number, seconds: number): WorkoutData => ({
  exercise: 'Corrida',
  kind: 'cardio',
  primary: { muscle: 'cardiovascular' },
  synergists: [],
  stabilizers: [],
  sets: [{ distanceMeters: meters, durationSeconds: seconds }],
});

const TODAY = '2026-07-20';
const INSIDE = '2026-07-10';
const PREVIOUS = '2026-06-20';
const ANCIENT = '2026-01-01';

test('volume is sets per week per muscle, not tonnage', () => {
  // 12 sets of a light lift beats 2 sets of a heavy one on volume, because
  // volume is the set count. Tonnage would say the opposite.
  const report = buildMonitorReport(
    [
      entry(INSIDE, 'rosca', lift('Rosca', 20, 10, 12, { muscle: 'biceps-brachii' })),
      entry(INSIDE, 'agachamento', lift('Agachamento', 200, 5, 2, { muscle: 'quadriceps' })),
    ],
    TODAY,
    30,
  );

  expect(report.muscles[0].muscle).toBe('biceps-brachii');
  expect(report.muscles[0].sets).toBe(12);
  expect(report.muscles[1].muscle).toBe('quadriceps');
  expect(report.muscles[1].sets).toBe(2);
});

test('weekly sets normalise the window, so every period reads the same way', () => {
  const entries = [
    entry('2026-07-18', 'supino', lift('Supino', 100, 8, 12, { muscle: 'pectoralis-major' })),
  ];

  // 12 sets over 7 days is 12/week; the same 12 over 30 days is ~2.8/week.
  expect(buildMonitorReport(entries, TODAY, 7).muscles[0].weeklySets).toBeCloseTo(12, 1);
  expect(buildMonitorReport(entries, TODAY, 30).muscles[0].weeklySets).toBeCloseTo(2.8, 1);
});

test('the 8-12 weekly band drives the verdict', () => {
  const build = (sets: number) =>
    buildMonitorReport(
      // Inside a 7-day window, weekly sets equal the set count.
      [entry('2026-07-18', 'supino', lift('Supino', 100, 8, sets, { muscle: 'pectoralis-major' }))],
      TODAY,
      7,
    ).muscles[0];

  expect(build(4).verdict).toBe('under');
  expect(build(10).verdict).toBe('inRange');
  expect(build(15).verdict).toBe('above');
  expect(build(25).verdict).toBe('excessive');
});

test('synergist work is shown but never counted as volume', () => {
  // Bench press hits triceps, but 3 sets of bench is not 3 triceps sets.
  const report = buildMonitorReport(
    [
      entry(
        INSIDE,
        'supino',
        lift('Supino', 100, 8, 3, { muscle: 'pectoralis-major' }, [
          { muscle: 'triceps-brachii', portion: 'long-head' },
        ]),
      ),
    ],
    TODAY,
    30,
  );

  const chest = report.muscles.find((m) => m.muscle === 'pectoralis-major');
  const triceps = report.muscles.find((m) => m.muscle === 'triceps-brachii');
  expect(chest?.sets).toBe(3);
  expect(triceps?.sets).toBe(0);
  expect(triceps?.synergistSets).toBe(3);
});

test('history without a model classification still counts, via the keyword table', () => {
  const report = buildMonitorReport(
    [entry(INSIDE, 'supino', lift('Supino reto', 100, 8, 3))], // no `primary`
    TODAY,
    30,
  );

  expect(report.muscles[0].muscle).toBe('pectoralis-major');
  expect(report.muscles[0].sets).toBe(3);
});

test('the period window excludes older entries', () => {
  const report = buildMonitorReport(
    [
      entry(INSIDE, 'supino', lift('Supino', 100, 5)),
      entry(ANCIENT, 'supino', lift('Supino', 200, 5)),
    ],
    TODAY,
    30,
  );

  expect(report.exercises[0].bestWeightKg).toBe(100);
});

test('the best set is compared against the window immediately before', () => {
  const report = buildMonitorReport(
    [
      entry(INSIDE, 'supino', lift('Supino', 110, 5)),
      entry(PREVIOUS, 'supino', lift('Supino', 100, 5)),
    ],
    TODAY,
    30,
  );

  expect(report.exercises[0].bestWeightKg).toBe(110);
  expect(report.exercises[0].previousBestWeightKg).toBe(100);
  expect(report.exercises[0].deltaPct).toBe(10);
});

test('no previous data means no delta, not a fake 100%', () => {
  const report = buildMonitorReport([entry(INSIDE, 'supino', lift('Supino', 100, 5))], TODAY, 30);

  expect(report.exercises[0].deltaPct).toBeUndefined();
  expect(report.volumeDeltaPct).toBeUndefined();
});

test('training days count distinct dates, not entries', () => {
  const report = buildMonitorReport(
    [
      entry(INSIDE, 'supino', lift('Supino', 100, 5)),
      entry(INSIDE, 'rosca', lift('Rosca', 20, 10)),
      entry('2026-07-11', 'agachamento', lift('Agachamento', 100, 5)),
    ],
    TODAY,
    30,
  );

  expect(report.days).toBe(2);
});

test('cardio is summarised separately with the best pace', () => {
  const report = buildMonitorReport(
    [
      entry(INSIDE, 'corrida', run(5000, 1500)), // 5:00/km
      entry('2026-07-12', 'corrida', run(10000, 3600)), // 6:00/km
    ],
    TODAY,
    30,
  );

  expect(report.cardio?.sessions).toBe(2);
  expect(report.cardio?.distanceMeters).toBe(15000);
  expect(report.cardio?.bestPaceSecondsPerKm).toBe(300);
});

test('no cardio in the period yields no cardio block at all', () => {
  const report = buildMonitorReport([entry(INSIDE, 'supino', lift('Supino', 100, 5))], TODAY, 30);

  expect(report.cardio).toBeNull();
});

test('unclassified sets are reported rather than hidden', () => {
  const report = buildMonitorReport(
    [
      entry(INSIDE, 'supino', lift('Supino reto', 100, 5, 2)),
      entry(INSIDE, 'coisa', lift('Exercicio inventado', 100, 5, 2)),
    ],
    TODAY,
    30,
  );

  expect(report.unclassifiedShare).toBeCloseTo(0.5);
});

test('cardio is broken down per modality, each judged on its own terms', () => {
  const bike = (meters: number, seconds: number): WorkoutData => ({
    exercise: 'Bicicleta',
    kind: 'cardio',
    primary: { muscle: 'cardiovascular' },
    synergists: [],
    stabilizers: [],
    sets: [{ distanceMeters: meters, durationSeconds: seconds }],
  });

  const report = buildMonitorReport(
    [
      entry(INSIDE, 'corrida', run(5000, 1500)),
      entry('2026-07-12', 'corrida', run(10000, 3300)),
      entry('2026-07-13', 'bike', bike(30000, 3600)),
    ],
    TODAY,
    30,
  );

  expect(report.cardio?.modalities.map((m) => m.name)).toEqual(['Bicicleta', 'Corrida']);
  const running = report.cardio?.modalities.find((m) => m.name === 'Corrida');
  expect(running?.sessions).toBe(2);
  expect(running?.longestDistanceMeters).toBe(10000);
  expect(running?.bestPaceSecondsPerKm).toBe(300); // the 5 km at 5:00/km
});

test('a faster average pace than the previous window is a positive delta', () => {
  const report = buildMonitorReport(
    [
      entry(INSIDE, 'corrida', run(5000, 1500)), // 5:00/km
      entry(PREVIOUS, 'corrida', run(5000, 1800)), // 6:00/km
    ],
    TODAY,
    30,
  );

  // Pace dropped, so the athlete improved — the sign must read as progress.
  expect(report.cardio?.paceDeltaPct).toBe(20);
});

test('the focus narrows the chart without shrinking the breakdown', () => {
  const entries = [
    entry(
      INSIDE,
      'supino inclinado',
      lift('Supino inclinado', 80, 8, 3, { muscle: 'pectoralis-major', portion: 'clavicular' }),
    ),
    entry(
      INSIDE,
      'supino reto',
      lift('Supino reto', 100, 8, 3, { muscle: 'pectoralis-major', portion: 'sternal' }),
    ),
    entry(INSIDE, 'remada', lift('Remada', 70, 10, 4, { muscle: 'latissimus-dorsi' })),
  ];
  const chartSets = (report: ReturnType<typeof buildMonitorReport>) =>
    report.weeks.reduce((sum, week) => sum + week.sets, 0);

  expect(chartSets(buildMonitorReport(entries, TODAY, 30))).toBe(10);
  expect(chartSets(buildMonitorReport(entries, TODAY, 30, { group: 'chest' }))).toBe(6);
  expect(
    chartSets(
      buildMonitorReport(entries, TODAY, 30, { group: 'chest', muscle: 'pectoralis-major' }),
    ),
  ).toBe(6);
  expect(
    chartSets(
      buildMonitorReport(entries, TODAY, 30, {
        group: 'chest',
        muscle: 'pectoralis-major',
        portion: 'sternal',
      }),
    ),
  ).toBe(3);
});

test('the breakdown stays complete under any focus, so the selects keep their options', () => {
  const entries = [
    entry(
      INSIDE,
      'supino',
      lift('Supino', 100, 8, 3, { muscle: 'pectoralis-major', portion: 'sternal' }),
    ),
    entry(INSIDE, 'remada', lift('Remada', 70, 10, 4, { muscle: 'latissimus-dorsi' })),
  ];

  const focused = buildMonitorReport(entries, TODAY, 30, { group: 'chest' });

  // Chart is chest-only, but the list still shows back — otherwise narrowing
  // once would strand the user with nothing to switch back to.
  expect(focused.weeks.reduce((sum, w) => sum + w.sets, 0)).toBe(3);
  expect(focused.muscles.map((m) => m.key).sort()).toEqual([
    'latissimus-dorsi',
    'pectoralis-major/sternal',
  ]);
});

test('an empty history is not data', () => {
  const report = buildMonitorReport([], TODAY, 30);

  expect(report.hasData).toBe(false);
  expect(report.muscles).toEqual([]);
});

test('a 30-day window buckets by day, so one training week still draws a line', () => {
  // The bug this pins: five sessions inside one calendar week produced a single
  // weekly bucket, and a chart cannot draw a line through one point.
  const report = buildMonitorReport(
    [
      entry('2026-07-13', 'supino', lift('Supino', 100, 8, 3)),
      entry('2026-07-14', 'agachamento', lift('Agachamento', 120, 8, 3)),
      entry('2026-07-15', 'remada', lift('Remada', 70, 10, 3)),
      entry('2026-07-16', 'rosca', lift('Rosca', 20, 12, 3)),
      entry('2026-07-17', 'corrida', run(5000, 1500)),
    ],
    TODAY,
    30,
  );

  expect(report.granularity).toBe('day');
  expect(report.weeks).toHaveLength(5);
  expect(report.weeks[0].weekStart).toBe('2026-07-13');
});

test('lines follow the drill-down: grupamentos, then muscles, then portions', () => {
  const entries = [
    entry('2026-07-13', 'supino', lift('Supino', 100, 8, 3, { muscle: 'pectoralis-major', portion: 'sternal' })),
    entry('2026-07-14', 'inclinado', lift('Inclinado', 80, 8, 2, { muscle: 'pectoralis-major', portion: 'clavicular' })),
    entry('2026-07-14', 'remada', lift('Remada', 70, 10, 4, { muscle: 'latissimus-dorsi' })),
    entry('2026-07-15', 'encolhimento', lift('Encolhimento', 60, 12, 2, { muscle: 'trapezius', portion: 'upper' })),
  ];

  const all = buildMonitorReport(entries, TODAY, 30);
  expect(all.series.map((s) => s.key).sort()).toEqual(['back', 'chest']);
  expect(all.series.every((s) => s.kind === 'group')).toBe(true);

  const back = buildMonitorReport(entries, TODAY, 30, { group: 'back' });
  expect(back.series.map((s) => s.key).sort()).toEqual(['latissimus-dorsi', 'trapezius']);
  expect(back.series.every((s) => s.kind === 'muscle')).toBe(true);

  const traps = buildMonitorReport(entries, TODAY, 30, {
    group: 'back',
    muscle: 'trapezius',
  });
  expect(traps.series.map((s) => s.key)).toEqual(['upper']);
  expect(traps.series[0].kind).toBe('portion');
});

test('every line is padded to the same bucket axis', () => {
  // Chest trained on day 1, back on day 2: both lines must span both buckets,
  // otherwise they would be drawn against different timelines.
  const report = buildMonitorReport(
    [
      entry('2026-07-13', 'supino', lift('Supino', 100, 8, 3, { muscle: 'pectoralis-major' })),
      entry('2026-07-14', 'remada', lift('Remada', 70, 10, 4, { muscle: 'latissimus-dorsi' })),
    ],
    TODAY,
    30,
  );

  expect(report.buckets).toEqual(['2026-07-13', '2026-07-14']);
  report.series.forEach((series) => expect(series.points).toHaveLength(2));
  expect(report.series.find((s) => s.key === 'chest')?.points).toEqual([3, 0]);
  expect(report.series.find((s) => s.key === 'back')?.points).toEqual([0, 4]);
});

test('load progression tracks the heaviest set per bucket, per exercise', () => {
  const report = buildMonitorReport(
    [
      entry('2026-07-13', 'supino', lift('Supino', 100, 8)),
      entry('2026-07-13', 'supino', lift('Supino', 110, 5)), // same day, heavier
      entry('2026-07-15', 'supino', lift('Supino', 105, 8)),
      entry('2026-07-15', 'agachamento', lift('Agachamento', 140, 5)),
    ],
    TODAY,
    30,
  );

  const supino = report.exerciseSeries.find((s) => s.name === 'Supino');
  expect(supino?.loadKg).toEqual([110, 105]); // best of day 1, then day 2
  expect(supino?.sets).toEqual([2, 1]); // the work behind those loads
  const squat = report.exerciseSeries.find((s) => s.name === 'Agachamento');
  expect(squat?.loadKg).toEqual([0, 140]); // padded on the day it was not trained
});

test('cardio series keep distance and time per modality, both aligned', () => {
  const bike = (meters: number, seconds: number): WorkoutData => ({
    exercise: 'Bicicleta',
    kind: 'cardio',
    primary: { muscle: 'cardiovascular' },
    synergists: [],
    stabilizers: [],
    sets: [{ distanceMeters: meters, durationSeconds: seconds }],
  });

  const report = buildMonitorReport(
    [
      entry('2026-07-13', 'corrida', run(5000, 1500)),
      entry('2026-07-15', 'bike', bike(20000, 3600)),
    ],
    TODAY,
    30,
  );

  const running = report.cardioSeries.find((s) => s.name === 'Corrida');
  const cycling = report.cardioSeries.find((s) => s.name === 'Bicicleta');
  expect(running?.distanceKm).toEqual([5, 0]);
  expect(running?.durationMin).toEqual([25, 0]);
  expect(cycling?.distanceKm).toEqual([0, 20]);
  expect(cycling?.durationMin).toEqual([0, 60]);
});

test('focusing a grupamento does not empty the cardio or exercise charts', () => {
  // The bug this pins: the time axis was derived from the focused series, so
  // picking "Costas" collapsed every other chart to zero buckets.
  const bike = (meters: number, seconds: number): WorkoutData => ({
    exercise: 'Bicicleta',
    kind: 'cardio',
    primary: { muscle: 'cardiovascular' },
    synergists: [],
    stabilizers: [],
    sets: [{ distanceMeters: meters, durationSeconds: seconds }],
  });

  const entries = [
    entry('2026-07-13', 'supino', lift('Supino', 100, 8, 3, { muscle: 'pectoralis-major' })),
    entry('2026-07-14', 'bike', bike(20000, 3600)),
    entry('2026-07-15', 'remada', lift('Remada', 70, 10, 4, { muscle: 'latissimus-dorsi' })),
  ];

  const back = buildMonitorReport(entries, TODAY, 30, { group: 'back' });

  // The axis still covers every training day, not just the back one.
  expect(back.buckets).toEqual(['2026-07-13', '2026-07-14', '2026-07-15']);
  // Cardio survives a muscle-group focus: a bike ride has no grupamento.
  expect(back.cardioSeries).toHaveLength(1);
  expect(back.cardioSeries[0].distanceKm).toEqual([0, 20, 0]);
  // Load progression follows the same focus — asking for Costas and still
  // seeing bench press would defeat the drill-down.
  expect(back.exerciseSeries.map((s) => s.name)).toEqual(['Remada']);
  // Only the volume lines are scoped.
  expect(back.series.map((s) => s.key)).toEqual(['latissimus-dorsi']);
});

test('a focus with no work in the period yields no lines but keeps the axis', () => {
  const report = buildMonitorReport(
    [entry('2026-07-13', 'supino', lift('Supino', 100, 8, 3, { muscle: 'pectoralis-major' }))],
    TODAY,
    30,
    { group: 'legs' },
  );

  expect(report.series).toEqual([]);
  expect(report.buckets).toHaveLength(1);
  expect(report.hasData).toBe(true); // there IS data, just not for legs
});

test('every window buckets by day, so short blocks still draw a line', () => {
  const entries = [
    entry('2026-07-18', 'supino', lift('Supino', 100, 8, 3)),
    entry('2026-07-19', 'remada', lift('Remada', 70, 10, 3)),
  ];

  // A week, a fortnight and a month all read at the same resolution — these
  // windows are short enough that a coarser bucket would hide the block.
  for (const period of [7, 15, 30] as const) {
    const report = buildMonitorReport(entries, TODAY, period);
    expect(report.granularity).toBe('day');
    expect(report.buckets).toEqual(['2026-07-18', '2026-07-19']);
  }
});

test('pace is only reported for buckets with both distance and time', () => {
  const timeOnly = (seconds: number): WorkoutData => ({
    exercise: 'Corrida',
    kind: 'cardio',
    primary: { muscle: 'cardiovascular' },
    synergists: [],
    stabilizers: [],
    sets: [{ durationSeconds: seconds }],
  });

  const report = buildMonitorReport(
    [
      entry('2026-07-18', 'corrida', run(5000, 1500)), // 5:00/km
      entry('2026-07-19', 'corrida', timeOnly(1800)), // no distance -> no pace
    ],
    TODAY,
    7,
  );

  const running = report.cardioSeries[0];
  // A zero here would draw at the chart floor and read as an impossibly fast
  // session; the UI turns it into a gap.
  expect(running.paceSecPerKm).toEqual([300, 0]);
  expect(running.durationMin).toEqual([25, 30]);
});

test('the streak counts consecutive days ending today', () => {
  const report = buildMonitorReport(
    [
      entry('2026-07-18', 'supino', lift('Supino', 100, 8)),
      entry('2026-07-19', 'remada', lift('Remada', 70, 10)),
      entry('2026-07-20', 'agachamento', lift('Agachamento', 120, 5)),
    ],
    TODAY, // 2026-07-20
    7,
  );

  expect(report.streak).toBe(3);
});

test('not having trained yet today does not break a live streak', () => {
  const report = buildMonitorReport(
    [
      entry('2026-07-18', 'supino', lift('Supino', 100, 8)),
      entry('2026-07-19', 'remada', lift('Remada', 70, 10)),
    ],
    TODAY,
    7,
  );

  expect(report.streak).toBe(2);
});

test('a gap ends the streak, and an old streak reads as zero', () => {
  const report = buildMonitorReport(
    [
      // Three days in a row, but they finished four days ago.
      entry('2026-07-14', 'supino', lift('Supino', 100, 8)),
      entry('2026-07-15', 'remada', lift('Remada', 70, 10)),
      entry('2026-07-16', 'agachamento', lift('Agachamento', 120, 5)),
    ],
    TODAY,
    7,
  );

  // Reporting 3 here would celebrate a streak the user already lost.
  expect(report.streak).toBe(0);
});

test('several entries on one day are one day of streak, not several', () => {
  const report = buildMonitorReport(
    [
      entry('2026-07-19', 'supino', lift('Supino', 100, 8)),
      entry('2026-07-19', 'remada', lift('Remada', 70, 10)),
      entry('2026-07-20', 'rosca', lift('Rosca', 20, 12)),
    ],
    TODAY,
    7,
  );

  expect(report.streak).toBe(2);
});

test('cardio keeps its own streak, independent of lifting', () => {
  const report = buildMonitorReport(
    [
      entry('2026-07-19', 'corrida', run(5000, 1500)),
      entry('2026-07-20', 'corrida', run(5000, 1500)),
      entry('2026-07-14', 'supino', lift('Supino', 100, 8)),
    ],
    TODAY,
    7,
  );

  expect(report.cardio?.streak).toBe(2);
  expect(report.streak).toBe(2); // the cardio days count as training days too
});
