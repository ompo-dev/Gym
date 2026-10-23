import { useAppStore } from "@/store/useAppStore";

import { DEFAULT_FLAGS, type FeatureFlag, getScopeEnabled } from "./flagDefs";

export * from "./flagDefs";

/**
 * Persisted developer overrides also work in internal builds. New flags use
 * their declared default, including opt-in experiments.
 */
export function useFeature(flag: FeatureFlag): boolean {
  const devFlags = useAppStore((s) => s.devFlags);
  return devFlags[flag] ?? DEFAULT_FLAGS[flag];
}

/**
 * Read a scope-level flag (food / workout). Never allows BOTH scopes to be
 * hidden — that would strand the user in a redirect loop. If both are off,
 * both are shown as a fallback.
 */
export function useScopeEnabled(domain: "food" | "workout"): boolean {
  const devFlags = useAppStore((s) => s.devFlags);
  return getScopeEnabled(devFlags, domain);
}
