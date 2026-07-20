import type { Domain } from '@/core/types';
import { newId } from '@/core/utils';
import { routineItemsSchemaByDomain, type RoutineFoodItem } from '@/domains/schemas';

import { getDb } from './db';

/** 0 = Sunday, matching `Date.getDay()`. `null` means "not tied to a weekday". */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface SavedRoutine {
  id: string;
  domain: Domain;
  name: string;
  weekday: Weekday | null;
  /** Exercise names for workout; full meals for food. */
  items: string[] | RoutineFoodItem[];
  sourceDate?: string;
  createdAt: number;
}

export interface SavedWorkoutRoutine extends SavedRoutine {
  domain: 'workout';
  items: string[];
}

export interface SavedFoodRoutine extends SavedRoutine {
  domain: 'food';
  items: RoutineFoodItem[];
}

interface Row {
  id: string;
  domain: string;
  name: string;
  weekday: number | null;
  items: string;
  sourceDate: string | null;
  createdAt: number;
}

function isDomain(value: string): value is Domain {
  return value === 'food' || value === 'workout';
}

function toWeekday(value: number | null): Weekday | null {
  if (value === null) return null;
  return Number.isInteger(value) && value >= 0 && value <= 6 ? (value as Weekday) : null;
}

/** Rows that no longer validate are dropped rather than crashing the list. */
function toRoutine(row: Row): SavedRoutine | null {
  if (!isDomain(row.domain)) return null;
  try {
    const parsed = routineItemsSchemaByDomain[row.domain].safeParse(JSON.parse(row.items));
    if (!parsed.success) return null;
    const items = parsed.data as string[] | RoutineFoodItem[];
    if (!items.length) return null;
    return {
      id: row.id,
      domain: row.domain,
      name: row.name,
      weekday: toWeekday(row.weekday),
      items,
      sourceDate: row.sourceDate ?? undefined,
      createdAt: row.createdAt,
    };
  } catch {
    return null;
  }
}

export const SavedRoutineRepository = {
  /**
   * Always inserts. Unlike saved exercises there is no dedupe by source day —
   * saving the same day twice under two names is a legitimate thing to want.
   */
  async save(
    domain: Domain,
    name: string,
    items: string[] | RoutineFoodItem[],
    weekday: Weekday | null,
    sourceDate?: string,
  ): Promise<SavedRoutine | null> {
    const parsed = routineItemsSchemaByDomain[domain].safeParse(items);
    if (!parsed.success) return null;
    const clean = parsed.data as string[] | RoutineFoodItem[];
    if (!clean.length) return null;

    const routine: SavedRoutine = {
      id: newId(),
      domain,
      name: name.trim() || defaultRoutineName(domain, clean),
      weekday,
      items: clean,
      sourceDate,
      createdAt: Date.now(),
    };
    const db = await getDb();
    await db.runAsync(
      `INSERT INTO saved_routines (id, domain, name, weekday, items, sourceDate, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        routine.id,
        routine.domain,
        routine.name,
        routine.weekday,
        JSON.stringify(routine.items),
        routine.sourceDate ?? null,
        routine.createdAt,
      ],
    );
    return routine;
  },

  async byDomain(domain: Domain): Promise<SavedRoutine[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<Row>(
      'SELECT * FROM saved_routines WHERE domain = ? ORDER BY weekday IS NULL, weekday ASC, createdAt DESC',
      [domain],
    );
    return rows.map(toRoutine).filter((routine): routine is SavedRoutine => routine !== null);
  },

  async count(domain: Domain): Promise<number> {
    const db = await getDb();
    const row = await db.getFirstAsync<{ total: number }>(
      'SELECT COUNT(*) as total FROM saved_routines WHERE domain = ?',
      [domain],
    );
    return row?.total ?? 0;
  },

  async delete(id: string): Promise<void> {
    const db = await getDb();
    await db.runAsync('DELETE FROM saved_routines WHERE id = ?', [id]);
  },
};

/** Falls back to the first item so a routine is never nameless in a list. */
export function defaultRoutineName(
  domain: Domain,
  items: string[] | RoutineFoodItem[],
): string {
  const first = items[0];
  if (typeof first === 'string') return first;
  return first?.text?.trim() || (domain === 'food' ? 'Dieta' : 'Treino');
}
