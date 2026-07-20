import type { AppIconName } from '@/components/atoms/AppIcon';
import type { Entry } from '@/core/types';
import { t } from '@/i18n';

import type { WorkoutData } from './schemas';
import {
  formatWorkoutDistance,
  formatWorkoutDuration,
  formatWorkoutPace,
  type WorkoutTotals,
  uniqueWorkoutExerciseNames,
  workoutConfig,
} from './workout';

export type ProgressTone = 'pr' | 'first' | 'up' | 'flat';

export interface ProgressRow {
  name: string;
  icon: AppIconName;
  tone: ProgressTone;
  badge: string;
  /** The one number this exercise is judged on today, formatted. */
  headline: string;
  /** Supporting metrics, already formatted — "3 series", "1 h - 5:00/km". */
  detail: string;
  /** Percent change vs `reference`. Positive is always the good direction. */
  deltaPct?: number;
  /** What the delta is measured against, formatted. */
  reference?: string;
}

interface Session {
  totals: WorkoutTotals;
  pace: number | null;
}

interface ExerciseHistory {
  best: WorkoutTotals;
  bestPace: number | null;
  last: Session | null;
}

type SessionsByExercise = Map<string, Map<string, { name: string; totals: WorkoutTotals }>>;

function isWorkoutData(data: Entry['data']): data is WorkoutData {
  return Boolean(data && 'sets' in data);
}

function entryExercise(entry: Entry): string | null {
  if (!isWorkoutData(entry.data)) return null;
  return uniqueWorkoutExerciseNames([{ text: entry.text, data: entry.data }])[0] ?? null;
}

function addTotals(left: WorkoutTotals, right: WorkoutTotals): WorkoutTotals {
  return {
    sets: left.sets + right.sets,
    volumeKg: left.volumeKg + right.volumeKg,
    durationSeconds: left.durationSeconds + right.durationSeconds,
    distanceMeters: left.distanceMeters + right.distanceMeters,
  };
}

export function paceOf(totals: WorkoutTotals): number | null {
  if (!totals.durationSeconds || !totals.distanceMeters) return null;
  const km = totals.distanceMeters / 1000;
  return km > 0 ? totals.durationSeconds / km : null;
}

export function isCardioSession(totals: WorkoutTotals): boolean {
  return (totals.distanceMeters > 0 || totals.durationSeconds > 0) && totals.volumeKg === 0;
}

/**
 * Sum a day's entries per exercise. Both today and every past day go through
 * this, so a session split across three entries compares fairly against one
 * logged in a single entry.
 */
export function sessionsByExercise(entries: Entry[]): SessionsByExercise {
  const byExercise: SessionsByExercise = new Map();

  entries.forEach((entry) => {
    if (entry.status !== 'done' || !isWorkoutData(entry.data)) return;
    const exercise = entryExercise(entry);
    if (!exercise) return;

    const key = exercise.toLocaleLowerCase();
    const days = byExercise.get(key) ?? new Map<string, { name: string; totals: WorkoutTotals }>();
    const day = days.get(entry.date);
    const totals = workoutConfig.addToTotals(workoutConfig.emptyTotals, entry.data);
    days.set(entry.date, {
      name: day?.name ?? exercise,
      totals: day ? addTotals(day.totals, totals) : totals,
    });
    byExercise.set(key, days);
  });

  return byExercise;
}

export function buildHistory(entries: Entry[], date: string): Map<string, ExerciseHistory> {
  const history = new Map<string, ExerciseHistory>();

  sessionsByExercise(entries).forEach((days, key) => {
    const past = [...days.entries()]
      .filter(([day]) => day < date)
      .sort(([a], [b]) => a.localeCompare(b));
    if (!past.length) return;

    let best = workoutConfig.emptyTotals;
    let bestPace: number | null = null;
    past.forEach(([, session]) => {
      best = {
        sets: Math.max(best.sets, session.totals.sets),
        volumeKg: Math.max(best.volumeKg, session.totals.volumeKg),
        durationSeconds: Math.max(best.durationSeconds, session.totals.durationSeconds),
        distanceMeters: Math.max(best.distanceMeters, session.totals.distanceMeters),
      };
      const pace = paceOf(session.totals);
      if (pace !== null) bestPace = bestPace === null ? pace : Math.min(bestPace, pace);
    });

    const lastTotals = past[past.length - 1][1].totals;
    history.set(key, {
      best,
      bestPace,
      last: { totals: lastTotals, pace: paceOf(lastTotals) },
    });
  });

  return history;
}

