import { newId } from '@/core/utils';

import { getDb } from './db';

export type SavedWorkoutKind = 'exercise' | 'day';

export interface SavedWorkout {
  id: string;
  kind: SavedWorkoutKind;
  name: string;
  exercises: string[];
  sourceEntryId?: string;
  sourceDate?: string;
  createdAt: number;
}

interface Row {
  id: string;
  kind: string;
  name: string;
  exercises: string;
  sourceEntryId: string | null;
  sourceDate: string | null;
  createdAt: number;
}

function cleanExercises(exercises: string[]): string[] {
  const seen = new Set<string>();
  return exercises.flatMap((exercise) => {
    const name = exercise.trim();
    const key = name.toLocaleLowerCase();
    if (!name || seen.has(key)) return [];
    seen.add(key);
    return [name];
  });
}

function toSavedWorkout(row: Row): SavedWorkout | null {
  if (row.kind !== 'exercise' && row.kind !== 'day') return null;
  try {
    const exercises = cleanExercises(JSON.parse(row.exercises) as string[]);
    if (!exercises.length) return null;
    return {
      id: row.id,
      kind: row.kind,
      name: row.name,
      exercises,
      sourceEntryId: row.sourceEntryId ?? undefined,
      sourceDate: row.sourceDate ?? undefined,
      createdAt: row.createdAt,
    };
  } catch {
    return null;
  }
}

export const SavedWorkoutRepository = {
  async save(
    kind: SavedWorkoutKind,
    name: string,
    exercises: string[],
    sourceEntryId?: string,
    sourceDate?: string,
  ): Promise<SavedWorkout | null> {
    const cleaned = cleanExercises(exercises);
    if (!cleaned.length) return null;

    const db = await getDb();
    const existing = sourceEntryId
      ? await db.getFirstAsync<Row>(
          'SELECT * FROM saved_workouts WHERE sourceEntryId = ? LIMIT 1',
          [sourceEntryId],
        )
      : sourceDate
        ? await db.getFirstAsync<Row>(
            "SELECT * FROM saved_workouts WHERE kind = 'day' AND sourceDate = ? LIMIT 1",
            [sourceDate],
          )
        : null;
    if (existing) return toSavedWorkout(existing);

    const workout: SavedWorkout = {
      id: newId(),
      kind,
      name: name.trim() || cleaned[0],
      exercises: cleaned,
      sourceEntryId,
      sourceDate,
      createdAt: Date.now(),
    };
    await db.runAsync(
      'INSERT INTO saved_workouts (id, kind, name, exercises, sourceEntryId, sourceDate, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        workout.id,
        workout.kind,
        workout.name,
        JSON.stringify(workout.exercises),
        workout.sourceEntryId ?? null,
        workout.sourceDate ?? null,
        workout.createdAt,
      ],
    );
    return workout;
  },

  async all(): Promise<SavedWorkout[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<Row>(
      'SELECT * FROM saved_workouts ORDER BY createdAt DESC',
    );
    return rows.map(toSavedWorkout).filter((workout): workout is SavedWorkout => workout !== null);
  },

  async count(): Promise<number> {
    const db = await getDb();
    const row = await db.getFirstAsync<{ total: number }>(
      'SELECT COUNT(*) as total FROM saved_workouts',
    );
    return row?.total ?? 0;
  },

  async delete(id: string): Promise<void> {
    const db = await getDb();
    await db.runAsync('DELETE FROM saved_workouts WHERE id = ?', [id]);
  },

  async deleteBySourceEntryId(sourceEntryId: string): Promise<void> {
    const db = await getDb();
    await db.runAsync('DELETE FROM saved_workouts WHERE sourceEntryId = ?', [sourceEntryId]);
  },
};
