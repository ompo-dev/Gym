import { z } from 'zod';

import { CompositeCommand, type Command } from '@/core/command/Command';
import type { CommandBus } from '@/core/command/CommandBus';
import type { Domain, Entry } from '@/core/types';
import type { SavedMeal } from '@/data/SavedMealRepository';
import { foodConfig, sumFoodData } from '@/domains/food';
import { pantryItems } from '@/domains/pantry';
import type { FoodData, WorkoutData } from '@/domains/schemas';
import { workoutConfig } from '@/domains/workout';
import { sessionsByExercise } from '@/domains/workoutProgress';

/**
 * What the model is allowed to do, as data.
 *
 * The commands already existed; what was missing was a way to *address* them.
 * Each tool carries a zod schema that pays twice — it describes the tool to the
 * model and validates whatever comes back.
 */

const MAX_BATCH = 31; // a month of plan is the ceiling; a week is 7
const MAX_HISTORY_SESSIONS = 20;
const DEFAULT_HISTORY_SESSIONS = 5;
const MAX_SAVED_MEALS = 50;
const DEFAULT_SAVED_MEALS = 20;
const MAX_PANTRY_ITEMS = 100;

/**
 * Everything a tool may touch, injected. No `@/data/*` imports here: the
 * registry has to load under jest, where expo-sqlite does not exist. Same
 * reason `CommandBus` takes `BusDeps`.
 */
export interface ToolDeps {
  bus: CommandBus;
  entries: {
    findByDate: (domain: Domain, date: string) => Promise<Entry[]>;
    findAll: (domain: Domain) => Promise<Entry[]>;
  };
  savedMeals: { all: () => Promise<SavedMeal[]> };
  today: () => string;
}

/** Stable keys, in the spirit of `ENRICH_ERROR`. */
export const TOOL_ERROR = {
  unknown: 'tool.unknown',
  args: 'tool.args',
} as const;

export type ToolResult =
  | { ok: true; kind: 'command'; command: Command }
  | { ok: true; kind: 'data'; data: unknown }
  | { ok: false; error: string; detail?: string };

interface Tool {
  readonly description: string;
  readonly args: z.ZodType;
  readonly invoke: (raw: unknown, deps: ToolDeps) => Promise<ToolResult>;
}

/**
 * The one place a tool's argument type is known — and the only place it needs
 * to be. `S` stays trapped in this call, so `build` sees args already parsed
 * and typed; outside, every tool has the same erased shape, which is what a
 * dispatch over `unknown` can honestly promise.
 */
