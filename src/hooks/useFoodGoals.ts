import { defaultOnboardingProfile } from "@/core/onboarding";
import { foodGoalsFromProfile } from "@/domains/food";
import { useAppStore } from "@/store/useAppStore";

export function useFoodGoals() {
  const profile = useAppStore((s) => s.onboardingProfile) ?? defaultOnboardingProfile();
  return foodGoalsFromProfile(profile);
}
