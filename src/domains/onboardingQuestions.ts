import type { ComponentType } from 'react';

import {
  activityOptions,
  biasMeta,
  BIAS_DOT_COLORS,
  considerationOptions,
  genderOptions,
} from '@/components/onboarding/onboardingContent';
import { Colors } from '@/constants/theme';
import {
  micronutrientsFromTrack,
  type OnboardingMicronutrient,
  type OnboardingProfile,
} from '@/core/onboarding';
import { t, type Lang } from '@/i18n';

/**
 * The script the outliner reads.
 *
 * One question per note block, in order. Everything about a question lives in
 * this table — its colour, how it is answered, what it writes into the profile —
 * so adding or reordering a question never touches a component.
 */

export type QuestionId =
  | 'gender'
  | 'birthDate'
  | 'heightCm'
  | 'weightKg'
  | 'goalWeightKg'
  | 'goalDate'
  | 'activity'
  | 'considerations'
  | 'micronutrients'
  | 'estimationBias';

/**
 * `choice`/`multi` answer inline as struck-through sub-lines; the rest open a
 * sheet that already exists elsewhere in the app, so the control the user meets
 * here is the same one Settings will show them later.
 */
export type QuestionKind = 'choice' | 'multi' | 'picker' | 'date' | 'bias';

export interface QuestionOption {
  value: string;
  label: string;
  /** Revealed as an indented line under the option once it is picked. */
  description?: string;
  /** Overrides the question colour when picked — the bias scale reads as a scale. */
  color?: string;
  Icon?: ComponentType<{ size?: number; strokeWidth?: number; color?: string }>;
}

export interface Question {
  id: QuestionId;
  kind: QuestionKind;
  question: string;
  color: string;
  options?: readonly QuestionOption[];
  /** Shown on sheet-backed questions in place of options. */
  hint?: string;
  /** Answered questions can be skipped past; only these may be left empty. */
  optional?: boolean;
  /** Adds a free-text sub-line whose content lands in `profile.notes`. */
  allowsText?: boolean;
}

const COLOR: Record<QuestionId, string> = {
  gender: Colors.dark.carbs,
  birthDate: Colors.dark.water,
  heightCm: Colors.dark.protein,
  weightKg: Colors.dark.accent,
  goalWeightKg: Colors.dark.calories,
  goalDate: Colors.dark.water,
  activity: Colors.dark.fat,
  considerations: Colors.dark.protein,
  micronutrients: Colors.dark.water,
  estimationBias: Colors.dark.carbs,
};

const ASK: Record<QuestionId, string> = {
  gender: 'onboarding.ask.gender',
  birthDate: 'onboarding.ask.birthDate',
  heightCm: 'onboarding.ask.heightCm',
  weightKg: 'onboarding.ask.weightKg',
  goalWeightKg: 'onboarding.ask.goalWeightKg',
  goalDate: 'onboarding.ask.goalDate',
  activity: 'onboarding.ask.activity',
  considerations: 'onboarding.ask.considerations',
  micronutrients: 'onboarding.ask.micronutrients',
  estimationBias: 'onboarding.ask.estimationBias',
};

function biasOptions(lang: Lang): readonly QuestionOption[] {
  return ([0, 1, 2, 3, 4] as const).map((level) => ({
    value: String(level),
    label: t(`bias.${level}` as 'bias.0'),
    description: `${biasMeta[level].body[lang]} ${biasMeta[level].example[lang]}`,
    color: BIAS_DOT_COLORS[level],
  }));
}

/** Colours match the rings `FoodGoalsSheet` draws, so the choice previews itself. */
const MICRO_OPTIONS: readonly QuestionOption[] = [
  { value: 'sugar', label: t('goals.sugar'), color: '#2E9BFF' },
  { value: 'fiber', label: t('goals.fiber'), color: '#34C759' },
  { value: 'sodium', label: t('goals.sodium'), color: '#FF922E' },
];

