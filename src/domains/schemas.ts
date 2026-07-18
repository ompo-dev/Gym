import { z } from 'zod';

import type { Domain } from '@/core/types';

export const foodItemSchema = z.object({
  label: z.string().min(1),
  mediaId: z.string().trim().min(1).optional().catch(undefined),
  quantity: z.coerce.number().positive().optional().catch(undefined),
  unit: z.string().trim().min(1).max(32).optional().catch(undefined),
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

export const foodSchema = z.object({
  items: z.array(foodItemSchema),
  // AI-provided explanation + certainty for the detail sheet. Optional +
  // `.catch` so a missing/garbled field never fails the whole enrich, and old
  // rows saved before this existed still validate.
  reasoning: z.string().max(2000).optional().catch(undefined),
  confidence: z.coerce.number().optional().catch(undefined),
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

export const setSchema = z.object({
  weight: z.coerce.number().nonnegative(),
  unit: z.enum(['kg', 'lb']),
  reps: z.coerce.number().int().nonnegative(),
});
export type WorkoutSet = z.infer<typeof setSchema>;

export const workoutSchema = z.object({
  exercise: z.string().nullable(),
  // Zero sets is valid: the outliner creates an exercise first, then you add
  // sets line by line, so a set-less exercise is a normal transient state.
  sets: z.array(setSchema),
});
export type WorkoutData = z.infer<typeof workoutSchema>;

export type EnrichData = FoodData | WorkoutData;

export const schemaByDomain = {
  food: foodSchema,
  workout: workoutSchema,
} satisfies Record<Domain, z.ZodType>;
