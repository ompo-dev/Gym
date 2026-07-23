import type { Entry } from '@/core/types';
import { normalizeForEnrich } from '@/core/enrich/normalize';
import { Colors } from '@/constants/theme';
import { type WorkoutData, type WorkoutSet, workoutSchema } from '@/domains/schemas';
import type { DomainConfig } from '@/domains/types';
import { t } from '@/i18n';

export interface WorkoutTotals {
  sets: number;
  volumeKg: number;
  durationSeconds: number;
  distanceMeters: number;
}

export type WorkoutKind = NonNullable<WorkoutData['kind']>;

const workoutColors = Colors.dark;
export const WORKOUT_METRIC_COLORS = {
  sets: workoutColors.accent,
  volume: '#4D8DFF',
  reps: '#34C759',
  duration: '#FF922E',
  distance: '#34C759',
} as const;
const SET_VALUE_RE = /(\d+(?:[.,]\d+)?)\s*(kg|kgs?|lb|lbs?)?/gi;
const REPS_RE = /(\d+(?:[.,]\d+)?)\s*(?:reps?|repeti[cç](?:oes|ões|ao|ão))\b/i;
const DISTANCE_RE =
  /(\d+(?:[.,]\d+)?)\s*(km|kms|quil[oô]metros?|kilometers?|kilometres?|m|metros?|meters?|metres?)\b/gi;
const HOUR_MIN_RE =
  /\b(\d+(?:[.,]\d+)?)\s*(?:h|hr|hrs|hora|horas)\s*(?:(\d+(?:[.,]\d+)?)\s*(?:min|mins|minuto|minutos)?)?/i;
const TIME_VALUE_RE =
  /(\d+(?:[.,]\d+)?)\s*(h|hr|hrs|hora|horas|min|mins|minuto|minutos|s|sec|secs|seg|segundo|segundos)\b/gi;
const TIME_COLON_RE = /\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/;
const CARDIO_EXERCISE_RE =
  /\b(?:cardio|corrida|correr|run|running|esteira|treadmill|caminhada|walk|walking|bike|bicicleta|ciclismo|cycling|spinning|eliptico|eliptical|remo|rowing|natacao|nadar|swim|swimming|escada|stair|hiit)\b/i;

export const toKg = (weight: number, unit: 'kg' | 'lb'): number =>
  unit === 'lb' ? weight * 0.45359237 : weight;

function toNumber(token: string): number {
  return Number(token.replace(',', '.'));
}

export function formatWorkoutNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
}

function normalizeUnit(unit?: string): 'kg' | 'lb' | undefined {
  if (!unit) return undefined;
  return unit.toLowerCase().startsWith('lb') ? 'lb' : 'kg';
}

export function formatWorkoutSet(weight: number, unit: 'kg' | 'lb', reps: number): string {
  return `${formatWorkoutNumber(weight)} ${unit} x ${reps}`;
}

export function formatWorkoutDuration(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes < 1) return `${Math.round(seconds)} s`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!hours) return `${minutes} min`;
  return minutes ? `${hours} h ${minutes} min` : `${hours} h`;
}

export function formatWorkoutDistance(meters: number): string {
  if (meters >= 1000) return `${formatWorkoutNumber(meters / 1000)} km`;
  return `${Math.round(meters)} m`;
}

export function getWorkoutSetPaceSecondsPerKm(set: WorkoutSet): number | null {
  if (!set.durationSeconds || !set.distanceMeters) return null;
  const kilometers = set.distanceMeters / 1000;
  return kilometers > 0 ? set.durationSeconds / kilometers : null;
}

