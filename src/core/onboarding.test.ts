import {
  buildOnboardingPromptContext,
  buildOnboardingSummary,
  defaultOnboardingProfile,
  estimateAge,
  getOnboardingStage,
} from './onboarding';

test('estimateAge handles birthdays correctly', () => {
  expect(estimateAge('2004-07-23', '2026-07-14')).toBe(21);
  expect(estimateAge('2004-07-23', '2026-07-23')).toBe(22);
});

test('buildOnboardingSummary returns stable macro targets', () => {
  const summary = buildOnboardingSummary(
    { ...defaultOnboardingProfile(), goalDate: '2026-10-06' },
    '2026-07-14',
  );
  expect(summary.age).toBe(21);
  expect(summary.bmr).toBe(2122);
  expect(summary.calories).toBe(2518);
  expect(summary.protein).toBe(153);
  expect(summary.carbs).toBe(333);
  expect(summary.waterMl).toBe(3450);
});

test('buildOnboardingPromptContext includes local goals and restrictions', () => {
  const context = buildOnboardingPromptContext(
    {
      ...defaultOnboardingProfile(),
      goalDate: '2026-10-06',
      considerations: ['vegetarian', 'low-carb'],
      notes: 'sem lactose',
    },
    'pt-BR',
    '2026-07-14',
  );

  expect(context).toContain('targets=2518 kcal');
  expect(context).toContain('water 3450ml');
  expect(context).toContain('vegetariano');
  expect(context).toContain('baixo carboidrato');
  expect(context).toContain('userNotes=sem lactose');
});

test('getOnboardingStage groups the welcome, profile and GymNotes sections', () => {
  expect(getOnboardingStage(0)).toBe(0);
  expect(getOnboardingStage(3)).toBe(1);
  expect(getOnboardingStage(8)).toBe(2);
});
