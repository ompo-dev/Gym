import { enabledMicronutrients } from '@/core/onboarding';

import { useAppStore } from './useAppStore';

jest.mock('@/data/SettingsRepository', () => ({
  SettingsRepository: { get: jest.fn(async () => null), set: jest.fn(async () => undefined) },
}));

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