/** Headline first, everything else demoted to a supporting line. */
function cardioShape(totals: WorkoutTotals, pace: number | null) {
  const hasDistance = totals.distanceMeters > 0;
  const headline = hasDistance
    ? formatWorkoutDistance(totals.distanceMeters)
    : formatWorkoutDuration(totals.durationSeconds);
  const detail = [
    hasDistance && totals.durationSeconds > 0 ? formatWorkoutDuration(totals.durationSeconds) : '',
    pace !== null ? formatWorkoutPace(pace) : '',
  ]
    .filter(Boolean)
    .join(' · ');
  return { headline, detail };
}

function strengthShape(totals: WorkoutTotals) {
  return {
    headline: `${Math.round(totals.volumeKg)} kg`,
    detail: totals.sets > 0 ? `${totals.sets} ${t('totals.sets')}` : '',
  };
}

function percentChange(current: number, reference: number): number | undefined {
  if (reference <= 0) return undefined;
  return Math.round(((current - reference) / reference) * 100);
}

const TONE_ORDER: Record<ProgressTone, number> = { pr: 0, first: 1, up: 2, flat: 3 };

/**
 * One row per exercise, not per metric. The previous shape emitted a row for
 * every metric that moved, so a single run showed up twice — once for distance,
 * once for duration — which read as two separate achievements.
 */
export function buildProgressRows(
  todayEntries: Entry[],
  historyEntries: Entry[],
  date: string,
): ProgressRow[] {
  const today = sessionsByExercise(todayEntries);
  const history = buildHistory(historyEntries, date);
  const rows: ProgressRow[] = [];

  today.forEach((days, key) => {
    const session = days.get(date);
    if (!session) return;

    const { totals, name } = session;
    const cardio = isCardioSession(totals);
    const pace = paceOf(totals);
    const past = history.get(key);
    const shape = cardio ? cardioShape(totals, pace) : strengthShape(totals);
    if (!shape.headline) return;

    const base = {
      name,
      icon: (cardio ? 'navigation' : 'dumbbell') as AppIconName,
      headline: shape.headline,
      detail: shape.detail,
    };

    if (!past) {
      rows.push({ ...base, tone: 'first', badge: t('workout.progress.first') });
      return;
    }

    // Headline metric: the one this kind of exercise is actually judged on.
    const current = cardio ? totals.distanceMeters : totals.volumeKg;
    const best = cardio ? past.best.distanceMeters : past.best.volumeKg;
    const last = cardio ? past.last?.totals.distanceMeters ?? 0 : past.last?.totals.volumeKg ?? 0;
    const format = (value: number) =>
      cardio ? formatWorkoutDistance(value) : `${Math.round(value)} kg`;

    if (cardio && pace !== null && past.bestPace !== null && pace < past.bestPace) {
      rows.push({
        ...base,
        tone: 'pr',
        badge: t('workout.progress.pace'),
        // Faster is lower, so invert to keep positive meaning "better".
        deltaPct: percentChange(past.bestPace, pace),
        reference: formatWorkoutPace(past.bestPace),
      });
      return;
    }

    if (current > best && best > 0) {
      rows.push({
        ...base,
        tone: 'pr',
        badge: cardio ? t('workout.progress.distance') : t('workout.progress.volume'),
        deltaPct: percentChange(current, best),
        reference: format(best),
      });
      return;
    }

    if (current > last && last > 0) {
      rows.push({
        ...base,
        tone: 'up',
        badge: t('workout.progress.up'),
        deltaPct: percentChange(current, last),
        reference: format(last),
      });
      return;
    }

    rows.push({
      ...base,
      tone: 'flat',
      badge: t('workout.progress.same'),
      reference: last > 0 ? format(last) : undefined,
    });
  });

  // Wins first — the point of the panel is seeing progress, not an inventory.
  return rows.sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone]);
}
