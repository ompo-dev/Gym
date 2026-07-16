import { normalizeForEnrich } from '@/core/enrich/normalize';
import { Colors } from '@/constants/theme';
import { type WorkoutData, type WorkoutSet, workoutSchema } from '@/domains/schemas';
import type { DomainConfig } from '@/domains/types';
import { t } from '@/i18n';

export interface WorkoutTotals {
  sets: number;
  volumeKg: number;
}

const workoutColors = Colors.dark;
const SET_VALUE_RE = /(\d+(?:[.,]\d+)?)\s*(kg|kgs?|lb|lbs?)?/gi;

export const toKg = (weight: number, unit: 'kg' | 'lb'): number =>
  unit === 'lb' ? weight * 0.45359237 : weight;

function toNumber(token: string): number {
  return Number(token.replace(',', '.'));
}

function formatWorkoutNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
}

function normalizeUnit(unit?: string): 'kg' | 'lb' | undefined {
  if (!unit) return undefined;
  return unit.toLowerCase().startsWith('lb') ? 'lb' : 'kg';
}

export function formatWorkoutSet(weight: number, unit: 'kg' | 'lb', reps: number): string {
  return `${formatWorkoutNumber(weight)} ${unit} x ${reps}`;
}

export function getWorkoutSetVolume(set: WorkoutSet): number {
  return toKg(set.weight, set.unit) * set.reps;
}

export function formatWorkoutSetVolume(set: WorkoutSet): string {
  return `${Math.round(getWorkoutSetVolume(set))} kg`;
}

export function normalizeWorkoutExercise(text: string, locale?: string): string {
  return normalizeForEnrich(text, { domain: 'workout', locale }).trim();
}

export function getWorkoutExerciseLine(text: string): string | null {
  const rawLines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (rawLines.length === 0) return null;
  return parseWorkoutSetLine(rawLines[0]) ? null : rawLines[0];
}

export function parseWorkoutSetLine(line: string, unitHint: 'kg' | 'lb' = 'kg'): WorkoutSet | null {
  const matches = [...line.toLowerCase().matchAll(SET_VALUE_RE)];
  if (matches.length < 2) return null;

  const first = matches[0];
  const second = matches[1];
  const firstValue = toNumber(first[1]);
  const secondValue = toNumber(second[1]);
  const firstUnit = normalizeUnit(first[2]);
  const secondUnit = normalizeUnit(second[2]);

  let weight = firstValue;
  let reps = Math.round(secondValue);
  let unit = firstUnit ?? secondUnit ?? unitHint;

  if (firstUnit && !secondUnit) {
    weight = firstValue;
    reps = Math.round(secondValue);
  } else if (!firstUnit && secondUnit) {
    weight = secondValue;
    reps = Math.round(firstValue);
    unit = secondUnit;
  } else if (firstValue <= 30 && secondValue > 30) {
    weight = secondValue;
    reps = Math.round(firstValue);
  } else if (secondValue <= 30 && firstValue > 30) {
    weight = firstValue;
    reps = Math.round(secondValue);
  } else if (!Number.isInteger(firstValue) && Number.isInteger(secondValue)) {
    weight = firstValue;
    reps = Math.round(secondValue);
  } else if (Number.isInteger(firstValue) && !Number.isInteger(secondValue)) {
    weight = secondValue;
    reps = Math.round(firstValue);
  }

  return { weight, unit, reps };
}

export function parseWorkoutSetLines(lines: string[]): (WorkoutSet | null)[] {
  let lastUnit: 'kg' | 'lb' = 'kg';

  return lines.map((line) => {
    const parsed = parseWorkoutSetLine(line, lastUnit);
    if (parsed) lastUnit = parsed.unit;
    return parsed;
  });
}

interface ParseWorkoutTextOptions {
  locale?: string;
  fallbackExercise?: string;
}

export function parseWorkoutText(
  text: string,
  { locale, fallbackExercise }: ParseWorkoutTextOptions = {},
): WorkoutData {
  const rawLines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (rawLines.length === 0) {
    return { exercise: fallbackExercise ?? null, sets: [] };
  }

  let exerciseLine = rawLines[0] ?? '';
  let setLines = rawLines.slice(1);

  if (!getWorkoutExerciseLine(text)) {
    setLines = rawLines;
    exerciseLine = '';
  }

  const exercise = normalizeWorkoutExercise(exerciseLine, locale) || fallbackExercise || null;
  const sets = parseWorkoutSetLines(setLines).filter((set): set is WorkoutSet => Boolean(set));

  return { exercise, sets };
}

export function serializeWorkoutLines(lines: string[]): string {
  const trimmed = lines.map((line) => line.trim());
  const exercise = trimmed[0] ?? '';
  const sets = trimmed.slice(1).filter((line) => line.length > 0);
  return [exercise, ...sets].join('\n').trim();
}

export const workoutConfig: DomainConfig<WorkoutData, WorkoutTotals> = {
  id: 'workout',
  get title() {
    return t('workout.title');
  },
  get placeholder() {
    return t('workout.placeholder');
  },
  accent: workoutColors.accent,
  schema: workoutSchema,
  formatResult: (data) => {
    const body = data.sets.map((set) => formatWorkoutSet(set.weight, set.unit, set.reps)).join(', ');
    if (!data.exercise) return body;
    return body ? `${data.exercise} - ${body}` : data.exercise;
  },
  emptyTotals: { sets: 0, volumeKg: 0 },
  addToTotals: (totals, data) => ({
    sets: totals.sets + data.sets.length,
    volumeKg: totals.volumeKg + data.sets.reduce((sum, set) => sum + getWorkoutSetVolume(set), 0),
  }),
  describeTotals: (totals) => [
    { key: 'sets', label: t('totals.sets'), value: `${totals.sets}`, color: workoutColors.accent },
    {
      key: 'vol',
      label: t('totals.vol'),
      value: `${Math.round(totals.volumeKg)} kg`,
      color: workoutColors.accent,
    },
  ],
};
