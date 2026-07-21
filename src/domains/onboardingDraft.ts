import { SettingsRepository } from '@/data/SettingsRepository';

import type { Answers, QuestionId } from './onboardingQuestions';

/**
 * Onboarding progress, kept across app launches.
 *
 * Someone who quits halfway through — a phone call, a battery, an App Store
 * update — must not come back to a blank first question. The draft is written
 * on every answer and cleared once the profile is committed, so it never
 * shadows the real profile afterwards.
 */

const DRAFT_KEY = 'onboarding_draft';

export interface OnboardingDraft {
  answers: Answers;
  notes: string;
}

const EMPTY: OnboardingDraft = { answers: {}, notes: '' };

const VALID_IDS: readonly QuestionId[] = [
  'gender',
  'birthDate',
  'heightCm',
  'weightKg',
  'goalWeightKg',
  'goalDate',
  'activity',
  'considerations',
  'estimationBias',
];

/**
 * Parsed defensively: this is our own JSON, but it survives app upgrades that
 * rename or drop a question, and a corrupt draft must cost the user nothing
 * worse than starting over.
 */
export function parseDraft(raw: string | null): OnboardingDraft {
  if (!raw) return EMPTY;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return EMPTY;
    const { answers, notes } = parsed as Partial<OnboardingDraft>;
    if (!answers || typeof answers !== 'object') return EMPTY;

    const clean: Answers = {};
    for (const id of VALID_IDS) {
      const value = (answers as Record<string, unknown>)[id];
      if (typeof value === 'string') clean[id] = value;
      else if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
        clean[id] = value as string[];
      }
    }
    return { answers: clean, notes: typeof notes === 'string' ? notes : '' };
  } catch {
    return EMPTY;
  }
}

export const OnboardingDraftStore = {
  async load(): Promise<OnboardingDraft> {
    return parseDraft(await SettingsRepository.get(DRAFT_KEY));
  },

  async save(draft: OnboardingDraft): Promise<void> {
    await SettingsRepository.set(DRAFT_KEY, JSON.stringify(draft));
  },

  /** Called on the way into the app — the profile is the record from then on. */
  async clear(): Promise<void> {
    await SettingsRepository.set(DRAFT_KEY, '');
  },
};
