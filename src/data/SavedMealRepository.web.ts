import type { EntryMediaAttachment } from "@/core/types";
import { newId } from "@/core/utils";
import type { FoodData } from "@/domains/schemas";

import { readJson, writeJson } from "./webStorage";

const TABLE = "saved_meals";

export interface SavedMeal {
  id: string;
  name: string;
  data: FoodData;
  media?: EntryMediaAttachment[];
  sourceEntryId?: string;
  createdAt: number;
}

function readMeals(): SavedMeal[] {
  const raw = readJson<SavedMeal[]>(TABLE, []);
  return Array.isArray(raw) ? raw : [];
}

function writeMeals(meals: SavedMeal[]): void {
  writeJson(TABLE, meals);
}

function mediaKey(media?: EntryMediaAttachment[]): string {
  return media?.length ? JSON.stringify(media) : "";
}

function mealKey(name: string, data: FoodData, media?: EntryMediaAttachment[]): string {
  return `${name}\n${JSON.stringify(data)}\n${mediaKey(media)}`;
}

async function findMatchingMeal(
  name: string,
  data: FoodData,
  media?: EntryMediaAttachment[],
): Promise<SavedMeal | null> {
  const key = mealKey(name, data, media);
  return (
    readMeals()
      .filter((meal) => mealKey(meal.name, meal.data, meal.media) === key)
      .sort((a, b) => b.createdAt - a.createdAt)[0] ?? null
  );
}

async function attachSourceEntryId(
  meal: SavedMeal,
  sourceEntryId: string,
): Promise<SavedMeal> {
  if (meal.sourceEntryId) return meal;
  const next = { ...meal, sourceEntryId };
  writeMeals(readMeals().map((item) => (item.id === meal.id ? next : item)));
  return next;
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
    writeMeals([meal, ...readMeals()]);
    return meal;
  },

  async all(): Promise<SavedMeal[]> {
    return readMeals().sort((a, b) => b.createdAt - a.createdAt);
  },

  async findBySourceEntryId(sourceEntryId: string): Promise<SavedMeal | null> {
    return readMeals().find((meal) => meal.sourceEntryId === sourceEntryId) ?? null;
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
    const current = readMeals().find((meal) => meal.id === id);
    const meal: SavedMeal = {
      id,
      name,
      data,
      media,
      sourceEntryId: current?.sourceEntryId,
      createdAt: current?.createdAt ?? Date.now(),
    };
    writeMeals(readMeals().map((item) => (item.id === id ? meal : item)));
    return meal;
  },

  async delete(id: string): Promise<void> {
    writeMeals(readMeals().filter((meal) => meal.id !== id));
  },

  async count(): Promise<number> {
    return readMeals().length;
  },
};
