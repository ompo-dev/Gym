import type { Entry } from '@/core/types';
import type { MealType } from '@/domains/schemas';

/**
 * Learns WHEN the user actually eats each meal, from their notes, so reminders
 * fire at the right time instead of a fixed clock.
 *
 * The core problem: `createdAt` is when the note was TYPED, not when the food
 * was eaten — "almocei" logged at 9pm alongside dinner. The defence is the
 * MEDIAN, not a confidence filter: one 21:00 outlier cannot move the median of a
 * month of ~12:50 lunches. No scoring, no weights — the statistic is immune to
 * exactly the case that breaks a mean.
 *
 * Pure module (no native imports) so all of this is unit-testable.
 */

// ---- meal-type resolution: model → text → hour ------------------------------

// Patterns run on de-accented text: `\b` treats á/ç/ã as non-word chars without
// the `u` flag, so "manhã"/"pós" would never match at a boundary. Stripping the
// diacritics first (the same trick `normalizeForEnrich` uses) keeps `\b` honest.
const TEXT_PATTERNS: readonly (readonly [RegExp, MealType])[] = [
  [/\b(?:pre[\s-]?treino|pre[\s-]?workout|antes\s+do\s+treino)\b/, 'preWorkout'],
  [/\b(?:pos[\s-]?treino|post[\s-]?workout|depois\s+do\s+treino)\b/, 'postWorkout'],
  [/\b(?:cafe\s+da\s+manha|desjejum|breakfast)\b/, 'breakfast'],
  [/\b(?:almoc\w*|lunch)\b/, 'lunch'],
  [/\b(?:janta\w*|jantei|ceia|dinner|supper)\b/, 'dinner'],
  [/\b(?:lanche\s+da\s+tarde|afternoon\s+snack)\b/, 'afternoonSnack'],
  [/\b(?:lanche\s+da\s+manha|morning\s+snack)\b/, 'morningSnack'],
];

function deburr(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** The occasion named in the text, or null when the words give none. */
export function mealTypeFromText(text: string): MealType | null {
  const normalized = deburr(text);
  for (const [re, type] of TEXT_PATTERNS) if (re.test(normalized)) return type;
  return null;
}

/** Last-resort bucket from the clock. Only reached when the text is silent. */
export function mealTypeFromHour(epochMs: number): MealType {
  const d = new Date(epochMs);
  const h = d.getHours() + d.getMinutes() / 60;
  if (h < 5) return 'nightSnack';
  if (h < 10.5) return 'breakfast';
  if (h < 11.5) return 'morningSnack';
  if (h < 15) return 'lunch';
  if (h < 18) return 'afternoonSnack';
  if (h < 22) return 'dinner';
  return 'nightSnack';
}

/**
 * The occasion for a food entry: the model's `mealType` if it read one, else the
 * words, else the hour. Never null for food (the hour always answers); null for
 * non-food so callers can skip it.
 */
export function mealTypeOf(entry: Entry): MealType | null {
  if (entry.domain !== 'food') return null;
  const data = entry.data;
  const ai = data && 'items' in data ? data.mealType : undefined;
  if (ai) return ai;
  return mealTypeFromText(entry.text) ?? mealTypeFromHour(entry.createdAt);
}

// ---- timing math ------------------------------------------------------------

// Minutes are measured from 4am, not midnight, so a 1am night-snack sits at the
// tail of the previous evening instead of splitting the median around midnight.
const DAY_ANCHOR_MIN = 4 * 60;

export function anchoredMinutes(epochMs: number): number {
  const d = new Date(epochMs);
  const minsOfDay = d.getHours() * 60 + d.getMinutes();
  return (minsOfDay - DAY_ANCHOR_MIN + 1440) % 1440;
}

function anchoredToClock(anchored: number): { hour: number; minute: number } {
  const m = (anchored + DAY_ANCHOR_MIN) % 1440;
  return { hour: Math.floor(m / 60), minute: m % 60 };
}

export function median(values: number[]): number {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

// ---- routine ----------------------------------------------------------------

const BATCH_WINDOW_MS = 120_000;
/** Fewer than this many logged times for a meal → its median is noise; use the default. */
export const MIN_SAMPLES = 3;
/** How far back the learner looks. */
export const ROUTINE_DAYS = 30;

/**
 * Ids of entries typed together with a DIFFERENT meal type. Two occasions logged
 * within two minutes cannot both have just been eaten — at least one is
 * retroactive — so the timestamp lies about timing for the whole cluster; drop
 * it from the time samples (but never from what the user eats).
 */
function batchLoggedIds(entries: Entry[]): Set<string> {
  const sorted = [...entries].sort((a, b) => a.createdAt - b.createdAt);
  const bad = new Set<string>();
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    const types = new Set<MealType>();
    while (j < sorted.length && sorted[j].createdAt - sorted[i].createdAt <= BATCH_WINDOW_MS) {
      const type = mealTypeOf(sorted[j]);
      if (type) types.add(type);
      j += 1;
    }
    if (types.size >= 2) for (let k = i; k < j; k += 1) bad.add(sorted[k].id);
    i = j > i ? j : i + 1;
  }
  return bad;
}

export interface RoutineSlot {
  hour: number;
  minute: number;
  samples: number;
}
export type Routine = Partial<Record<MealType, RoutineSlot>>;

/** Per meal type, the median time it is eaten — learned from a window of notes. */
export function buildRoutine(entries: Entry[]): Routine {
  const batch = batchLoggedIds(entries);
  const byType = new Map<MealType, number[]>();
  for (const entry of entries) {
    if (entry.domain !== 'food' || batch.has(entry.id)) continue;
    const type = mealTypeOf(entry);
    if (!type) continue;
    const arr = byType.get(type) ?? [];
    arr.push(anchoredMinutes(entry.createdAt));
    byType.set(type, arr);
  }
  const routine: Routine = {};
  for (const [type, mins] of byType) {
    if (mins.length < MIN_SAMPLES) continue;
    const { hour, minute } = anchoredToClock(median(mins));
    routine[type] = { hour, minute, samples: mins.length };
  }
  return routine;
}

// ---- the scheduled slots ----------------------------------------------------

interface SlotDef {
  type: MealType;
  defaultHour: number;
  defaultMinute: number;
}

// Three notifications a day — morning, midday, evening. Snacks and pre/post
// workout inform the routine but never get their own alert (6 pings a day is an
// uninstall). Defaults match the user's stated 10h / 13h / 20h.
export const SCHEDULED_SLOTS: readonly SlotDef[] = [
  { type: 'breakfast', defaultHour: 10, defaultMinute: 0 },
  { type: 'lunch', defaultHour: 13, defaultMinute: 0 },
  { type: 'dinner', defaultHour: 20, defaultMinute: 0 },
];

export interface ScheduledSlot {
  type: MealType;
  hour: number;
  minute: number;
  /** true when the time came from the user's history, false when it is the default. */
  learned: boolean;
}

/** The three reminder times: learned when there is enough history, else default. */
export function slotTimes(routine: Routine): ScheduledSlot[] {
  return SCHEDULED_SLOTS.map((slot) => {
    const learned = routine[slot.type];
    return learned
      ? { type: slot.type, hour: learned.hour, minute: learned.minute, learned: true }
      : { type: slot.type, hour: slot.defaultHour, minute: slot.defaultMinute, learned: false };
  });
}
