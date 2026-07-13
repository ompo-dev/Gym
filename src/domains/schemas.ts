import { z } from 'zod';

import type { Domain } from '@/core/types';

/**
 * Schemas for the structured data the AI extracts from a free-text entry.
 * The AI only PARSES/estimates atomic values — it never sums. Food returns one
 * object per component (burger + fries = 2 items); we do all the arithmetic.
 * Numbers use `coerce` because the model sometimes returns them as strings.
 * Shared by client and proxy — keep this file free of RN/UI imports.
 */

export const foodItemSchema = z.object({
  label: z.string().min(1),
  calories: z.coerce.number().nonnegative(),
  protein: z.coerce.number().nonnegative(),
  carbs: z.coerce.number().nonnegative(),
  fat: z.coerce.number().nonnegative(),
});
export type FoodItem = z.infer<typeof foodItemSchema>;

export const foodSchema = z.object({
  items: z.array(foodItemSchema).min(1),
});
export type FoodData = z.infer<typeof foodSchema>;

export const setSchema = z.object({
  weight: z.coerce.number().nonnegative(),
  unit: z.enum(['kg', 'lb']),
  reps: z.coerce.number().int().nonnegative(),
});
export type WorkoutSet = z.infer<typeof setSchema>;

export const workoutSchema = z.object({
  exercise: z.string().nullable(),
  sets: z.array(setSchema).min(1),
});
export type WorkoutData = z.infer<typeof workoutSchema>;

export type EnrichData = FoodData | WorkoutData;

export const schemaByDomain = {
  food: foodSchema,
  workout: workoutSchema,
} satisfies Record<Domain, z.ZodType>;
