import { z } from 'zod';

import type { Domain } from '@/core/types';

import { isValidPortion } from './anatomy';

/**
 * Where a meal item came out of the fridge. Set by the app, never the model —
 * the same rule the recipe's `pantryItemId` follows.
 *
 * `grams` is how much was taken, and it is what the pantry subtracts from stock.
 * Because it lives in the note's JSON, deleting the note deletes the draw and
 * the stock comes back on the next read — there is no ledger to reverse.
 */
export const foodItemSourceSchema = z.object({
  pantryItemId: z.string().min(1),
  label: z.string().min(1),
  grams: z.coerce.number().positive(),
});
export type FoodItemSource = z.infer<typeof foodItemSourceSchema>;

export const foodItemSchema = z.object({
  label: z.string().min(1),
  mediaId: z.string().trim().min(1).optional().catch(undefined),
  quantity: z.coerce.number().positive().optional().catch(undefined),
  unit: z.string().trim().min(1).max(32).optional().catch(undefined),
  /** Filled from the pantry when this item was drawn from stock. */
  from: foodItemSourceSchema.optional().catch(undefined),
  calories: z.coerce.number().nonnegative(),
  protein: z.coerce.number().nonnegative(),
  carbs: z.coerce.number().nonnegative(),
  fat: z.coerce.number().nonnegative(),
  waterMl: z.coerce.number().nonnegative().default(0),
  sugarG: z.coerce.number().nonnegative().default(0),
  fiberG: z.coerce.number().nonnegative().default(0),
  sodiumMg: z.coerce.number().nonnegative().default(0),
});
export type FoodItem = z.infer<typeof foodItemSchema>;

/**
 * An ingredient the recipe calls for. `pantryItemId` is decided by the app, not
 * the model: the model only knows the pantry through what we inject, and a
 * wrong "you have it" costs the missing ingredient at the stove.
 */
export const recipeIngredientSchema = z.object({
  label: z.string().trim().min(1).max(80),
  quantity: z.coerce.number().positive().optional().catch(undefined),
  unit: z.string().trim().min(1).max(32).optional().catch(undefined),
  /** null = has to be bought. Filled from the pantry. */
  pantryItemId: z.string().min(1).nullable().default(null),
  /** Whole cents. undefined = no price history for this item. */
  estimatedCostCents: z.coerce.number().int().nonnegative().optional().catch(undefined),
});
export type FoodRecipeIngredient = z.infer<typeof recipeIngredientSchema>;

export const recipeStepSchema = z.object({
  text: z.string().trim().min(1).max(400),
  minutes: z.coerce.number().int().positive().max(600).optional().catch(undefined),
});

export const foodRecipeSchema = z.object({
  servings: z.coerce.number().int().positive().max(20).default(1),
  totalMinutes: z.coerce.number().int().positive().max(600).optional().catch(undefined),
  ingredients: z.array(recipeIngredientSchema).min(1).max(30),
  steps: z.array(recipeStepSchema).min(1).max(20),
});
export type FoodRecipe = z.infer<typeof foodRecipeSchema>;

export const foodSchema = z.object({
  items: z.array(foodItemSchema),
  // AI-provided explanation + certainty for the detail sheet. Optional +
  // `.catch` so a missing/garbled field never fails the whole enrich, and old
  // rows saved before this existed still validate.
  reasoning: z.string().max(2000).optional().catch(undefined),
  confidence: z.coerce.number().optional().catch(undefined),
  // Same rule as reasoning: `EntryRepository.parseData` revalidates every
  // persisted row against the CURRENT schema, and a required field here would
  // erase every meal already saved. A half-valid recipe falls into `.catch` as
  // a whole rather than taking the meal down with it.
  recipe: foodRecipeSchema.optional().catch(undefined),
});
export type FoodData = z.infer<typeof foodSchema>;

export const foodEditSchema = z.object({
  description: z.string().trim().min(1).max(160).optional().catch(undefined),
  meal: foodSchema,
  changes: z.array(
    z.object({
      action: z.enum(['added', 'edited', 'removed']),
      item: z.string().min(1),
      note: z.string().max(500).optional().catch(undefined),
    }),
  ).default([]),
});
export type FoodEditData = z.infer<typeof foodEditSchema>;

