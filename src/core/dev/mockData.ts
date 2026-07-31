import { addDays, todayISO } from "@/core/date";
import type { Entry } from "@/core/types";
import { foodSchema, workoutSchema, type MealType } from "@/domains/schemas";

/**
 * mulberry32 — a 5-line seeded PRNG so tests are deterministic.
 * NOT Math.random() — the test proves same seed => same output.
 */
export function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface MockOptions {
  days: number;
  domains: ("food" | "workout")[];
  /** Injectable for testing; defaults to `todayISO()`. */
  today?: string;
}

// ---- helpers ----------------------------------------------------------------

/** Hour:minute to epoch ms on the given date, in LOCAL time. */
function toEpochMs(dateISO: string, hour: number, minute: number): number {
  const [y, m, d] = dateISO.split("-").map(Number);
  return new Date(y, m - 1, d, hour, minute).getTime();
}

/** Random int in [min, max] inclusive. */
function randInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

/**
 * Deterministic mock-id: same format as `newId()` but uses the PRNG for the
 * random suffix and a seed-derived timestamp, so `same seed => same ids`.
 */
function mockId(rng: () => number, index: number, seed: number): string {
  const ts = (seed * 1000 + index).toString(36);
  const cnt = (index % 1_000_000).toString(36);
  const rnd = Math.floor(rng() * 1_000_000).toString(36);
  return `mock-${ts}-${cnt}-${rnd}`;
}

// ---- food mock data ---------------------------------------------------------

const MEAL_TARGETS: { type: MealType; hour: number; minute: number }[] = [
  { type: "breakfast", hour: 8, minute: 0 },
  { type: "morningSnack", hour: 10, minute: 30 },
  { type: "lunch", hour: 12, minute: 30 },
  { type: "afternoonSnack", hour: 16, minute: 0 },
  { type: "dinner", hour: 20, minute: 0 },
];

const FOOD_LABELS: Record<MealType, string[]> = {
  breakfast: ["Ovos mexidos com pão", "Vitamina de banana", "Pão com queijo", "Granola com iogurte"],
  morningSnack: ["Maçã", "Banana", "Barra de cereal", "Castanhas"],
  lunch: ["Arroz, feijão e frango", "Macarrão com carne", "Salada com atum", "Peixe com legumes"],
  afternoonSnack: ["Sanduíche natural", "Torrada com pasta de amendoim", "Iogurte com frutas", "Pão de queijo"],
  dinner: ["Sopa de legumes", "Omelete", "Salada com frango", "Wrap de carne"],
  nightSnack: ["Chá com torrada", "Leite quente", "Gelatina", "Frutas"],
  preWorkout: ["Banana com aveia", "Pão com doce de leite", "Barra de proteína"],
  postWorkout: ["Whey com leite", "Frango com batata doce", "Ovos cozidos"],
};

/** ~10% of meals are logged FAR from their type's natural hour to exercise the median. */
function maybeRetroactive(rng: () => number, type: MealType, dateISO: string): number {
  if (rng() < 0.1) {
    // Shift to a random distant hour (21h–23h) regardless of the meal type.
    return toEpochMs(dateISO, randInt(rng, 21, 23), randInt(rng, 0, 59));
  }
  return 0;
}

function buildFoodEntry(
  rng: () => number,
  dateISO: string,
  mealType: MealType,
  label: string,
  entryIndex: number,
  seed: number,
): Entry {
  const target = MEAL_TARGETS.find((m) => m.type === mealType)!;
  const retro = maybeRetroactive(rng, mealType, dateISO);
  const createdAt =
    retro !== 0
      ? retro
      : toEpochMs(dateISO, target.hour, target.minute) +
        randInt(rng, -30, 30) * 60_000;

  return {
    id: mockId(rng, entryIndex, seed),
    date: dateISO,
    domain: "food",
    text: label,
    status: "done",
    error: null,
    createdAt,
    data: {
      items: [
        {
          label,
          calories: randInt(rng, 150, 700),
          protein: randInt(rng, 5, 60),
          carbs: randInt(rng, 10, 100),
          fat: randInt(rng, 2, 40),
          waterMl: 30,
          sugarG: 0,
          fiberG: 0,
          sodiumMg: 0,
        },
      ],
      mealType,
    },
  };
}

function buildFoodDay(
  rng: () => number,
  dateISO: string,
  startIndex: number,
  seed: number,
): { entries: Entry[]; nextIndex: number } {
  const mealCount = randInt(rng, 3, 5);
  const ordered = MEAL_TARGETS.slice(0, mealCount).map((m) => m.type);
  let idx = startIndex;
  const entries = ordered.map((type) => {
    const labels = FOOD_LABELS[type];
    return buildFoodEntry(rng, dateISO, type, pick(rng, labels), idx++, seed);
  });
  return { entries, nextIndex: idx };
}

// ---- workout mock data ------------------------------------------------------

