/**
 * Pure reminder-preference helpers. No native imports live here on purpose, so
 * the parsing and the lapse decision stay unit-testable without pulling
 * expo-notifications into the jest environment.
 */

export interface ReminderPrefs {
  enabled: boolean;
  /** 0-23, local time. */
  hour: number;
  /** 0-59. */
  minute: number;
}

export const DEFAULT_REMINDER_HOUR = 20;
export const DEFAULT_REMINDER_MINUTE = 0;
/** No food/workout note for this many days → the lapsed nudge may fire. */
export const LAPSE_DAYS = 2;

function parseClock(raw: string | null, min: number, max: number, fallback: number): number {
  // Guard null/empty explicitly: Number(null) and Number('') are both 0, which
  // is a valid clock value — an unset hour would silently become midnight.
  if (raw === null || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  const rounded = Math.round(value);
  return rounded < min || rounded > max ? fallback : rounded;
}

/** Build prefs from the raw stored strings, clamping to valid clock ranges. */
export function normalizeReminderPrefs(
  enabled: string | null,
  hour: string | null,
  minute: string | null,
): ReminderPrefs {
  return {
    enabled: enabled === '1',
    hour: parseClock(hour, 0, 23, DEFAULT_REMINDER_HOUR),
    minute: parseClock(minute, 0, 59, DEFAULT_REMINDER_MINUTE),
  };
}

/** HH:MM for display, zero-padded. */
export function formatReminderTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * Whole days from `a` to `b`, both local YYYY-MM-DD. Parsed at UTC noon so a DST
 * shift never rounds the difference to the wrong integer — only the day count
 * matters here.
 */
function daysBetween(a: string, b: string): number {
  const da = Date.parse(`${a}T12:00:00Z`);
  const db = Date.parse(`${b}T12:00:00Z`);
  if (Number.isNaN(da) || Number.isNaN(db)) return 0;
  return Math.round((db - da) / 86_400_000);
}

/**
 * Should the lapsed-user nudge fire? True when the user has never logged, or
 * their last food/workout note is at least `lapseDays` days before today. A
 * same-day or yesterday log stays quiet — nudging then is the daily reminder's
 * job, not this one's.
 */
export function shouldNudgeLapsed(
  lastLoggedDate: string | null,
  today: string,
  lapseDays: number = LAPSE_DAYS,
): boolean {
  if (!lastLoggedDate) return true;
  return daysBetween(lastLoggedDate, today) >= lapseDays;
}
