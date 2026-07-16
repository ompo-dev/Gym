import { newId } from '@/core/utils';
import type { FoodData } from '@/domains/schemas';

import { getDb } from './db';

export interface SavedMeal {
  id: string;
  name: string;
  data: FoodData;
  createdAt: number;
}

interface Row {
  id: string;
  name: string;
  data: string;
  createdAt: number;
}

function toSavedMeal(row: Row): SavedMeal | null {
  try {
    return {
      id: row.id,
      name: row.name,
      data: JSON.parse(row.data) as FoodData,
      createdAt: row.createdAt,
    };
  } catch {
    return null;
  }
}

export const SavedMealRepository = {
  async save(name: string, data: FoodData): Promise<SavedMeal> {
    const meal = {
      id: newId(),
      name,
      data,
      createdAt: Date.now(),
    };
    const db = await getDb();
    await db.runAsync(
      'INSERT INTO saved_meals (id, name, data, createdAt) VALUES (?, ?, ?, ?)',
      [meal.id, meal.name, JSON.stringify(meal.data), meal.createdAt],
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

  async count(): Promise<number> {
    const db = await getDb();
    const row = await db.getFirstAsync<{ total: number }>(
      'SELECT COUNT(*) as total FROM saved_meals',
    );
    return row?.total ?? 0;
  },
};
