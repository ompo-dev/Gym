import type { EntryMediaAttachment } from '@/core/types';
import { newId } from '@/core/utils';
import type { FoodData } from '@/domains/schemas';

import { getDb } from './db';

export interface SavedMeal {
  id: string;
  name: string;
  data: FoodData;
  media?: EntryMediaAttachment[];
  sourceEntryId?: string;
  createdAt: number;
}

interface Row {
  id: string;
  name: string;
  data: string;
  media: string | null;
  sourceEntryId: string | null;
  createdAt: number;
}

function parseMedia(raw: string | null): EntryMediaAttachment[] | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as EntryMediaAttachment[];
    return Array.isArray(parsed) && parsed.length ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function stringifyMedia(media?: EntryMediaAttachment[]): string | null {
  return media?.length ? JSON.stringify(media) : null;
}

function toSavedMeal(row: Row): SavedMeal | null {
  try {
    return {
      id: row.id,
      name: row.name,
      data: JSON.parse(row.data) as FoodData,
      media: parseMedia(row.media),
      sourceEntryId: row.sourceEntryId ?? undefined,
      createdAt: row.createdAt,
    };
  } catch {
    return null;
  }
}

async function findMatchingMeal(
  name: string,
  data: FoodData,
  media?: EntryMediaAttachment[],
): Promise<SavedMeal | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<Row>(
    `
      SELECT * FROM saved_meals
      WHERE name = ?
        AND data = ?
        AND COALESCE(media, '') = ?
      ORDER BY createdAt DESC
      LIMIT 1
    `,
    [name, JSON.stringify(data), stringifyMedia(media) ?? ''],
  );
  return row ? toSavedMeal(row) : null;
}

async function attachSourceEntryId(meal: SavedMeal, sourceEntryId: string): Promise<SavedMeal> {
  if (meal.sourceEntryId) return meal;
  const db = await getDb();
  await db.runAsync(
    'UPDATE saved_meals SET sourceEntryId = ? WHERE id = ? AND sourceEntryId IS NULL',
    [sourceEntryId, meal.id],
  );
  return { ...meal, sourceEntryId };
}

export const SavedMealRepository = {
  async save(
    name: string,
    data: FoodData,
    media?: EntryMediaAttachment[],
    sourceEntryId?: string,
  ): Promise<SavedMeal> {
    if (sourceEntryId) {
      const existing = await this.findByEntry(sourceEntryId, name, data, media);
      if (existing) return existing;
    }
    const meal = {
      id: newId(),
      name,
      data,
      media,
      sourceEntryId,
      createdAt: Date.now(),
    };
    const db = await getDb();
    await db.runAsync(
      'INSERT INTO saved_meals (id, name, data, media, sourceEntryId, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
      [
        meal.id,
        meal.name,
        JSON.stringify(meal.data),
        stringifyMedia(meal.media),
        meal.sourceEntryId ?? null,
        meal.createdAt,
      ],
    );
    return meal;
  },

  async all(): Promise<SavedMeal[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<Row>(
      'SELECT * FROM saved_meals ORDER BY createdAt DESC',
    );
    return rows.map(toSavedMeal).filter((meal): meal is SavedMeal => meal !== null);
  },

  async findBySourceEntryId(sourceEntryId: string): Promise<SavedMeal | null> {
    const db = await getDb();
    const row = await db.getFirstAsync<Row>(
      'SELECT * FROM saved_meals WHERE sourceEntryId = ? LIMIT 1',
      [sourceEntryId],
    );
    return row ? toSavedMeal(row) : null;
  },

  async findByEntry(
    sourceEntryId: string,
    name: string,
    data: FoodData,
    media?: EntryMediaAttachment[],
  ): Promise<SavedMeal | null> {
    const existing = await this.findBySourceEntryId(sourceEntryId);
    if (existing) return existing;
    const matching = await findMatchingMeal(name, data, media);
    return matching ? attachSourceEntryId(matching, sourceEntryId) : null;
  },

  async update(
    id: string,
    name: string,
    data: FoodData,
    media?: EntryMediaAttachment[],
  ): Promise<SavedMeal> {
    const db = await getDb();
    const current = await db.getFirstAsync<{ createdAt: number; sourceEntryId: string | null }>(
      'SELECT createdAt, sourceEntryId FROM saved_meals WHERE id = ?',
      [id],
    );
    await db.runAsync(
      'UPDATE saved_meals SET name = ?, data = ?, media = ? WHERE id = ?',
      [name, JSON.stringify(data), stringifyMedia(media), id],
    );
    return {
      id,
      name,
      data,
      media,
      sourceEntryId: current?.sourceEntryId ?? undefined,
      createdAt: current?.createdAt ?? Date.now(),
    };
  },

  async delete(id: string): Promise<void> {
    const db = await getDb();
    await db.runAsync('DELETE FROM saved_meals WHERE id = ?', [id]);
  },

  async count(): Promise<number> {
    const db = await getDb();
    const row = await db.getFirstAsync<{ total: number }>(
      'SELECT COUNT(*) as total FROM saved_meals',
    );
    return row?.total ?? 0;
  },
};