export function buildQuestions(lang: Lang): Question[] {
  const base = (id: QuestionId, kind: QuestionKind): Question => ({
    id,
    kind,
    question: t(ASK[id] as 'onboarding.ask.gender'),
    color: COLOR[id],
  });

  return [
    {
      ...base('gender', 'choice'),
      options: genderOptions.map((o) => ({ value: o.value, label: o.label[lang], Icon: o.Icon })),
    },
    { ...base('birthDate', 'date'), hint: t('onboarding.tap') },
    { ...base('heightCm', 'picker'), hint: t('onboarding.tap') },
    { ...base('weightKg', 'picker'), hint: t('onboarding.tap') },
    { ...base('goalWeightKg', 'picker'), hint: t('onboarding.tap') },
    { ...base('goalDate', 'date'), hint: t('onboarding.tap'), optional: true },
    {
      ...base('activity', 'choice'),
      options: activityOptions.map((o) => ({
        value: o.value,
        label: o.label[lang],
        description: o.body[lang],
        Icon: o.Icon,
      })),
    },
    {
      ...base('considerations', 'multi'),
      optional: true,
      allowsText: true,
      options: considerationOptions.map((o) => ({
        value: o.value,
        label: o.label[lang],
        Icon: o.Icon,
      })),
    },
    {
      ...base('micronutrients', 'multi'),
      optional: true,
      options: MICRO_OPTIONS,
    },
    { ...base('estimationBias', 'bias'), options: biasOptions(lang) },
  ];
}

/** What the user has answered so far — the profile is derived from this, never the reverse. */
export type Answers = Partial<Record<QuestionId, string | string[]>>;

export function isAnswered(answers: Answers, id: QuestionId): boolean {
  const value = answers[id];
  return Array.isArray(value) ? value.length > 0 : value !== undefined;
}

/**
 * The first unanswered question, skipping optional ones the user already
 * dismissed. Returns null when the script is finished.
 */
export function currentQuestion(questions: Question[], answers: Answers): Question | null {
  return questions.find((q) => !isAnswered(answers, q.id) && !(q.id in answers)) ?? null;
}

/**
 * Micronutrients are stored twice: a per-key record, and the boolean the goals
 * sheet and the AI prompt read. Deriving both here keeps them from drifting.
 */
function micronutrientPatch(picked: OnboardingMicronutrient[]) {
  const micronutrients = { ...micronutrientsFromTrack(false) };
  for (const key of picked) micronutrients[key] = true;
  return { micronutrients, trackMicronutrients: picked.length > 0 };
}

/** Folds the answers onto the defaults. Anything unanswered keeps its default. */
export function profileFromAnswers(
  answers: Answers,
  base: OnboardingProfile,
): OnboardingProfile {
  const one = (id: QuestionId): string | undefined => {
    const value = answers[id];
    return Array.isArray(value) ? value[0] : value;
  };
  const many = (id: QuestionId): string[] => {
    const value = answers[id];
    return Array.isArray(value) ? value : value ? [value] : [];
  };
  const num = (id: QuestionId): number | undefined => {
    const value = one(id);
    const parsed = value === undefined ? NaN : Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  return {
    ...base,
    gender: (one('gender') as OnboardingProfile['gender']) ?? base.gender,
    birthDate: one('birthDate') ?? base.birthDate,
    heightCm: num('heightCm') ?? base.heightCm,
    weightKg: num('weightKg') ?? base.weightKg,
    goalWeightKg: num('goalWeightKg') ?? base.goalWeightKg,
    goalDate: one('goalDate') ?? null,
    activity: (one('activity') as OnboardingProfile['activity']) ?? base.activity,
    considerations: many('considerations') as OnboardingProfile['considerations'],
    ...micronutrientPatch(many('micronutrients') as OnboardingMicronutrient[]),
    estimationBias: (num('estimationBias') ?? base.estimationBias) as OnboardingProfile['estimationBias'],
  };
}
