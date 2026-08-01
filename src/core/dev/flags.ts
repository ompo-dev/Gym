import { useAppStore } from "@/store/useAppStore";

import { type FeatureFlag, getScopeEnabled } from "./flagDefs";

export * from "./flagDefs";

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
