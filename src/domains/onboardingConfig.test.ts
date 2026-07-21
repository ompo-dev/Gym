import { nextAsk, onboardingConfig, isProfileComplete } from './onboardingConfig';
import { missingFields, parseOnboardingText, ONBOARDING_FIELDS } from './onboardingNotes';

import type { OnboardingData } from './schemas';

const ask = (text: string) => {
  const { capture } = parseOnboardingText(text, '2026-07-21');
  return nextAsk(missingFields([capture]))?.field;
};

test('asks for the first thing it still does not know', () => {
  expect(nextAsk(ONBOARDING_FIELDS)?.field).toBe('gender');
  expect(ask('homem')).toBe('birthDate');
});

test('one sentence answering three things skips three questions', () => {
  // The question follows what is missing, not a step index — that is the whole
  // difference from the wizard this replaced.
  expect(ask('homem, 25 anos, 1,75m')).toBe('weightKg');
});

test('stops asking once everything is known', () => {
  expect(ask('homem 25 anos 1,75m 98kg quero 85kg treino 4x por semana')).toBeUndefined();
  expect(nextAsk([])).toBeNull();
});

test('every asked field carries a question and a writable example', () => {
  // The example becomes the composer placeholder; an empty one means the user
  // has to guess the format.
  for (const field of ONBOARDING_FIELDS) {
    const prompt = nextAsk([field]);
    expect(prompt?.question.length).toBeGreaterThan(0);
    expect(prompt?.example.length).toBeGreaterThan(0);
    // The example must be something the parser actually accepts.
    expect(parseOnboardingText(prompt!.example, '2026-07-21').capture[field]).toBeDefined();
  }
});

test.each(['pt-BR', 'en-US'] as const)('every option chip parses back to itself (%s)', (lang) => {
  // A chip writes its text as a note and the parser reads it back. If that
  // round trip breaks, tapping "Moderadamente ativo" silently records `high`.
  for (const field of ONBOARDING_FIELDS) {
    for (const option of nextAsk([field], lang)?.options ?? []) {
      expect(parseOnboardingText(option.text, '2026-07-21').capture[field]).toBe(option.value);
    }
  }
});

test('only closed-set questions offer chips', () => {
  // Height and weight stay typed on purpose: that is the gesture the app asks
  // for every day after onboarding.
  expect(nextAsk(['gender'])?.options).toHaveLength(4);
  expect(nextAsk(['activity'])?.options).toHaveLength(4);
  expect(nextAsk(['weightKg'])?.options).toBeUndefined();
  expect(nextAsk(['heightCm'])?.options).toBeUndefined();
});

test('each fact carries its own colour into the dock', () => {
  const colors = ONBOARDING_FIELDS.map((field) => nextAsk([field])!.color);
  expect(new Set(colors).size).toBe(ONBOARDING_FIELDS.length);
});

test('the dock counts a field once, however many notes mention it', () => {
  const note = (weightKg: number): OnboardingData => ({
    capture: { weightKg },
    fields: ['weightKg'],
  });
  const totals = [note(98), note(96)].reduce(
    (acc, data) => onboardingConfig.addToTotals(acc, data),
    onboardingConfig.emptyTotals,
  );
  expect(totals.known).toEqual(['weightKg']);
  expect(isProfileComplete(totals)).toBe(false);
});