/**
 * One line of a purchase note. Deliberately no nutrition here: nothing in this
 * note was eaten, and a calorie field that exists is a calorie field something
 * will eventually sum.
 */
export const nutritionPer100gSchema = z.object({
  calories: z.coerce.number().nonnegative().catch(0),
  protein: z.coerce.number().nonnegative().catch(0),
  carbs: z.coerce.number().nonnegative().catch(0),
  fat: z.coerce.number().nonnegative().catch(0),
  sugarG: z.coerce.number().nonnegative().optional().catch(undefined),
  fiberG: z.coerce.number().nonnegative().optional().catch(undefined),
  sodiumMg: z.coerce.number().nonnegative().optional().catch(undefined),
});
export type NutritionPer100g = z.infer<typeof nutritionPer100gSchema>;

export const purchaseItemSchema = z.object({
  label: z.string().min(1),
  quantity: z.coerce.number().positive().optional().catch(undefined),
  unit: z.string().trim().min(1).max(32).optional().catch(undefined),
  /** Net mass of the whole line, when the note or a standard pack states one. */
  grams: z.coerce.number().positive().optional().catch(undefined),
  /**
   * Total paid for THIS line, in local currency. Never a unit price: price per
   * kg is derived on read, so it can never drift from what was actually paid.
   */
  price: z.coerce.number().nonnegative().optional().catch(undefined),
  /**
   * Reference nutrition per 100 g of the product, NOT of a serving and NOT of
   * the amount bought. Groceries sit in the fridge for weeks, so the only
   * honest figure is the one that does not depend on when you eat it.
   *
   * Carrying this never makes a purchase count toward the day — that exclusion
   * lives in `addToTotals` and is about the note being a purchase at all, not
   * about whether we happen to know its macros.
   */
  nutrition: nutritionPer100gSchema.optional().catch(undefined),
});
export type PurchaseItem = z.infer<typeof purchaseItemSchema>;

export const purchaseSchema = z.object({
  // `.min(1)` matters: an empty purchase would validate as "a resolved note
  // that says nothing", and the row would render a price of zero forever.
  purchase: z.array(purchaseItemSchema).min(1),
  reasoning: z.string().max(2000).optional().catch(undefined),
  confidence: z.coerce.number().optional().catch(undefined),
});
export type PurchaseData = z.infer<typeof purchaseSchema>;

/**
 * What a `food` entry may hold. Disjoint by construction — `items` required on
 * one side, `purchase` on the other — which is what keeps every existing
 * `'items' in data` guard meaning exactly "this is a meal".
 */
export const foodEntrySchema = z.union([purchaseSchema, foodSchema]);
export type FoodEntryData = z.infer<typeof foodEntrySchema>;

/**
 * One note that turns out to be several actions — "comprei 3 coisas e comi 4".
 * The model returns one entry per action and the bus explodes them into real
 * notes, exactly as a workout plan explodes into one note per exercise. Disjoint
 * from the single shapes by its `notes` key, so the same union accepts all three.
 */
export const foodMultiSchema = z.object({
  notes: z
    .array(
      z.object({
        text: z.string().trim().min(1).max(500),
        data: foodEntrySchema,
      }),
    )
    .min(1)
    .max(8),
});
export type FoodMultiData = z.infer<typeof foodMultiSchema>;

const nullToUndefined = (value: unknown) => (value === null ? undefined : value);

function normalizeWorkoutKind(value: unknown): unknown {
  if (value === null) return undefined;
  if (typeof value !== 'string') return value;
  const normalized = value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (['serie', 'series', 'strength', 'forca', 'musculacao'].includes(normalized)) {
    return 'strength';
  }
  if (normalized === 'cardio') return 'cardio';
  return value;
}

function hasWorkoutSetMetric(set: {
  weight?: number;
  reps?: number;
  durationSeconds?: number;
  distanceMeters?: number;
}): boolean {
  return (
    set.weight !== undefined ||
    set.reps !== undefined ||
    set.durationSeconds !== undefined ||
    set.distanceMeters !== undefined
  );
}

