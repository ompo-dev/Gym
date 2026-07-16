import * as Haptics from 'expo-haptics';

import { enrich } from '@/core/enrich/client';
import { buildOnboardingPromptContext } from '@/core/onboarding';
import { EntryRepository } from '@/data/EntryRepository';
import { getLang } from '@/i18n';
import { useAppStore } from '@/store/useAppStore';

import { CommandBus } from './CommandBus';

/** App-wide singleton wiring the bus to the real repo, store, proxy and haptics. */
export const bus = new CommandBus({
  repo: EntryRepository,
  enrichFn: enrich,
  getLocale: getLang,
  getUserContext: () =>
    buildOnboardingPromptContext(useAppStore.getState().onboardingProfile, getLang()),
  store: {
    getDay: (domain) => useAppStore.getState()[domain],
    upsert: (domain, entry) => useAppStore.getState().upsertEntry(domain, entry),
    remove: (domain, id) => useAppStore.getState().removeEntry(domain, id),
  },
  onResolved: () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  },
});
