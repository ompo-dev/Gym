import { useAppStore } from "@/store/useAppStore";

export const FEATURE_FLAGS = [
  "camera",
  "savedMeals",
  "savedExercises",
  "pantry",
  "workoutMonitor",
  "aiEdit",
  "offlineForce",
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
};

/**
 * Read a feature flag. In release builds, ALWAYS returns true — no flag can
 * ever ship locked and silently remove a feature from a production bundle.
 * In dev, reads from the store's devFlags, defaulting to true.
 */
export function useFeature(flag: FeatureFlag): boolean {
  if (!__DEV__) return true;
  // ponytail: reading the whole store instead of a selector — dev-only,
  // and the flags blob fits in a single read.
  const devFlags = useAppStore((s) => s.devFlags);
  return devFlags[flag] ?? true;
}
