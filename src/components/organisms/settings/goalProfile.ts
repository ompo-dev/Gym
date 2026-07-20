import {
  activityOptions,
  genderOptions,
} from "@/components/onboarding/onboardingContent";
import type { OnboardingProfile } from "@/core/onboarding";
import { getLang } from "@/i18n";

export const GOAL_TYPE_OPTIONS = [
  { value: "lose", label: { "pt-BR": "Perder peso", "en-US": "Lose weight" } },
  {
    value: "maintain",
    label: { "pt-BR": "Manter peso", "en-US": "Maintain weight" },
  },
  { value: "gain", label: { "pt-BR": "Ganhar peso", "en-US": "Gain weight" } },
] as const;

export type GoalType = (typeof GOAL_TYPE_OPTIONS)[number]["value"];

function clampPickerWeight(weightKg: number): number {
  return Math.min(180, Math.max(45, Math.round(weightKg * 2) / 2));
}

export function goalTypeFor(profile: OnboardingProfile): GoalType {
  if (Math.abs(profile.goalWeightKg - profile.weightKg) < 0.25)
    return "maintain";
  return profile.goalWeightKg > profile.weightKg ? "gain" : "lose";
}

export function goalTypeLabel(profile: OnboardingProfile): string {
  const lang = getLang();
  return (
    GOAL_TYPE_OPTIONS.find((option) => option.value === goalTypeFor(profile))
      ?.label[lang] ?? GOAL_TYPE_OPTIONS[1].label[lang]
  );
}

// Returns a new profile (or the same reference when the goal type is unchanged);
// it does not mutate the draft it receives.
export function applyGoalType(profile: OnboardingProfile, nextType: GoalType) {
  if (goalTypeFor(profile) === nextType) return profile;
  const delta = Math.max(Math.abs(profile.goalWeightKg - profile.weightKg), 5);
  const goalWeightKg =
    nextType === "maintain"
      ? profile.weightKg
      : profile.weightKg + (nextType === "gain" ? delta : -delta);
  return { ...profile, goalWeightKg: clampPickerWeight(goalWeightKg) };
}

export function genderLabel(gender: OnboardingProfile["gender"]): string {
  const lang = getLang();
  return (
    genderOptions.find((option) => option.value === gender)?.label[lang] ??
    genderOptions[0].label[lang]
  );
}

export function activityLabel(activity: OnboardingProfile["activity"]): string {
  const lang = getLang();
  return (
    activityOptions.find((option) => option.value === activity)?.label[lang] ??
    activityOptions[0].label[lang]
  );
}
