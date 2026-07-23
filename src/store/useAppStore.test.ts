import { defaultOnboardingProfile, enabledMicronutrients } from '@/core/onboarding';

import { useAppStore } from './useAppStore';

jest.mock('@/data/SettingsRepository', () => ({
  SettingsRepository: { get: jest.fn(async () => null), set: jest.fn(async () => undefined) },
}));

// The store reaches the database only to erase it. Left unmocked, expo-sqlite
// pulls in native modules jest cannot resolve and the whole file stops running.
const mockWipeAllData = jest.fn(async () => undefined);
jest.mock('@/data/db', () => ({ wipeAllData: () => mockWipeAllData() }));

afterEach(() => {
  useAppStore.setState({ onboardingProfile: null });
});

test('the profile can be written before onboarding finishes', () => {
  // Onboarding saves the profile while `onboardingProfile` is still null, so it
  // could reach the goals sheet. Bailing on a null current made every answer a
  // silent no-op — micronutrients enabled on screen, absent in the goals.
  void useAppStore.getState().updateOnboardingProfile({
    micronutrients: { sugar: true, fiber: true, sodium: false },
  });

  const profile = useAppStore.getState().onboardingProfile;
  expect(profile).not.toBeNull();
  expect(enabledMicronutrients(profile!)).toEqual(['sugar', 'fiber']);
});

test('trackMicronutrients follows whatever is actually enabled', () => {
  void useAppStore.getState().updateOnboardingProfile({
    micronutrients: { sugar: false, fiber: false, sodium: true },
  });
  expect(useAppStore.getState().onboardingProfile?.trackMicronutrients).toBe(true);

  void useAppStore.getState().updateOnboardingProfile({
    micronutrients: { sugar: false, fiber: false, sodium: false },
  });
  expect(useAppStore.getState().onboardingProfile?.trackMicronutrients).toBe(false);
});

test('a later write merges onto the earlier one', () => {
  void useAppStore.getState().updateOnboardingProfile({ weightKg: 98 });
  void useAppStore.getState().updateOnboardingProfile({ goalWeightKg: 85 });

  const profile = useAppStore.getState().onboardingProfile;
  expect(profile).toMatchObject({ weightKg: 98, goalWeightKg: 85 });
});

// Local-only means there is no server copy to restore from, so this has to be
// complete: anything left behind is data the user asked to be rid of.
test('erasing the data clears the disk and every value in memory', async () => {
  useAppStore.setState({
    onboardingDone: true,
    onboardingProfile: defaultOnboardingProfile(),
    apiKeys: { mode: 'own', chat: 'sk-secret', image: '' },
    food: { date: '2026-07-22', entries: [{ id: 'x' } as never] },
  });

  await useAppStore.getState().eraseAllData();

  const state = useAppStore.getState();
  expect(mockWipeAllData).toHaveBeenCalled();
  expect(state.onboardingDone).toBe(false);
  expect(state.onboardingProfile).toBeNull();
  expect(state.food.entries).toEqual([]);
  // The key is the user's, not ours: deleting the account has to take it too.
  expect(state.apiKeys).toEqual({ mode: 'managed', chat: '', image: '' });
});

// How the app looks is not something the user typed, and resetting it on the
// way out reads as a glitch rather than as privacy.
test('erasing the data keeps the chosen theme', async () => {
  useAppStore.setState({ theme: 'dark' });

  await useAppStore.getState().eraseAllData();

  expect(useAppStore.getState().theme).toBe('dark');
});