const EXERCISES = [
  { name: "Supino reto", primary: { muscle: "pectoralis-major", portion: "sternal" } },
  { name: "Agachamento", primary: { muscle: "quadriceps" } },
  { name: "Remada", primary: { muscle: "latissimus-dorsi" } },
  { name: "Desenvolvimento", primary: { muscle: "deltoid", portion: "anterior" } },
  { name: "Rosca direta", primary: { muscle: "biceps-brachii" } },
  { name: "Triceps corda", primary: { muscle: "triceps-brachii" } },
  { name: "Leg press", primary: { muscle: "quadriceps" } },
  { name: "Puxada alta", primary: { muscle: "latissimus-dorsi" } },
  { name: "Corrida", primary: { muscle: "cardiovascular" } },
  { name: "Bicicleta", primary: { muscle: "cardiovascular" } },
];

/** Load progression: baseline ~60kg, creeps up ~0.3 kg per workout. */
function buildWorkoutDay(
  rng: () => number,
  dateISO: string,
  workoutIndex: number,
  startEntryIndex: number,
  seed: number,
): { entries: Entry[]; nextEntryIndex: number } {
  const am = rng() > 0.5;
  const baseHour = am ? randInt(rng, 7, 10) : randInt(rng, 17, 20);
  const baseMinute = randInt(rng, 0, 59);
  const baseCreatedAt = toEpochMs(dateISO, baseHour, baseMinute);

  const exerciseCount = randInt(rng, 3, 4);
  const chosen: typeof EXERCISES = [EXERCISES[workoutIndex % EXERCISES.length]];
  for (let i = 1; i < exerciseCount; i++) {
    const candidate = EXERCISES[randInt(rng, 0, EXERCISES.length - 1)];
    if (!chosen.includes(candidate)) chosen.push(candidate);
  }

  let entryIdx = startEntryIndex;
  const entries: Entry[] = chosen.map((ex, i) => {
    // Space exercises 5-10 min apart within the session.
    const offsetMinutes = i === 0 ? 0 : randInt(rng, 5, 10);
    const createdAt = baseCreatedAt + offsetMinutes * 60_000;

    const isCardio = ex.primary.muscle === "cardiovascular";
    const baseWeight = 60 + workoutIndex * 0.3;

    const kind = isCardio ? "cardio" : "strength";
    const sets = isCardio
      ? [{ durationSeconds: randInt(rng, 900, 3600), distanceMeters: randInt(rng, 3000, 10000) }]
      : Array.from({ length: randInt(rng, 3, 4) }, () => ({
          weight: Math.round((baseWeight + randInt(rng, -5, 5)) * 10) / 10,
          reps: randInt(rng, 6, 15),
          unit: "kg" as const,
        }));

    const entry: Entry = {
      id: mockId(rng, entryIdx, seed),
      date: dateISO,
      domain: "workout",
      text: ex.name,
      status: "done",
      error: null,
      createdAt,
      data: {
        exercise: ex.name,
        primary: ex.primary,
        synergists: [],
        stabilizers: [],
        kind,
        sets,
      },
    };
    entryIdx++;
    return entry;
  });

  return { entries, nextEntryIndex: entryIdx };
}

// ---- main -------------------------------------------------------------------

/**
 * Generate mock entries for the given time window.
 *
 * Pure function — no repository, no DB, no AI call. Returns `Entry[]` where
 * every item has `id` prefixed `mock-`, `status: 'done'`, and `data` that
 * passes its domain's `safeParse`.
 */
export function buildMockEntries(opts: MockOptions): Entry[] {
  const today = opts.today ?? todayISO();
  const seed = today.length * 31 + opts.days * 7;
  const rng = mulberry32(seed);
  const entries: Entry[] = [];
  let workoutIndex = 0;
  let entryIndex = 0;

  for (let dayOffset = opts.days - 1; dayOffset >= 0; dayOffset--) {
    const dateISO = addDays(today, -dayOffset);

    if (opts.domains.includes("food")) {
      const { entries: food, nextIndex } = buildFoodDay(rng, dateISO, entryIndex, seed);
      entries.push(...food);
      entryIndex = nextIndex;
    }

    if (opts.domains.includes("workout") && dayOffset % 2 === 0) {
      const { entries: workoutEntries, nextEntryIndex } = buildWorkoutDay(
        rng,
        dateISO,
        workoutIndex,
        entryIndex,
        seed,
      );
      entries.push(...workoutEntries);
      workoutIndex++;
      entryIndex = nextEntryIndex;
    }
  }

  return entries;
}

// ---- validation (pure helper, testable) -------------------------------------

/**
 * Validate every mock entry against its domain schema. Returns the entries
 * that fail — should ALWAYS be an empty array. The test enforces this.
 */
export function validateMockEntries(entries: Entry[]): Entry[] {
  return entries.filter((entry) => {
    const schema = entry.domain === "food" ? foodSchema : workoutSchema;
    const result = schema.safeParse(entry.data);
    return !result.success;
  });
}