export function formatWorkoutPace(secondsPerKm: number): string {
  const roundedSeconds = Math.max(0, Math.round(secondsPerKm));
  const minutes = Math.floor(roundedSeconds / 60);
  const seconds = roundedSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}/km`;
}

export function formatWorkoutSetPace(set: WorkoutSet): string | null {
  const pace = getWorkoutSetPaceSecondsPerKm(set);
  return pace === null ? null : formatWorkoutPace(pace);
}

export function getWorkoutSetVolume(set: WorkoutSet): number {
  if (set.weight === undefined || set.reps === undefined) return 0;
  return toKg(set.weight, set.unit ?? 'kg') * set.reps;
}

export function formatWorkoutSetVolume(set: WorkoutSet): string {
  return `${Math.round(getWorkoutSetVolume(set))} kg`;
}

export function formatWorkoutSetSummary(set: WorkoutSet): string {
  const parts: string[] = [];
  if (set.weight !== undefined && set.reps !== undefined) {
    parts.push(formatWorkoutSet(set.weight, set.unit ?? 'kg', set.reps));
  } else if (set.reps !== undefined) {
    parts.push(`${set.reps} reps`);
  }
  if (set.distanceMeters) parts.push(formatWorkoutDistance(set.distanceMeters));
  if (set.durationSeconds) parts.push(formatWorkoutDuration(set.durationSeconds));
  return parts.join(' - ');
}

export function inferWorkoutKind(
  data: Pick<WorkoutData, 'sets'>,
  exercise?: string | null,
): WorkoutKind {
  const hasCardioMetric = data.sets.some(
    (set) => set.durationSeconds !== undefined || set.distanceMeters !== undefined,
  );
  const hasLoadMetric = data.sets.some((set) => set.weight !== undefined);

  if (hasCardioMetric && !hasLoadMetric) return 'cardio';
  if (exercise && CARDIO_EXERCISE_RE.test(exercise)) return 'cardio';
  return 'strength';
}

export function normalizeWorkoutExercise(text: string, locale?: string): string {
  return normalizeForEnrich(text, { domain: 'workout', locale }).trim();
}

function stripWorkoutMetrics(line: string): string {
  return line
    .replace(DISTANCE_RE, ' ')
    .replace(HOUR_MIN_RE, ' ')
    .replace(TIME_VALUE_RE, ' ')
    .replace(TIME_COLON_RE, ' ')
    .replace(/\d+(?:[.,]\d+)?\s*(?:kg|kgs?|lb|lbs?)?/gi, ' ')
    .replace(/\b(?:x|reps?|repeti[cç](?:oes|ões|ao|ão))\b/gi, ' ')
    .replace(/[.,;:()[\]{}-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripCardioMetrics(line: string): string {
  return line
    .replace(DISTANCE_RE, ' ')
    .replace(HOUR_MIN_RE, ' ')
    .replace(TIME_VALUE_RE, ' ')
    .replace(TIME_COLON_RE, ' ');
}

export function getWorkoutExerciseLine(text: string): string | null {
  const rawLines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (rawLines.length === 0) return null;
  const firstLine = rawLines[0];
  if (!parseWorkoutSetLine(firstLine)) return firstLine;
  return stripWorkoutMetrics(firstLine) || null;
}

function parseDistanceMeters(line: string): number | undefined {
  let meters = 0;
  for (const match of line.toLowerCase().matchAll(DISTANCE_RE)) {
    const amount = toNumber(match[1]);
    const unit = match[2];
    meters += unit.startsWith('km') || unit.startsWith('quilo') || unit.startsWith('kilo')
      ? amount * 1000
      : amount;
  }
  return meters > 0 ? meters : undefined;
}

function parseDurationSeconds(line: string): number | undefined {
  const lower = line.toLowerCase();
  const hourMinute = lower.match(HOUR_MIN_RE);
  if (hourMinute) {
    const hours = toNumber(hourMinute[1]);
    const minutes = hourMinute[2] ? toNumber(hourMinute[2]) : 0;
    return Math.round(hours * 3600 + minutes * 60);
  }

  const colon = lower.match(TIME_COLON_RE);
  if (colon) {
    const first = Number(colon[1]);
    const second = Number(colon[2]);
    const third = colon[3] ? Number(colon[3]) : null;
    return third === null ? first * 60 + second : first * 3600 + second * 60 + third;
  }

  let seconds = 0;
  for (const match of lower.matchAll(TIME_VALUE_RE)) {
    const amount = toNumber(match[1]);
    const unit = match[2];
    if (unit.startsWith('h') || unit.startsWith('hora')) seconds += amount * 3600;
    else if (unit.startsWith('s') || unit.startsWith('seg')) seconds += amount;
    else seconds += amount * 60;
  }
  return seconds > 0 ? Math.round(seconds) : undefined;
}

function parseStrengthSetLine(line: string, unitHint: 'kg' | 'lb'): WorkoutSet | null {
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

function parseRepsOnlyLine(line: string): WorkoutSet | null {
  const match = line.toLowerCase().match(REPS_RE);
  if (!match) return null;
  return { reps: Math.round(toNumber(match[1])) };
}

export function parseWorkoutSetLine(line: string, unitHint: 'kg' | 'lb' = 'kg'): WorkoutSet | null {
  const distanceMeters = parseDistanceMeters(line);
  const durationSeconds = parseDurationSeconds(line);
  const hasCardio = distanceMeters !== undefined || durationSeconds !== undefined;
  const strengthLine = hasCardio ? stripCardioMetrics(line) : line;
  const hasExplicitStrength =
    /(?:x|\u00d7)/i.test(strengthLine) || /\b(?:kg|kgs?|lb|lbs?)\b/i.test(strengthLine);
  const base =
    hasCardio && !hasExplicitStrength
      ? parseRepsOnlyLine(strengthLine)
      : parseStrengthSetLine(strengthLine, unitHint) ?? parseRepsOnlyLine(strengthLine);
  const set: WorkoutSet = {
    ...(base ?? {}),
    ...(distanceMeters !== undefined ? { distanceMeters } : {}),
    ...(durationSeconds !== undefined ? { durationSeconds } : {}),
  };

  return Object.keys(set).length ? set : null;
}

export function parseWorkoutSetLines(lines: string[]): (WorkoutSet | null)[] {
  let lastUnit: 'kg' | 'lb' = 'kg';

  return lines.map((line) => {
    const parsed = parseWorkoutSetLine(line, lastUnit);
    if (parsed?.unit) lastUnit = parsed.unit;
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
    const exercise = fallbackExercise ?? null;
    return { exercise, kind: inferWorkoutKind({ sets: [] }, exercise), sets: [], synergists: [], stabilizers: [] };
  }

  const exerciseFromFirstLine = getWorkoutExerciseLine(text);
  const firstLineSet = parseWorkoutSetLine(rawLines[0] ?? '');
  let exerciseLine = exerciseFromFirstLine ?? '';
  let setLines = rawLines.slice(1);

  if (firstLineSet && exerciseFromFirstLine) {
    setLines = rawLines;
  } else if (!exerciseFromFirstLine) {
    setLines = rawLines;
    exerciseLine = '';
  }

  const exercise = normalizeWorkoutExercise(exerciseLine, locale) || fallbackExercise || null;
  const sets = parseWorkoutSetLines(setLines).filter((set): set is WorkoutSet => Boolean(set));

  return { exercise, kind: inferWorkoutKind({ sets }, exercise), sets, synergists: [], stabilizers: [] };
}

export function serializeWorkoutLines(lines: string[]): string {
  const trimmed = lines.map((line) => line.trim());
  const exercise = trimmed[0] ?? '';
  const sets = trimmed.slice(1).filter((line) => line.length > 0);
  return [exercise, ...sets].join('\n').trim();
}

export function uniqueWorkoutExerciseNames(
  entries: { text: string; data?: WorkoutData | null }[],
  locale?: string,
): string[] {
  const seen = new Set<string>();
  return entries.flatMap((entry) => {
    const exercise =
      entry.data?.exercise ?? normalizeWorkoutExercise(entry.text.split('\n')[0] ?? '', locale);
    const name = exercise.trim();
    const key = name.toLocaleLowerCase();
    if (!name || seen.has(key)) return [];
    seen.add(key);
    return [name];
  });
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
    const body = data.sets.map(formatWorkoutSetSummary).join(', ');
    if (!data.exercise) return body;
    return body ? `${data.exercise} - ${body}` : data.exercise;
  },
  emptyTotals: { sets: 0, volumeKg: 0, durationSeconds: 0, distanceMeters: 0 },
  addToTotals: (totals, data) => ({
    sets: totals.sets + data.sets.length,
    volumeKg: totals.volumeKg + data.sets.reduce((sum, set) => sum + getWorkoutSetVolume(set), 0),
    durationSeconds:
      totals.durationSeconds + data.sets.reduce((sum, set) => sum + (set.durationSeconds ?? 0), 0),
    distanceMeters:
      totals.distanceMeters + data.sets.reduce((sum, set) => sum + (set.distanceMeters ?? 0), 0),
  }),
  describeTotals: (totals) =>
    [
      { key: 'sets', label: t('totals.sets'), value: `${totals.sets}`, color: workoutColors.accent },
      {
        key: 'vol',
        label: t('totals.vol'),
        value: `${Math.round(totals.volumeKg)} kg`,
        color: WORKOUT_METRIC_COLORS.volume,
      },
      {
        key: 'time',
        label: t('totals.time'),
        value: formatWorkoutDuration(totals.durationSeconds),
        color: WORKOUT_METRIC_COLORS.duration,
      },
      {
        key: 'dist',
        label: t('totals.dist'),
        value: formatWorkoutDistance(totals.distanceMeters),
        color: WORKOUT_METRIC_COLORS.distance,
      },
    ],
};

/** Narrows an entry payload to workout data. The third copy of this triggered the cleanup. */
export function isWorkoutData(data: Entry['data']): data is WorkoutData {
  return Boolean(data && 'sets' in data);
}
