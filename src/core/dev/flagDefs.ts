export const FEATURE_FLAGS = [
  "camera",
  "savedMeals",
  "savedExercises",
  "pantry",
  "workoutMonitor",
  "aiEdit",
  "offlineForce",
  "barcode",
  "reminders",
  "weight",
  "recipes",
  "food",
  "workout",
] as const;

export type FeatureFlag = (typeof FEATURE_FLAGS)[number];
export type FeatureFlags = Record<FeatureFlag, boolean>;

export const DEFAULT_FLAGS: FeatureFlags = {
  camera: true,
  savedMeals: true,
  savedExercises: true,
  pantry: true,
  workoutMonitor: true,
  aiEdit: true,
  offlineForce: false,
  barcode: true,
  reminders: true,
  weight: true,
  recipes: true,
  food: true,
  workout: true,
};

export function getScopeEnabled(
  devFlags: Partial<Record<FeatureFlag, boolean>>,
  domain: "food" | "workout",
): boolean {
  const food = devFlags.food ?? true;
  const workout = devFlags.workout ?? true;
  if (!food && !workout) return true;
  return domain === "food" ? food : workout;
}
