export const NOTE_MAX_CHARS = 150;
export const MAX_NOTES_PER_DAY = 30; // food + workout combined, per day
export const MAX_PHOTOS_PER_NOTE = 8;
export const MAX_PHOTOS_PER_DAY = 30; // food photos, per day

/** Live count — deletes free slots; a sanity guardrail, not hard security. */
// ponytail: deletes free slots; this is a sanity guardrail, not hard security.
export function notesForDate(
  days: readonly { date: string; entries: readonly unknown[] }[],
  date: string,
): number {
  let count = 0;
  for (const day of days) {
    if (day.date === date) count += day.entries.length;
  }
  return count;
}

/** Live count of food photos across persisted + draft entries for a date. */
export function photosForDate(
  days: readonly {
    date: string;
    entries: readonly { media?: readonly { kind: string }[] }[];
  }[],
  date: string,
): number {
  let count = 0;
  for (const day of days) {
    if (day.date !== date) continue;
    for (const entry of day.entries) {
      if (!entry.media) continue;
      for (const m of entry.media) {
        if (m.kind !== "barcode") count++;
      }
    }
  }
  return count;
}
