import type { Entry } from '@/core/types';

import {
  groupOfMuscle,
  type MuscleGroupId,
  volumeVerdict,
  type VolumeVerdict,
  WEEKLY_SET_TARGET,
} from './anatomy';
import { muscleGroupOf } from './muscles';
import type { WorkoutData } from './schemas';
import {
  getWorkoutSetVolume,
  type WorkoutTotals,
  uniqueWorkoutExerciseNames,
  workoutConfig,
  isWorkoutData,
} from './workout';

/** Short windows only: this panel answers "how is the block going", not history. */
export type MonitorPeriod = 7 | 15 | 30;

/**
 * What the chart is scoped to. Empty means everything; each field narrows one
 * step down the grupamento -> musculo -> porcao chain.
 */
export interface MonitorFocus {
  group?: MuscleGroupId;
  muscle?: string;
  portion?: string;
}

/**
 * Training volume here means SETS PER MUSCLE PER WEEK — the figure that has an
 * actual prescription behind it (8-12 weekly sets for a low-volume programme).
 * Tonnage (weight x reps) is reported separately as load, because it has no
 * reference range and answers a different question.
 */
export interface MuscleVolume {
  /** Bucket key at the chosen level: a group id, a muscle id, or muscle/portion. */
  key: string;
  /** Label parts: the muscle id, and the portion when the level is `portion`. */
  muscle: string;
  portion?: string;
  group: MuscleGroupId;
  /** Hard sets in the period, counting only sets where this muscle is primary. */
  sets: number;
  /** Sets normalised to a week, so 30d and 90d windows are comparable. */
  weeklySets: number;
  verdict: VolumeVerdict;
  /** Sets where this muscle assisted rather than led — shown, never counted. */
  synergistSets: number;
  loadKg: number;
  /** 0-1 against the weekly target ceiling, for the bar width. */
  share: number;
}

export interface ExerciseProgress {
  name: string;
  group: MuscleGroupId;
  sessions: number;
  volumeKg: number;
  /** Heaviest single set in the period, the number people actually call a PR. */
  bestWeightKg: number;
  bestWeightReps: number;
  /** Same figure in the window before this one, for the trend. */
  previousBestWeightKg: number;
  deltaPct?: number;
  lastDate: string;
}

export interface CardioModality {
  name: string;
  sessions: number;
  distanceMeters: number;
  durationSeconds: number;
  bestPaceSecondsPerKm: number | null;
  avgPaceSecondsPerKm: number | null;
  longestDistanceMeters: number;
  longestDurationSeconds: number;
}

export interface CardioSummary {
  sessions: number;
  /** Consecutive cardio days, same rule as the workout streak. */
  streak: number;
  distanceMeters: number;
  durationSeconds: number;
  bestPaceSecondsPerKm: number | null;
  avgPaceSecondsPerKm: number | null;
  previousDistanceMeters: number;
  distanceDeltaPct?: number;
  paceDeltaPct?: number;
  /** Running, cycling, walking... each judged on its own terms. */
  modalities: CardioModality[];
}

export type Granularity = "day" | "week" | "month";

/**
 * One bucket per day / week / month, oldest first. Weekly buckets over a 30-day
 * window collapse a normal training block into 4 points — and a single week of
 * history into one, which is not a line at all. The granularity follows the
 * period so the chart always has something to draw.
 */
export interface WeekPoint {
  weekStart: string;
  sets: number;
  loadKg: number;
  distanceMeters: number;
  durationSeconds: number;
}

/**
 * One line on the chart. Which lines exist follows the drill-down: no focus
 * gives one line per grupamento, a chosen grupamento gives its muscles, a
 * chosen muscle gives its porcoes. The list below the chart was saying the same
 * thing in a second language.
 */
export interface ChartSeries {
  key: string;
  /** i18n key kind, so the UI knows how to label it. */
  kind: "group" | "muscle" | "portion";
  group: MuscleGroupId;
  points: number[];
}

/** Per-exercise load progression: the heaviest set in each bucket. */
export interface ExerciseSeries {
  name: string;
  group: MuscleGroupId;
  /** Heaviest set in each bucket. */
  loadKg: number[];
  /** Sets in each bucket, so load can be read against the work that produced it. */
  sets: number[];
}

