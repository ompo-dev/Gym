import type { Entry } from './types';

/** A resolved plan is not consumption until the user checks it off. */
export function isCompletedEntry(entry: Entry): boolean {
  return entry.status === 'done' && (!entry.planned || entry.completedAt != null);
}
