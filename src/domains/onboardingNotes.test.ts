import {
  applyCaptures,
  missingFields,
  parseOnboardingText,
  type OnboardingCapture,
} from './onboardingNotes';

const TODAY = '2026-07-21';

const parse = (text: string) => parseOnboardingText(text, TODAY).capture;

test('reads a whole sentence the way a person writes it', () => {
  expect(parse('homem, tenho 25 anos, 1,75m e 98kg')).toEqual({
    gender: 'male',
    birthDate: '2001-07-21',
    heightCm: 175,
    weightKg: 98,
  });
});

test('reads height in centimetres and in metres', () => {
  expect(parse('175cm').heightCm).toBe(175);
  expect(parse('1,75m').heightCm).toBe(175);
  expect(parse('1.75').heightCm).toBe(175);
});

test('a goal word ahead of the number makes it the target weight', () => {
  expect(parse('quero chegar em 85kg')).toEqual({ goalWeightKg: 85 });
  expect(parse('98kg')).toEqual({ weightKg: 98 });
});

test('separates current from target when both are in one note', () => {
  expect(parse('estou com 98kg e quero 85kg')).toEqual({ weightKg: 98, goalWeightKg: 85 });
});

test('turns weekly frequency into the activity scale', () => {
  // Nobody describes themselves as "moderately active" — they say "4x por semana".
  expect(parse('treino 4x por semana').activity).toBe('moderate');
  expect(parse('treino 6 vezes por semana').activity).toBe('high');
  expect(parse('nao treino').activity).toBe('sedentary');
});

test('an unparseable note yields an empty capture, never an error', () => {
  expect(parse('bom dia')).toEqual({});
  expect(() => parseOnboardingText('', TODAY)).not.toThrow();
});

test('ignores numbers outside a human range', () => {
  expect(parse('900kg')).toEqual({});
  expect(parse('tenho 300 anos')).toEqual({});
  expect(parse('50cm')).toEqual({});
});

test('a later note corrects an earlier one', () => {
  const profile = applyCaptures([{ weightKg: 98 }, { weightKg: 96 }]);
  expect(profile.weightKg).toBe(96);
});

test('unspoken fields keep their defaults instead of becoming undefined', () => {
  const profile = applyCaptures([{ weightKg: 98 }]);
  // buildOnboardingSummary reads every field; a hole here is a wrong calorie target.
  expect(profile.estimationBias).toBe(2);
  expect(profile.considerations).toEqual(['strength']);
  expect(profile.micronutrientTargets).toEqual({ sugarG: 25, fiberG: 25, sodiumMg: 2300 });
});

test('tracks what is still missing across notes', () => {
  const captures: OnboardingCapture[] = [
    { gender: 'male', birthDate: '2001-07-21' },
    { heightCm: 175, weightKg: 98 },
  ];
  expect(missingFields(captures)).toEqual(['goalWeightKg', 'activity']);
  expect(missingFields([...captures, { goalWeightKg: 85, activity: 'moderate' }])).toEqual([]);
});