/** Per-modality cardio, both metrics, so the UI can switch without recomputing. */
export interface CardioSeries {
  name: string;
  distanceKm: number[];
  durationMin: number[];
  /** Seconds per km per bucket; 0 where a bucket has no complete pair. */
  paceSecPerKm: number[];
}

/**
 * Consecutive days trained, counting back from today. A gap ends it, and a
 * streak that already broke reads as 0 rather than as an old best — the number
 * is meant to say "keep going", not "you once did".
 *
 * Today counts as grace: not having trained yet today does not break a streak
 * that is still alive from yesterday.
 */
export function currentStreak(dates: Set<string>, today: string): number {
  const dayBefore = (date: string) => shiftDays(date, 1);
  let cursor = dates.has(today) ? today : dayBefore(today);
  if (!dates.has(cursor)) return 0;

  let streak = 0;
  while (dates.has(cursor)) {
    streak += 1;
    cursor = dayBefore(cursor);
  }
  return streak;
}

export interface MonitorReport {
  /** Consecutive training days ending today (or yesterday). */
  streak: number;
  exerciseSeries: ExerciseSeries[];
  cardioSeries: CardioSeries[];
  /** Bucket starts, oldest first. Every series aligns with this. */
  buckets: string[];
  series: ChartSeries[];
  hasData: boolean;
  days: number;
  totals: WorkoutTotals;
  volumeDeltaPct?: number;
  muscles: MuscleVolume[];
  exercises: ExerciseProgress[];
  cardio: CardioSummary | null;
  weeks: WeekPoint[];
  granularity: Granularity;
  /** Share of volume that could not be classified — honesty about the lookup table. */
  unclassifiedShare: number;
}

function exerciseOf(entry: Entry): string | null {
  if (!isWorkoutData(entry.data)) return null;
  return uniqueWorkoutExerciseNames([{ text: entry.text, data: entry.data }])[0] ?? null;
}

