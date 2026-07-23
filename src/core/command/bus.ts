import * as Haptics from 'expo-haptics';
import { Keyboard } from 'react-native';

import { enrich } from '@/core/enrich/client';
import { buildOnboardingPromptContext, buildWorkoutPromptContext } from '@/core/onboarding';
import { EntryRepository } from '@/data/EntryRepository';
import { PantryRepository } from '@/data/PantryRepository';
import { pantryPromptContext } from '@/domains/pantry';
import { getLang } from '@/i18n';
import { useAppStore } from '@/store/useAppStore';

import { CommandBus } from './CommandBus';

/** App-wide singleton wiring the bus to the real repo, store, proxy and haptics. */
export const bus = new CommandBus({
  repo: EntryRepository,
  enrichFn: enrich,
  getLocale: getLang,
  getUserContext: async (domain) => {
    const profile = useAppStore.getState().onboardingProfile;
    const locale = getLang();
    if (domain === 'workout') return buildWorkoutPromptContext(profile, locale);

    // The diet side gets the fridge too. Without it the recipe prompt's
    // "prefer what is already there" was an instruction about a list that was
    // never sent, and recipes came back full of things the user does not own.
    const pantry = pantryPromptContext(await PantryRepository.all());
    return [buildOnboardingPromptContext(profile, locale), pantry].filter(Boolean).join('\n');
  },
  // The live fridge, so a resolved meal is linked to what it drew from and
  // priced with the real product. Derived from the notes, so deleting a meal
  // restores the stock on the next read with nothing to reverse.
  getPantry: () => PantryRepository.all(),
  store: {
    getDay: (domain) => useAppStore.getState()[domain],
    upsert: (domain, entry) => useAppStore.getState().upsertEntry(domain, entry),
    remove: (domain, id) => useAppStore.getState().removeEntry(domain, id),
  },
  // The row the cursor is in is about to be deleted and replaced by the plan.
  onNoteReplaced: () => Keyboard.dismiss(),
  onResolved: () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  },
});
