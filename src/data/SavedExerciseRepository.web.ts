import { newId } from "@/core/utils";

import { readJson, writeJson } from "./webStorage";

const TABLE = "saved_workouts";

/**
 * `day` is legacy: whole-day saving moved to `saved_routines`, and nothing
 * writes this kind any more.
 */
export type SavedExerciseKind = "exercise" | "day";

export interface SavedExercise {
  id: string;
  kind: SavedExerciseKind;
  name: string;
  exercises: string[];
  sourceEntryId?: string;
  sourceDate?: string;
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

function normalizeWorkout(workout: SavedExercise): SavedExercise | null {
  if (workout.kind !== "exercise" && workout.kind !== "day") return null;
  const exercises = cleanExercises(workout.exercises);
  if (!exercises.length) return null;
  return { ...workout, exercises };
}

function readWorkouts(): SavedExercise[] {
  const raw = readJson<SavedExercise[]>(TABLE, []);
  if (!Array.isArray(raw)) return [];
  return raw
    .map(normalizeWorkout)
    .filter((workout): workout is SavedExercise => workout !== null);
}

function writeWorkouts(workouts: SavedExercise[]): void {
  writeJson(TABLE, workouts);
}

export const SavedExerciseRepository = {
  async save(
    kind: SavedExerciseKind,
    name: string,
    exercises: string[],
    sourceEntryId?: string,
    sourceDate?: string,
  ): Promise<SavedExercise | null> {
    const cleaned = cleanExercises(exercises);
    if (!cleaned.length) return null;

    const existing = sourceEntryId
      ? readWorkouts().find((workout) => workout.sourceEntryId === sourceEntryId)
      : sourceDate
        ? readWorkouts().find(
            (workout) => workout.kind === "day" && workout.sourceDate === sourceDate,
          )
        : null;
    if (existing) return existing;

    const workout: SavedExercise = {
      id: newId(),
      kind,
      name: name.trim() || cleaned[0],
      exercises: cleaned,
      sourceEntryId,
      sourceDate,
      createdAt: Date.now(),
    };
    writeWorkouts([workout, ...readWorkouts()]);
    return workout;
  },

  async all(): Promise<SavedExercise[]> {
    return readWorkouts().sort((a, b) => b.createdAt - a.createdAt);
  },

  async count(): Promise<number> {
    return readWorkouts().length;
  },

  async delete(id: string): Promise<void> {
    writeWorkouts(readWorkouts().filter((workout) => workout.id !== id));
  },

  async deleteBySourceEntryId(sourceEntryId: string): Promise<void> {
    writeWorkouts(
      readWorkouts().filter((workout) => workout.sourceEntryId !== sourceEntryId),
    );
  },
};
