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
  /(\d+(?:[.,]\d+)?)\s*(kms?|k|quil[oô]metros?|kil[oô]metros?|kilometers?|kilometres?|m|metros?|meters?|metres?)\b/gi;
// Only trailing minutes ADJACENT to the hour ("1h30") or carrying a min unit
// ("1h 30min") count — a bare space-separated number ("1h 10km") is the next
// token's distance, not minutes, and must not be eaten as time.
const HOUR_MIN_RE =
  /\b(\d+(?:[.,]\d+)?)\s*(?:h|hr|hrs|hora|horas)(?:(\d+(?:[.,]\d+)?)|\s*(\d+(?:[.,]\d+)?)\s*(?:min|mins|minuto|minutos))?/i;
// A distance written in kilometres ("5km", "5k", "5 quilômetros"). Used to
// decide whether a bare "Nm" is metres or minutes.
const KM_UNIT_RE =
  /\d[\d.,]*\s*(?:kms?|k|quil[oô]metros?|kil[oô]metros?|kilometers?|kilometres?)\b/i;
const TIME_VALUE_RE =
  /(\d+(?:[.,]\d+)?)\s*(h|hr|hrs|hora|horas|min|mins|minuto|minutos|s|sec|secs|seg|segundo|segundos)\b/gi;
const TIME_COLON_RE = /\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/;
// "3 de 20 50kg" / "3x10 80kg" = N sets of R reps [@ W]. Group: count, separator,
// reps, optional weight, optional unit. "de"/"por" always means "N sets of";
// "x" only when a separate weight number follows (else it's a one-set reps×weight).
const SET_MULTIPLIER_RE =
  /\b(\d+)\s*(x|×|de|por)\s*(\d+(?:[.,]\d+)?)(?:\s+(\d+(?:[.,]\d+)?)\s*(kg|kgs?|lb|lbs?)?)?/i;
const LEADING_WEIGHT_SET_MULTIPLIER_RE =
  /\b(\d+(?:[.,]\d+)?)\s*(kg|kgs?|lb|lbs?)\s+(\d+)\s*(x|\u00d7|de|por)\s*(\d+(?:[.,]\d+)?)/i;
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

/**
 * Session tonnage (`volumeKg`), for totals — not for a single set, which stays in
 * kg because one set never reaches a tonne. Past 1 t the kilogram digits stop
 * carrying meaning: "15000 kg" is a number you read digit by digit, "15 t" is one
 * you take in at a glance. One decimal below 10 t so a single set still moves it.
 */
export function formatWorkoutLoad(kg: number): string {
  const rounded = Math.round(kg);
  if (rounded < 1000) return `${rounded} kg`;
  const tonnes = rounded / 1000;
  return tonnes < 10
    ? `${formatWorkoutNumber(Number(tonnes.toFixed(1)))} t`
    : `${Math.round(tonnes)} t`;
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
    // "3 de 20", "3x10" — a set count joined to reps by a connector. Stripped
    // as a unit so the connector ("de"/"por") never leaks into the exercise
    // name; a lone "de" between words (e.g. "elevação de panturrilha") is safe
    // because this only matches digit-connector-digit.
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:x|×|de|por)\s*\d+(?:[.,]\d+)?\b/gi, ' ')
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
  const lower = line.toLowerCase();
  const hasKm = KM_UNIT_RE.test(lower);
  let meters = 0;
  for (const match of lower.matchAll(DISTANCE_RE)) {
    const amount = toNumber(match[1]);
    const unit = match[2];
    if (unit.startsWith('km') || unit === 'k' || unit.startsWith('quil') || unit.startsWith('kil')) {
      meters += amount * 1000;
      continue;
    }
    // Bare "Nm" is metres — unless a km distance is already there and N is
    // small, in which case it's minutes ("5km 30m" = 5 km in 30 min). Handled
    // as duration by parseDurationSeconds; skip it here.
    if (unit === 'm' && hasKm && amount < 100) continue;
    meters += amount;
  }
  return meters > 0 ? meters : undefined;
}

