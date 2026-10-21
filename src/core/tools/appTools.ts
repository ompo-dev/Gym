import { bus } from '@/core/command/bus';
import { todayISO } from '@/core/date';
import { defaultOnboardingProfile } from '@/core/onboarding';
import { EntryRepository } from '@/data/EntryRepository';
import { SavedMealRepository } from '@/data/SavedMealRepository';
import { foodGoalsFromProfile } from '@/domains/food';
import { useAppStore } from '@/store/useAppStore';

import type { ToolDeps } from './registry';

export const appToolDeps: ToolDeps = {
  bus, entries: EntryRepository, savedMeals: SavedMealRepository, today: todayISO,
  goals: () => foodGoalsFromProfile(useAppStore.getState().onboardingProfile ?? defaultOnboardingProfile()),
};
