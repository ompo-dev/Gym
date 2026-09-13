import type { Domain } from "@/core/types";
import { newId } from "@/core/utils";
import {
  routineItemsSchemaByDomain,
  type RoutineFoodItem,
} from "@/domains/schemas";

import { readJson, writeJson } from "./webStorage";

const TABLE = "saved_routines";

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
  domain: "workout";
  items: string[];
}

export interface SavedFoodRoutine extends SavedRoutine {
  domain: "food";
  items: RoutineFoodItem[];
}

function toWeekday(value: unknown): Weekday | null {
  if (value === null || value === undefined) return null;
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 6
    ? (value as Weekday)
    : null;
}

function isDomain(value: unknown): value is Domain {
  return value === "food" || value === "workout" || value === "onboarding";
}

function normalizeRoutine(routine: SavedRoutine): SavedRoutine | null {
  if (!isDomain(routine.domain)) return null;
  const parsed = routineItemsSchemaByDomain[routine.domain].safeParse(routine.items);
  if (!parsed.success || !parsed.data.length) return null;
  return {
    ...routine,
    weekday: toWeekday(routine.weekday),
    items: parsed.data as string[] | RoutineFoodItem[],
  };
}

function readRoutines(): SavedRoutine[] {
  const raw = readJson<SavedRoutine[]>(TABLE, []);
  if (!Array.isArray(raw)) return [];
  return raw
    .map(normalizeRoutine)
    .filter((routine): routine is SavedRoutine => routine !== null);
}

function writeRoutines(routines: SavedRoutine[]): void {
  writeJson(TABLE, routines);
}

export const SavedRoutineRepository = {
  async save(
    domain: Domain,
    name: string,
    items: string[] | RoutineFoodItem[],
    weekday: Weekday | null,
    sourceDate?: string,
  ): Promise<SavedRoutine | null> {
    const parsed = routineItemsSchemaByDomain[domain].safeParse(items);
    if (!parsed.success || !parsed.data.length) return null;
    const clean = parsed.data as string[] | RoutineFoodItem[];

    const routine: SavedRoutine = {
      id: newId(),
      domain,
      name: name.trim() || defaultRoutineName(domain, clean),
      weekday,
      items: clean,
      sourceDate,
      createdAt: Date.now(),
    };
    writeRoutines([routine, ...readRoutines()]);
    return routine;
  },

  async byDomain(domain: Domain): Promise<SavedRoutine[]> {
    return readRoutines()
      .filter((routine) => routine.domain === domain)
      .sort(
        (a, b) =>
          Number(a.weekday === null) - Number(b.weekday === null) ||
          (a.weekday ?? 0) - (b.weekday ?? 0) ||
          b.createdAt - a.createdAt,
      );
  },

  async count(domain: Domain): Promise<number> {
    return readRoutines().filter((routine) => routine.domain === domain).length;
  },

  async delete(id: string): Promise<void> {
    writeRoutines(readRoutines().filter((routine) => routine.id !== id));
  },
};

/** Falls back to the first item so a routine is never nameless in a list. */
export function defaultRoutineName(
  domain: Domain,
  items: string[] | RoutineFoodItem[],
): string {
  const first = items[0];
  if (typeof first === "string") return first;
  return first?.text?.trim() || (domain === "food" ? "Dieta" : "Treino");
}