/** `date` is the day the user is looking at; periods count back from it. */
function shiftDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const shifted = new Date(y, (m ?? 1) - 1, (d ?? 1) - days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${shifted.getFullYear()}-${pad(shifted.getMonth() + 1)}-${pad(shifted.getDate())}`;
}

function inWindow(date: string, from: string | null, to: string): boolean {
  return date <= to && (from === null || date > from);
}

function percentChange(current: number, previous: number): number | undefined {
  if (previous <= 0) return undefined;
  return Math.round(((current - previous) / previous) * 100);
}

function heaviestSet(data: WorkoutData): { weight: number; reps: number } {
  return data.sets.reduce<{ weight: number; reps: number }>(
    (best, set) =>
      set.weight !== undefined && set.reps !== undefined && set.weight > best.weight
        ? { weight: set.weight, reps: set.reps }
        : best,
    { weight: 0, reps: 0 },
  );
}

function distanceOf(data: WorkoutData): number {
  return data.sets.reduce((sum, set) => sum + (set.distanceMeters ?? 0), 0);
}

function durationOf(data: WorkoutData): number {
  return data.sets.reduce((sum, set) => sum + (set.durationSeconds ?? 0), 0);
}

function volumeOf(data: WorkoutData): number {
  return data.sets.reduce((sum, set) => sum + getWorkoutSetVolume(set), 0);
}

/**
 * Entries logged before the model started classifying have no `primary`. The
 * keyword table still knows the group, so pick that group's headline muscle —
 * coarser than the model's answer, but it keeps history in the numbers instead
 * of dumping every old workout into "unclassified".
 */
const GROUP_HEADLINE_MUSCLE: Record<string, string> = {
  chest: 'pectoralis-major',
  back: 'latissimus-dorsi',
  legs: 'quadriceps',
  glutes: 'gluteus-maximus',
  shoulders: 'deltoid',
  biceps: 'biceps-brachii',
  triceps: 'triceps-brachii',
  core: 'rectus-abdominis',
  calves: 'gastrocnemius',
  cardio: 'cardiovascular',
  other: 'unclassified',
};

function fallbackMuscleId(exercise: string): string {
  return GROUP_HEADLINE_MUSCLE[muscleGroupOf(exercise)] ?? 'unclassified';
}

// Every window is short enough that a day is the readable bucket; a week would
// give 4 points at most and hide the pattern inside the block.
export function granularityFor(_period: MonitorPeriod): Granularity {
  return "day";
}

function bucketOf(date: string, granularity: Granularity): string {
  if (granularity === "day") return date;
  if (granularity === "month") return `${date.slice(0, 7)}-01`;
  return weekStartOf(date);
}

/** Monday of the week `date` falls in, so buckets line up with training weeks. */
function weekStartOf(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const parsed = new Date(y, (m ?? 1) - 1, d ?? 1);
  const offset = (parsed.getDay() + 6) % 7; // Monday = 0
  parsed.setDate(parsed.getDate() - offset);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
}

function paceOf(distanceMeters: number, durationSeconds: number): number | null {
  if (distanceMeters <= 0 || durationSeconds <= 0) return null;
  return durationSeconds / (distanceMeters / 1000);
}

/**
 * One pass over the history producing everything the monitor shows. Comparing a
 * window against the window immediately before it is what turns a pile of
 * numbers into "am I progressing?".
 */
export function buildMonitorReport(
  entries: Entry[],
  today: string,
  period: MonitorPeriod,
  focus: MonitorFocus = {},
): MonitorReport {
  const granularity = granularityFor(period);
  // What each line represents at the current drill level.
  const seriesKind: "group" | "muscle" | "portion" = focus.muscle
    ? "portion"
    : focus.group
      ? "muscle"
      : "group";
  const from = shiftDays(today, period);
  const previousFrom = shiftDays(today, period * 2);

  const done = entries.filter((entry) => entry.status === 'done' && isWorkoutData(entry.data));
  const current = done.filter((entry) => inWindow(entry.date, from, today));
  const previous = done.filter((entry) => inWindow(entry.date, previousFrom, from));

  let totals = workoutConfig.emptyTotals;
  const days = new Set<string>();
  const byMuscle = new Map<
    string,
    {
      muscle: string;
      portion?: string;
      group: MuscleGroupId;
      sets: number;
      synergistSets: number;
      loadKg: number;
    }
  >();

  // Buckets are always at the finest resolution the data has; the focus decides
  // what the CHART covers, while the breakdown stays complete so the selects
  // always have something to offer.
  const bucketFor = (muscle: string, portion: string | undefined) => ({
    key: portion ? `${muscle}/${portion}` : muscle,
    muscle,
    portion,
    group: groupOfMuscle(muscle) ?? ("other" as MuscleGroupId),
  });

  const matchesFocus = (muscle: string, portion: string | undefined): boolean => {
    if (focus.group && (groupOfMuscle(muscle) ?? "other") !== focus.group) return false;
    if (focus.muscle && muscle !== focus.muscle) return false;
    if (focus.portion && portion !== focus.portion) return false;
    return true;
  };
  const byExercise = new Map<
    string,
    {
      name: string;
      group: MuscleGroupId;
      dates: Set<string>;
      volumeKg: number;
      bestWeightKg: number;
      bestWeightReps: number;
      lastDate: string;
    }
  >();
  const cardioDates = new Set<string>();
  let cardioDistance = 0;
  let cardioDuration = 0;
  let bestPace: number | null = null;
  const byModality = new Map<
    string,
    {
      name: string;
      dates: Set<string>;
      distanceMeters: number;
      durationSeconds: number;
      bestPace: number | null;
      longestDistanceMeters: number;
      longestDurationSeconds: number;
    }
  >();
  const byWeek = new Map<string, WeekPoint>();
  // bucket -> series key -> sets
  const byBucketSeries = new Map<string, Map<string, number>>();
  // The time axis is built from EVERY entry in the period. Deriving it from the
  // focused series made choosing a grupamento empty the cardio and exercise
  // charts too, since those live on days the focus filtered out.
  const allBuckets = new Set<string>();
  const seriesGroups = new Map<string, MuscleGroupId>();
  // exercise -> bucket -> heaviest set; modality -> bucket -> {km, min}
  const exerciseBuckets = new Map<string, Map<string, { load: number; sets: number }>>();
  const exerciseGroupOf = new Map<string, MuscleGroupId>();
  const cardioBuckets = new Map<string, Map<string, { km: number; min: number }>>();

  current.forEach((entry) => {
    const data = entry.data as WorkoutData;
    const name = exerciseOf(entry);
    if (!name) return;

    days.add(entry.date);
    totals = workoutConfig.addToTotals(totals, data);

    const volume = volumeOf(data);
    // The model's classification when it exists; the keyword table otherwise,
    // which is what makes history logged before this feature still count.
    const primaryId = data.primary?.muscle ?? fallbackMuscleId(name);
    const slot = bucketFor(primaryId, data.primary?.portion);
    const group = slot.group;
    const bucket = byMuscle.get(slot.key) ?? {
      ...slot,
      sets: 0,
      synergistSets: 0,
      loadKg: 0,
    };
    byMuscle.set(slot.key, {
      ...bucket,
      sets: bucket.sets + data.sets.length,
      loadKg: bucket.loadKg + volume,
    });

    // Synergist work is surfaced but never added to the prescription: counting
    // a set twice would make every chest day look like a triceps day too.
    data.synergists.forEach((ref) => {
      const assistedSlot = bucketFor(ref.muscle, ref.portion);
      const assisted = byMuscle.get(assistedSlot.key) ?? {
        ...assistedSlot,
        sets: 0,
        synergistSets: 0,
        loadKg: 0,
      };
      byMuscle.set(assistedSlot.key, {
        ...assisted,
        synergistSets: assisted.synergistSets + data.sets.length,
      });
    });

    const bucketKey2 = bucketOf(entry.date, granularity);
    allBuckets.add(bucketKey2);
    const inFocus = matchesFocus(primaryId, data.primary?.portion);
    const best = heaviestSet(data);
    // Load progression follows the same focus as the volume lines — asking for
    // "Costas" and still seeing every bench press defeats the drill-down.
    if (best.weight > 0 && inFocus) {
      const row = exerciseBuckets.get(name) ?? new Map<string, { load: number; sets: number }>();
      const at = row.get(bucketKey2) ?? { load: 0, sets: 0 };
      row.set(bucketKey2, {
        load: Math.max(at.load, best.weight),
        sets: at.sets + data.sets.length,
      });
      exerciseBuckets.set(name, row);
      exerciseGroupOf.set(name, group);
    }
    if (distanceOf(data) > 0 || durationOf(data) > 0) {
      const row = cardioBuckets.get(name) ?? new Map<string, { km: number; min: number }>();
      const at = row.get(bucketKey2) ?? { km: 0, min: 0 };
      row.set(bucketKey2, {
        km: at.km + distanceOf(data) / 1000,
        min: at.min + durationOf(data) / 60,
      });
      cardioBuckets.set(name, row);
    }

    const key = name.toLocaleLowerCase();
    const exercise = byExercise.get(key);
    byExercise.set(key, {
      name: exercise?.name ?? name,
      group,
      dates: (exercise?.dates ?? new Set<string>()).add(entry.date),
      volumeKg: (exercise?.volumeKg ?? 0) + volume,
      bestWeightKg: Math.max(exercise?.bestWeightKg ?? 0, best.weight),
      bestWeightReps: best.weight > (exercise?.bestWeightKg ?? 0) ? best.reps : exercise?.bestWeightReps ?? 0,
      lastDate:
        exercise && exercise.lastDate > entry.date ? exercise.lastDate : entry.date,
    });

    const distance = data.sets.reduce((sum, set) => sum + (set.distanceMeters ?? 0), 0);
    const duration = data.sets.reduce((sum, set) => sum + (set.durationSeconds ?? 0), 0);

    if (inFocus) {
      const group = groupOfMuscle(primaryId) ?? ("other" as MuscleGroupId);
      const seriesKey =
        seriesKind === "group"
          ? group
          : seriesKind === "muscle"
            ? primaryId
            : data.primary?.portion ?? primaryId;
      const bucketKey = bucketOf(entry.date, granularity);
      const row = byBucketSeries.get(bucketKey) ?? new Map<string, number>();
      row.set(seriesKey, (row.get(seriesKey) ?? 0) + data.sets.length);
      byBucketSeries.set(bucketKey, row);
      seriesGroups.set(seriesKey, group);
    }
    const week = bucketOf(entry.date, granularity);
    const point = byWeek.get(week) ?? {
      weekStart: week,
      sets: 0,
      loadKg: 0,
      distanceMeters: 0,
      durationSeconds: 0,
    };
    byWeek.set(week, {
      weekStart: week,
      sets: point.sets + (inFocus ? data.sets.length : 0),
      loadKg: point.loadKg + (inFocus ? volume : 0),
      distanceMeters: point.distanceMeters + distance,
      durationSeconds: point.durationSeconds + duration,
    });

    if (distance > 0 || duration > 0) {
      cardioDates.add(entry.date);
      cardioDistance += distance;
      cardioDuration += duration;
      const sessionPace = paceOf(distance, duration);
      if (sessionPace !== null) {
        bestPace = bestPace === null ? sessionPace : Math.min(bestPace, sessionPace);
      }

      const modalityKey = name.toLocaleLowerCase();
      const modality = byModality.get(modalityKey) ?? {
        name,
        dates: new Set<string>(),
        distanceMeters: 0,
        durationSeconds: 0,
        bestPace: null as number | null,
        longestDistanceMeters: 0,
        longestDurationSeconds: 0,
      };
      modality.dates.add(entry.date);
      byModality.set(modalityKey, {
        ...modality,
        distanceMeters: modality.distanceMeters + distance,
        durationSeconds: modality.durationSeconds + duration,
        bestPace:
          sessionPace === null
            ? modality.bestPace
            : modality.bestPace === null
              ? sessionPace
              : Math.min(modality.bestPace, sessionPace),
        longestDistanceMeters: Math.max(modality.longestDistanceMeters, distance),
        longestDurationSeconds: Math.max(modality.longestDurationSeconds, duration),
      });
    }
  });

  // Previous window: only the figures the UI actually compares against.
  let previousVolume = 0;
  let previousCardioDistance = 0;
  let previousCardioDuration = 0;
  const previousBestByExercise = new Map<string, number>();
  previous.forEach((entry) => {
    const data = entry.data as WorkoutData;
    const name = exerciseOf(entry);
    if (!name) return;
    previousVolume += volumeOf(data);
    previousCardioDistance += data.sets.reduce((sum, set) => sum + (set.distanceMeters ?? 0), 0);
    previousCardioDuration += data.sets.reduce((sum, set) => sum + (set.durationSeconds ?? 0), 0);
    const key = name.toLocaleLowerCase();
    previousBestByExercise.set(
      key,
      Math.max(previousBestByExercise.get(key) ?? 0, heaviestSet(data).weight),
    );
  });

  // Normalise to a week so a 30d and a 90d window are read the same way.
  const weeks = period / 7;
  const muscles: MuscleVolume[] = [...byMuscle.entries()]
    .map(([key, value]) => {
      const weeklySets = value.sets / weeks;
      return {
        key,
        muscle: value.muscle,
        portion: value.portion,
        group: value.group,
        sets: value.sets,
        weeklySets,
        verdict: volumeVerdict(weeklySets),
        synergistSets: value.synergistSets,
        loadKg: value.loadKg,
        share: Math.min(1, weeklySets / WEEKLY_SET_TARGET.hard),
      };
    })
    .filter((m) => m.sets > 0 || m.synergistSets > 0)
    .sort((a, b) => b.weeklySets - a.weeklySets || b.synergistSets - a.synergistSets);

  const exercises: ExerciseProgress[] = [...byExercise.entries()]
    .map(([key, value]) => {
      const previousBest = previousBestByExercise.get(key) ?? 0;
      return {
        name: value.name,
        group: value.group,
        sessions: value.dates.size,
        volumeKg: value.volumeKg,
        bestWeightKg: value.bestWeightKg,
        bestWeightReps: value.bestWeightReps,
        previousBestWeightKg: previousBest,
        deltaPct: percentChange(value.bestWeightKg, previousBest),
        lastDate: value.lastDate,
      };
    })
    .sort((a, b) => b.volumeKg - a.volumeKg);

  // Align every series to the same bucket axis, filling gaps with zero so the
  // lines stay comparable instead of each drawing its own timeline.
  const buckets = [...allBuckets].sort();
  const seriesKeys = [...new Set([...byBucketSeries.values()].flatMap((row) => [...row.keys()]))];
  const seriesList: ChartSeries[] = seriesKeys
    .map((key) => ({
      key,
      kind: seriesKind,
      group: seriesGroups.get(key) ?? ("other" as MuscleGroupId),
      points: buckets.map((bucket) => byBucketSeries.get(bucket)?.get(key) ?? 0),
    }))
    .sort(
      (a, b) =>
        b.points.reduce((x, y) => x + y, 0) - a.points.reduce((x, y) => x + y, 0),
    );

  const exerciseSeries: ExerciseSeries[] = [...exerciseBuckets.entries()]
    .map(([name, row]) => ({
      name,
      group: exerciseGroupOf.get(name) ?? ("other" as MuscleGroupId),
      loadKg: buckets.map((bucket) => row.get(bucket)?.load ?? 0),
      sets: buckets.map((bucket) => row.get(bucket)?.sets ?? 0),
    }))
    .sort((a, b) => Math.max(...b.loadKg) - Math.max(...a.loadKg));

  const cardioSeries: CardioSeries[] = [...cardioBuckets.entries()]
    .map(([name, row]) => ({
      name,
      distanceKm: buckets.map((bucket) => Math.round(row.get(bucket)?.km ?? 0)),
      durationMin: buckets.map((bucket) => Math.round(row.get(bucket)?.min ?? 0)),
      paceSecPerKm: buckets.map((bucket) => {
        const at = row.get(bucket);
        if (!at || at.km <= 0 || at.min <= 0) return 0;
        return Math.round((at.min * 60) / at.km);
      }),
    }))
    .sort(
      (a, b) =>
        b.distanceKm.reduce((x, y) => x + y, 0) - a.distanceKm.reduce((x, y) => x + y, 0),
    );

  const previousCardioPace = paceOf(previousCardioDistance, previousCardioDuration);
  const totalSets = muscles.reduce((sum, m) => sum + m.sets, 0);
  const unclassified = muscles.find((m) => m.muscle === 'unclassified')?.sets ?? 0;

  return {
    hasData: current.length > 0,
    days: days.size,
    totals,
    volumeDeltaPct: percentChange(totals.volumeKg, previousVolume),
    muscles,
    exercises,
    cardio: cardioDates.size
      ? {
          sessions: cardioDates.size,
          streak: currentStreak(cardioDates, today),
          distanceMeters: cardioDistance,
          durationSeconds: cardioDuration,
          bestPaceSecondsPerKm: bestPace,
          avgPaceSecondsPerKm: paceOf(cardioDistance, cardioDuration),
          previousDistanceMeters: previousCardioDistance,
          distanceDeltaPct: percentChange(cardioDistance, previousCardioDistance),
          // Pace inverted so positive always means better, same as the day panel.
          paceDeltaPct:
            previousCardioPace !== null && paceOf(cardioDistance, cardioDuration) !== null
              ? percentChange(previousCardioPace, paceOf(cardioDistance, cardioDuration) as number)
              : undefined,
          modalities: [...byModality.values()]
            .map((modality) => ({
              name: modality.name,
              sessions: modality.dates.size,
              distanceMeters: modality.distanceMeters,
              durationSeconds: modality.durationSeconds,
              bestPaceSecondsPerKm: modality.bestPace,
              avgPaceSecondsPerKm: paceOf(modality.distanceMeters, modality.durationSeconds),
              longestDistanceMeters: modality.longestDistanceMeters,
              longestDurationSeconds: modality.longestDurationSeconds,
            }))
            .sort((a, b) => b.distanceMeters - a.distanceMeters || b.durationSeconds - a.durationSeconds),
        }
      : null,
    streak: currentStreak(days, today),
    buckets,
    series: seriesList,
    exerciseSeries,
    cardioSeries,
    weeks: [...byWeek.values()].sort((a, b) => a.weekStart.localeCompare(b.weekStart)),
    granularity,
    unclassifiedShare: totalSets > 0 ? unclassified / totalSets : 0,
  };
}
