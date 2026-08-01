import { useAppStore } from "@/store/useAppStore";

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

/**
 * Read a feature flag. In release builds, ALWAYS returns true — no flag can
 * ever ship locked and silently remove a feature from a production bundle.
 * In dev, reads from the store's devFlags, defaulting to true.
 */
export function useFeature(flag: FeatureFlag): boolean {
  const devFlags = useAppStore((s) => s.devFlags);
  if (!__DEV__) return true;
  return devFlags[flag] ?? true;
}

export function getScopeEnabled(
  devFlags: Partial<Record<FeatureFlag, boolean>>,
  domain: "food" | "workout",
): boolean {
  const food = devFlags.food ?? true;
  const workout = devFlags.workout ?? true;
  if (!food && !workout) return true;
  return domain === "food" ? food : workout;
}

/**
 * Read a scope-level flag (food / workout). In release, always true. In dev,
 * never allows BOTH scopes to be hidden — that would strand the user in a
 * redirect loop. If both are off, both are shown as a fallback.
 */
export function useScopeEnabled(domain: "food" | "workout"): boolean {
  const devFlags = useAppStore((s) => s.devFlags);
  if (!__DEV__) return true;
  return getScopeEnabled(devFlags, domain);
}