export const setSchema = z.object({
  weight: z.preprocess(nullToUndefined, z.coerce.number().nonnegative().optional()),
  unit: z.preprocess(nullToUndefined, z.enum(['kg', 'lb']).optional()),
  reps: z.preprocess(nullToUndefined, z.coerce.number().int().nonnegative().optional()),
  durationSeconds: z.preprocess(
    nullToUndefined,
    z.coerce.number().int().nonnegative().optional(),
  ),
  distanceMeters: z.preprocess(nullToUndefined, z.coerce.number().nonnegative().optional()),
}).refine(
  hasWorkoutSetMetric,
).refine((set) => set.weight === undefined || set.reps !== undefined);
export type WorkoutSet = z.infer<typeof setSchema>;

const muscleRefShape = z.object({
  muscle: z.string(),
  portion: z.string().optional(),
});

/**
 * Drop references the anatomy vocabulary does not know instead of rejecting the
 * whole entry. A hallucinated muscle must not cost the user the exercise-name
 * correction that came in the same response.
 */
function keepKnownMuscles(value: unknown): unknown {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => {
    const parsed = muscleRefShape.safeParse(item);
    return parsed.success && isValidPortion(parsed.data.muscle, parsed.data.portion);
  });
}

function keepKnownMuscle(value: unknown): unknown {
  const parsed = muscleRefShape.safeParse(value);
  if (!parsed.success) return undefined;
  return isValidPortion(parsed.data.muscle, parsed.data.portion) ? value : undefined;
}

export const muscleRefSchema = muscleRefShape;
export type MuscleRef = z.infer<typeof muscleRefSchema>;

export const workoutSchema = z.object({
  exercise: z.string().nullable(),
  /** The muscle the exercise is for. */
  primary: z.preprocess(keepKnownMuscle, muscleRefShape.optional()),
  synergists: z.preprocess(keepKnownMuscles, z.array(muscleRefShape).default([])),
  stabilizers: z.preprocess(keepKnownMuscles, z.array(muscleRefShape).default([])),
  kind: z.preprocess(normalizeWorkoutKind, z.enum(['strength', 'cardio']).optional()),
  // Zero sets is valid: the outliner creates an exercise first, then you add
  // sets line by line, so a set-less exercise is a normal transient state.
  sets: z.array(setSchema).default([]),
});
export type WorkoutData = z.infer<typeof workoutSchema>;

/**
 * What one onboarding note yields. Every field is optional because a note is a
 * sentence, not a form — "1,75m e 98kg" carries two of the six and that is a
 * complete, valid note.
 */
export const onboardingSchema = z.object({
  capture: z.object({
    gender: z.enum(['male', 'female', 'other', 'private']).optional(),
    birthDate: z.string().optional(),
    heightCm: z.number().min(100).max(250).optional(),
    weightKg: z.number().min(30).max(400).optional(),
    goalWeightKg: z.number().min(30).max(400).optional(),
    activity: z.enum(['sedentary', 'light', 'moderate', 'high']).optional(),
  }),
  fields: z
    .array(z.enum(['gender', 'birthDate', 'heightCm', 'weightKg', 'goalWeightKg', 'activity']))
    .default([]),
});
export type OnboardingData = z.infer<typeof onboardingSchema>;

export type EnrichData = FoodEntryData | WorkoutData | OnboardingData;

/**
 * A saved day. Workout keeps only the exercise names — reapplying it should
 * give you the session to fill in, not last week's loads. Diet keeps the full
 * nutrition, because repeating a meal means repeating its numbers.
 */
export const routineWorkoutItemsSchema = z.array(z.string().trim().min(1));

export const routineFoodItemsSchema = z.array(
  z.object({
    text: z.string(),
    data: foodSchema,
  }),
);

export type RoutineFoodItem = z.infer<typeof routineFoodItemsSchema>[number];

export const routineItemsSchemaByDomain = {
  food: routineFoodItemsSchema,
  workout: routineWorkoutItemsSchema,
  // Onboarding happens once; there is no day worth saving and reapplying.
  onboarding: z.array(z.never()),
} satisfies Record<Domain, z.ZodType>;

export const schemaByDomain = {
  food: foodEntrySchema,
  workout: workoutSchema,
  onboarding: onboardingSchema,
} satisfies Record<Domain, z.ZodType>;