function defineTool<S extends z.ZodType>(spec: {
  description: string;
  args: S;
  build: (args: z.output<S>, deps: ToolDeps) => ToolResult | Promise<ToolResult>;
}): Tool {
  return {
    description: spec.description,
    args: spec.args,
    invoke: async (raw, deps) => {
      const parsed = spec.args.safeParse(raw);
      if (!parsed.success) {
        return { ok: false, error: TOOL_ERROR.args, detail: parsed.error.message };
      }
      return spec.build(parsed.data, deps);
    },
  };
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
// `onboarding` is left out on purpose: the model never writes a profile note.
const writableDomain = z.enum(['food', 'workout']);

export const toolRegistry = {
  addEntries: defineTool({
    description:
      'Write one or more notes. Same engine as a note typed by hand: each one is parsed and enriched. Omit `date` to write on the day the user is looking at. All entries in one call undo together.',
    args: z.object({
      entries: z
        .array(
          z.object({
            text: z.string().min(1).max(500),
            domain: writableDomain,
            date: isoDate.optional(),
          }),
        )
        .min(1)
        .max(MAX_BATCH),
      label: z.string().min(1).max(60).optional(),
    }),
    build: (args, deps) => {
      const commands = args.entries.flatMap((item) => {
        const cmd = deps.bus.createAddEntry(item.text, item.domain, undefined, item.date);
        return cmd ? [cmd] : [];
      });
      if (!commands.length) {
        return { ok: false, error: TOOL_ERROR.args, detail: 'every entry text was blank' };
      }
      return {
        ok: true,
        kind: 'command',
        command: new CompositeCommand(args.label ?? `${commands.length} entries`, commands),
      };
    },
  }),

  readDay: defineTool({
    description:
      'Read what the user logged on one day: the notes and the day totals. Use it to compare against a previous day.',
    args: z.object({ domain: writableDomain, date: isoDate.optional() }),
    build: async (args, deps) => {
      const date = args.date ?? deps.today();
      const entries = await deps.entries.findByDate(args.domain, date);
      return {
        ok: true,
        kind: 'data',
        data: args.domain === 'food' ? foodDay(date, entries) : workoutDay(date, entries),
      };
    },
  }),

  readExerciseHistory: defineTool({
    description:
      'Past sessions for one exercise, newest first, with sets/volume/duration/distance. Use it before prescribing load.',
    args: z.object({
      exercise: z.string().min(1).max(80),
      limit: z.number().int().min(1).max(MAX_HISTORY_SESSIONS).optional(),
    }),
    build: async (args, deps) => {
      const all = await deps.entries.findAll('workout');
      const byExercise = sessionsByExercise(all);
      const key = args.exercise.toLocaleLowerCase();
      // ponytail: substring both ways ("supino" finds "supino reto"). Known
      // ceiling: no fuzzy matching, no accent folding. Swap for a real matcher
      // once the history is big enough to produce false positives.
      const days =
        byExercise.get(key) ??
        [...byExercise.entries()].find(([k]) => k.includes(key) || key.includes(k))?.[1];
      if (!days) return { ok: true, kind: 'data', data: { exercise: args.exercise, sessions: [] } };

      const sessions = [...days.entries()]
        .sort(([a], [b]) => b.localeCompare(a))
        .slice(0, args.limit ?? DEFAULT_HISTORY_SESSIONS)
        .map(([date, session]) => ({ date, ...session.totals }));
      return {
        ok: true,
        kind: 'data',
        data: { exercise: [...days.values()][0]?.name ?? args.exercise, sessions },
      };
    },
  }),

  readSavedMeals: defineTool({
    // NOT the pantry. These are meals the user saved to repeat — no stock, no
    // quantity, no price. The pantry is `readPantry`.
    description: 'Meals the user saved and can repeat, with their nutrition.',
    args: z.object({ limit: z.number().int().min(1).max(MAX_SAVED_MEALS).optional() }),
    build: async (args, deps) => {
      const meals = await deps.savedMeals.all(); // already ORDER BY createdAt DESC
      return {
        ok: true,
        kind: 'data',
        data: meals.slice(0, args.limit ?? DEFAULT_SAVED_MEALS).map((meal) => ({
          id: meal.id,
          name: meal.name,
          items: meal.data.items.map((item) => item.label),
          totals: sumFoodData(meal.data),
        })),
      };
    },
  }),

  readPantry: defineTool({
    description:
      'What the user has bought, newest first, with the last price paid and the price per kilo when it is known. Use it to build a recipe from what is already at home.',
    args: z.object({ limit: z.number().int().min(1).max(MAX_PANTRY_ITEMS).optional() }),
    build: async (args, deps) => {
      const items = pantryItems(await deps.entries.findAll('food'));
      return {
        ok: true,
        kind: 'data',
        data: items.slice(0, args.limit ?? MAX_PANTRY_ITEMS).map((item) => ({
          label: item.label,
          boughtTimes: item.history.length,
          lastPrice: item.lastPrice,
          pricePerKg: item.lastPricePerKg,
        })),
      };
    },
  }),
} satisfies Record<string, Tool>;

function isFoodEntry(entry: Entry): entry is Entry & { data: FoodData } {
  return entry.status === 'done' && !!entry.data && 'items' in entry.data;
}

function isWorkoutEntry(entry: Entry): entry is Entry & { data: WorkoutData } {
  return entry.status === 'done' && !!entry.data && 'sets' in entry.data;
}

function foodDay(date: string, entries: Entry[]) {
  const done = entries.filter(isFoodEntry);
  return {
    date,
    domain: 'food' as const,
    entries: done.map((entry) => ({
      id: entry.id,
      text: entry.text,
      items: entry.data.items.map((item) => item.label),
      totals: sumFoodData(entry.data),
    })),
    totals: done.reduce((acc, e) => foodConfig.addToTotals(acc, e.data), foodConfig.emptyTotals),
  };
}

function workoutDay(date: string, entries: Entry[]) {
  const done = entries.filter(isWorkoutEntry);
  return {
    date,
    domain: 'workout' as const,
    entries: done.map((entry) => ({
      id: entry.id,
      text: entry.text,
      exercise: entry.data.exercise,
      kind: entry.data.kind,
      sets: entry.data.sets,
    })),
    totals: done.reduce(
      (acc, e) => workoutConfig.addToTotals(acc, e.data),
      workoutConfig.emptyTotals,
    ),
  };
}

export type ToolName = keyof typeof toolRegistry;

const TOOL_NAMES = Object.keys(toolRegistry) as ToolName[];

export function isToolName(value: string): value is ToolName {
  return TOOL_NAMES.includes(value as ToolName);
}

export async function invokeTool(name: string, raw: unknown, deps: ToolDeps): Promise<ToolResult> {
  if (!isToolName(name)) return { ok: false, error: TOOL_ERROR.unknown, detail: name };
  return toolRegistry[name].invoke(raw, deps);
}

export interface ToolDescription {
  name: ToolName;
  description: string;
  /** JSON Schema draft-07. */
  parameters: Record<string, unknown>;
}

/**
 * The same schema that validates the answer describes the question. Derived,
 * not hand-written — that is what keeps the description and the validation from
 * drifting apart.
 *
 * Built here rather than inside `defineTool` because `toJSONSchema` can throw
 * on unrepresentable types; at module init that takes the app down, in an
 * explicit call it is just an error (and a test catches it).
 */
export function toolCatalog(): ToolDescription[] {
  return TOOL_NAMES.map((name) => ({
    name,
    description: toolRegistry[name].description,
    parameters: z.toJSONSchema(toolRegistry[name].args, { target: 'draft-07', io: 'input' }),
  }));
}