function parseDurationSeconds(line: string): number | undefined {
  const lower = line.toLowerCase();
  const hourMinute = lower.match(HOUR_MIN_RE);
  if (hourMinute) {
    const hours = toNumber(hourMinute[1]);
    const minsToken = hourMinute[2] ?? hourMinute[3];
    const minutes = minsToken ? toNumber(minsToken) : 0;
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
  // "30'" prime = minutes.
  for (const match of lower.matchAll(/(\d+(?:[.,]\d+)?)\s*['′]/g)) {
    seconds += toNumber(match[1]) * 60;
  }
  // "5km 30m": a small bare "Nm" beside a km distance is minutes, not metres
  // (parseDistanceMeters skips it for the same reason).
  if (KM_UNIT_RE.test(lower)) {
    for (const match of lower.matchAll(/(\d+(?:[.,]\d+)?)\s*m\b/gi)) {
      const amount = toNumber(match[1]);
      if (amount < 100) seconds += amount * 60;
    }
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

/**
 * "3 de 20 50kg" / "supino 3x10 80kg" → N identical sets of R reps [@ W].
 * Returns null when the line is not a set multiplier, so the caller falls back
 * to the normal one-set parse. "x" only multiplies when a separate weight
 * number follows it — "8x100" stays one set (8 reps × 100), "3x10 80kg" is 3.
 */
function parseSetMultiplier(line: string, unitHint: 'kg' | 'lb'): WorkoutSet[] | null {
  // Cardio lines (distance/duration) are never a set multiplier.
  if (parseDistanceMeters(line) !== undefined || parseDurationSeconds(line) !== undefined) {
    return null;
  }
  const lower = line.toLowerCase();
  const leadingWeightMatch = lower.match(LEADING_WEIGHT_SET_MULTIPLIER_RE);
  if (leadingWeightMatch) {
    const count = Math.round(toNumber(leadingWeightMatch[3]));
    if (count < 1 || count > 20) return null;

    const set: WorkoutSet = {
      weight: toNumber(leadingWeightMatch[1]),
      unit: normalizeUnit(leadingWeightMatch[2]) ?? unitHint,
      reps: Math.round(toNumber(leadingWeightMatch[5])),
    };
    return Array.from({ length: count }, () => ({ ...set }));
  }

  const match = lower.match(SET_MULTIPLIER_RE);
  if (!match) return null;

  const count = Math.round(toNumber(match[1]));
  if (count < 1 || count > 20) return null;

  const separator = match[2];
  const reps = Math.round(toNumber(match[3]));
  const hasWeight = match[4] !== undefined;
  // A bare "N x R" with no trailing weight is a normal reps×weight one-set line.
  if ((separator === 'x' || separator === '×') && !hasWeight) return null;

  const set: WorkoutSet = { reps };
  if (hasWeight) {
    set.weight = toNumber(match[4]);
    set.unit = normalizeUnit(match[5]) ?? unitHint;
  }
  return Array.from({ length: count }, () => ({ ...set }));
}

export function parseWorkoutSetLines(lines: string[]): (WorkoutSet | null)[] {
  let lastUnit: 'kg' | 'lb' = 'kg';
  const out: (WorkoutSet | null)[] = [];

  for (const line of lines) {
    const multiplier = parseSetMultiplier(line, lastUnit);
    if (multiplier) {
      for (const set of multiplier) {
        if (set.unit) lastUnit = set.unit;
        out.push(set);
      }
      continue;
    }
    const parsed = parseWorkoutSetLine(line, lastUnit);
    if (parsed?.unit) lastUnit = parsed.unit;
    out.push(parsed);
  }

  return out;
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

/** Same ceiling `parseSetMultiplier` uses: past this, a count is a hallucination. */
const MAX_AI_SETS = 20;

/**
 * Which sets win, the local parse or the model's.
 *
 * The local parser reads LINES: one set per line. A note written as one prose
 * sentence — "supino reto uma de 3 com 20kg outra de 5 com 50kg e mais uma serie
 * de 4 reps com 70kg" — gives it a single line, so it can only ever return the
 * first set and the rest of the sentence is invisible to it. The model reads
 * language, so on a one-line note where the parser got at most one set, a richer
 * read is the correct one.
 *
 * Everywhere else the local numbers stay law:
 * - a multi-line note is the outliner's own format, where the user typed each
 *   set by hand — the model must never rewrite those;
 * - a single line the parser already expanded into several sets ("3x10 80kg")
 *   was understood locally, so there is nothing to gain and a count to lose.
 */
export function chooseWorkoutSets(
  text: string,
  localSets: WorkoutSet[],
  aiSets: WorkoutSet[],
): WorkoutSet[] {
  const lines = text.split('\n').filter((line) => line.trim().length > 0);
  if (lines.length > 1) return localSets;
  if (localSets.length > 1) return localSets;
  if (aiSets.length > MAX_AI_SETS) return localSets;
  return aiSets.length > localSets.length ? aiSets : localSets;
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
        value: formatWorkoutLoad(totals.volumeKg),
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
