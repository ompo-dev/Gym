import { useMemo } from "react";
import { useColorScheme } from "react-native";

import { Colors } from "@/constants/theme";

import { createOnboardingStyles } from "./onboardingStyles";

export const onboardingPalettes = {
  light: {
    scheme: "light",
    accent: "#6E5BFF",
    accentSoft: "#5F47E8",
    accentMuted: "rgba(110,91,255,0.14)",
    bg: Colors.light.background,
    surface: Colors.light.surface,
    surfaceAlt: Colors.light.surfaceMuted,
    surfaceStrong: Colors.light.backgroundElement,
    border: Colors.light.border,
    cardBorder: "rgba(21,19,18,0.12)",
    text: Colors.light.text,
    textSecondary: Colors.light.textSecondary,
    textTertiary: Colors.light.textTertiary,
    iconMuted: "#8D8578",
    primaryText: "#FFFFFF",
    checkText: "#FFFFFF",
    progressTrack: "#E3DDD4",
    progressFill: Colors.light.text,
    divider: "rgba(21,19,18,0.08)",
    overlay: "rgba(21,19,18,0.28)",
    sheet: "#FFFFFF",
    sheetHandle: "rgba(21,19,18,0.22)",
    segmented: "rgba(21,19,18,0.07)",
    segmentActive: "rgba(255,255,255,0.92)",
    sliderTrack: "#D8D0C4",
  },
  dark: {
    scheme: "dark",
    accent: "#6E5BFF",
    accentSoft: "#8D7BFF",
    accentMuted: "rgba(110,91,255,0.18)",
    bg: Colors.dark.background,
    surface: "#2B2B2D",
    surfaceAlt: "#262628",
    surfaceStrong: "#242426",
    border: "rgba(255,255,255,0.08)",
    cardBorder: "rgba(255,255,255,0.14)",
    text: Colors.dark.text,
    textSecondary: Colors.dark.textSecondary,
    textTertiary: Colors.dark.textTertiary,
    iconMuted: "#A9A9AD",
    primaryText: "#FFFFFF",
    checkText: "#17171A",
    progressTrack: "#353538",
    progressFill: "#F4F4F7",
    divider: "rgba(255,255,255,0.06)",
    overlay: "rgba(0,0,0,0.44)",
    sheet: "#2F2F32",
    sheetHandle: "rgba(255,255,255,0.32)",
    segmented: "rgba(255,255,255,0.08)",
    segmentActive: "rgba(255,255,255,0.16)",
    sliderTrack: "#4A4A50",
  },
} as const;

export type OnboardingColors =
  (typeof onboardingPalettes)[keyof typeof onboardingPalettes];

export function useOnboardingTheme() {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const colors = onboardingPalettes[scheme];
  const styles = useMemo(() => createOnboardingStyles(colors), [colors]);

  return { colors, styles };
}

export const ONBOARDING_ACCENT = onboardingPalettes.dark.accent;
export const ONBOARDING_ACCENT_SOFT = onboardingPalettes.dark.accentSoft;
export const ONBOARDING_BG = onboardingPalettes.dark.bg;
export const ONBOARDING_SURFACE = onboardingPalettes.dark.surface;
export const ONBOARDING_BORDER = onboardingPalettes.dark.border;
export const ONBOARDING_TEXT = onboardingPalettes.dark.text;
export const ONBOARDING_TEXT_SECONDARY = onboardingPalettes.dark.textSecondary;
