import {
  buildOnboardingPromptContext,
  buildOnboardingSummary,
  buildWorkoutPromptContext,
  defaultOnboardingProfile,
  estimateAge,
  getOnboardingStage,
  normalizeOnboardingProfile,
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
      trackMicronutrients: true,
      micronutrients: { sugar: true, fiber: true, sodium: false },
    },
    'pt-BR',
    '2026-07-14',
  );

  expect(context).toContain('targets=2518 kcal');
  expect(context).toContain('water 3450ml');
  expect(context).toContain('vegetariano');
  expect(context).toContain('baixo carboidrato');
  expect(context).toContain('userNotes=sem lactose');
  expect(context).toContain('trackMicronutrients=sugar, fiber');
  expect(context).toContain('sugar <= 25g/day');
  expect(context).toContain('fiber >= 25g/day');
  expect(context).not.toContain('sodium <=');
});

test('getOnboardingStage groups the welcome, profile and GymNotes sections', () => {
  expect(getOnboardingStage(0)).toBe(0);
  expect(getOnboardingStage(3)).toBe(1);
  expect(getOnboardingStage(8)).toBe(2);
});

test('the workout context carries who the person is, not their calorie targets', () => {
  // Mandar alvos e macros para um parser de treino e ruido caro: ele nao tem o
  // que fazer com eles e paga tokens por eles.
  const ctx = buildWorkoutPromptContext(defaultOnboardingProfile(), 'pt-BR', '2026-07-21');

  expect(ctx).toContain('weightKg=');
  expect(ctx).toContain('activity=');
  expect(ctx).not.toContain('targets=');
  expect(ctx).not.toContain('micronutrient');
  expect(ctx).not.toContain('calorieEstimationBias');
});

test('no profile means no context, so a new user degrades to today behaviour', () => {
  expect(buildWorkoutPromptContext(null, 'pt-BR')).toBeUndefined();
});

test('training fields reach the workout prompt only once answered', () => {
  const silent = buildWorkoutPromptContext(defaultOnboardingProfile(), 'pt-BR', '2026-07-21');
  expect(silent).toContain('weightUnit=kg');
  expect(silent).not.toContain('trainingLevel=');

  const answered = buildWorkoutPromptContext(
    { ...defaultOnboardingProfile(), trainingLevel: 'advanced', workoutGoal: 'strength' },
    'pt-BR',
    '2026-07-21',
  );
  expect(answered).toContain('trainingLevel=advanced');
  expect(answered).toContain('workoutGoal=strength');
});

test('injuries land last in the workout context, as the final word', () => {
  // Hard constraint: whatever the model reads after this must not override it.
  const ctx = buildWorkoutPromptContext(
    {
      ...defaultOnboardingProfile(),
      equipment: ['dumbbells', 'bands'],
      injuries: ['ombro direito'],
      exercisesDisliked: ['burpee'],
    },
    'pt-BR',
    '2026-07-21',
  )!;
  expect(ctx).toContain('equipment=dumbbells, bands');
  expect(ctx).toContain('exercisesDisliked=burpee');
  expect(ctx.indexOf('injuriesAvoid=')).toBeGreaterThan(ctx.indexOf('exercisesDisliked='));
});

test('a profile saved before the list fields existed still normalizes', () => {
  const legacy = { gender: 'female' as const, weightKg: 70 };
  const profile = normalizeOnboardingProfile(legacy);
  expect(profile.injuries).toEqual([]);
  expect(profile.equipment).toEqual([]);
  expect(profile.weightUnit).toBe('kg');
});
