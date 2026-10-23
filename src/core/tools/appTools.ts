import { bus } from '@/core/command/bus';
import { todayISO } from '@/core/date';
import { defaultOnboardingProfile } from '@/core/onboarding';
import { EntryRepository } from '@/data/EntryRepository';
import { SavedMealRepository } from '@/data/SavedMealRepository';
import { SettingsRepository } from '@/data/SettingsRepository';
import { foodGoalsFromProfile } from '@/domains/food';
import { useAppStore } from '@/store/useAppStore';

import type { ToolDeps } from './registry';

export const appToolDeps: ToolDeps = {
  bus, entries: EntryRepository, savedMeals: SavedMealRepository, today: todayISO,
  deliveries: {
    get: (id) => SettingsRepository.get(`gymnotes.delivery.v1:${id}`),
    set: (id, value) => SettingsRepository.set(`gymnotes.delivery.v1:${id}`, value),
  },
  goals: () => foodGoalsFromProfile(useAppStore.getState().onboardingProfile ?? defaultOnboardingProfile()),
};
