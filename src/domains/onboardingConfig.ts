import type { ComponentType } from 'react';

import { activityOptions, genderOptions } from '@/components/onboarding/onboardingContent';
import { Colors } from '@/constants/theme';
import { t, type Lang } from '@/i18n';

import {
  ONBOARDING_FIELDS,
  type OnboardingCapture,
  type OnboardingField,
} from './onboardingNotes';
import { onboardingSchema, type OnboardingData } from './schemas';

import type { DomainConfig, TotalItem } from './types';

/**
 * Onboarding as a third note domain.
 *
 * The trick this config plays: `describeTotals` does not summarise nutrition or
 * volume, it reports which profile fields are known. So the dock the user will
 * read every day for calories spends the first minute filling up with their own
 * facts instead — same component, same position, same animation, no wizard
 * progress bar anywhere.
 */

/** Totals here are a set, not a sum: a field is known or it is not. */
export type OnboardingTotals = {
  known: readonly OnboardingField[];
};

const LABEL_KEY = {
  gender: 'onboarding.field.gender',
  birthDate: 'onboarding.field.age',
  heightCm: 'onboarding.field.height',
  weightKg: 'onboarding.field.weight',
  goalWeightKg: 'onboarding.field.goal',
  activity: 'onboarding.field.activity',
} as const satisfies Record<OnboardingField, string>;

const ACTIVITY_KEY = {
  sedentary: 'onboarding.activity.sedentary',
  light: 'onboarding.activity.light',
  moderate: 'onboarding.activity.moderate',
  high: 'onboarding.activity.high',
} as const;

const GENDER_KEY = {
  male: 'onboarding.gender.male',
  female: 'onboarding.gender.female',
  other: 'onboarding.gender.other',
  private: 'onboarding.gender.private',
} as const;

/** Echo a captured value back the way the person said it, not as raw data. */
export function formatCaptured(field: OnboardingField, capture: OnboardingCapture): string {
  switch (field) {
    case 'gender':
      return capture.gender ? t(GENDER_KEY[capture.gender]) : '';
    case 'birthDate':
      return capture.birthDate ? `${ageFrom(capture.birthDate)} ${t('onboarding.unit.years')}` : '';
    case 'heightCm':
      return capture.heightCm ? `${(capture.heightCm / 100).toFixed(2).replace('.', ',')} m` : '';
    case 'weightKg':
      return capture.weightKg ? `${capture.weightKg} kg` : '';
    case 'goalWeightKg':
      return capture.goalWeightKg ? `${capture.goalWeightKg} kg` : '';
    case 'activity':
      return capture.activity ? t(ACTIVITY_KEY[capture.activity]) : '';
  }
}

function ageFrom(birthDate: string): number {
  return new Date().getFullYear() - Number(birthDate.slice(0, 4));
}

export const onboardingConfig: DomainConfig<OnboardingData, OnboardingTotals> = {
  id: 'onboarding',
  get title() {
    return t('onboarding.title');
  },
  get placeholder() {
    return t('onboarding.placeholder');
  },
  accent: Colors.dark.accent,
  schema: onboardingSchema,
  formatResult: (data) =>
    data.fields.map((field) => formatCaptured(field, data.capture)).filter(Boolean).join(' · ') ||
    t('onboarding.notUnderstood'),
  emptyTotals: { known: [] },
  // Union, not sum — writing your weight twice does not make it two facts.
  addToTotals: (totals, data) => ({
    known: ONBOARDING_FIELDS.filter(
      (field) => totals.known.includes(field) || data.capture[field] !== undefined,
    ),
  }),
  describeTotals: (totals): TotalItem[] =>
    ONBOARDING_FIELDS.map((field) => ({
      key: field,
      label: t(LABEL_KEY[field]),
      value: totals.known.includes(field) ? '✓' : '—',
      color: totals.known.includes(field) ? FIELD_COLOR[field] : undefined,
    })),
};

/** True once every field the calorie target is sensitive to is known. */
export function isProfileComplete(totals: OnboardingTotals): boolean {
  return ONBOARDING_FIELDS.every((field) => totals.known.includes(field));
}

const ASK_KEY = {
  gender: 'onboarding.ask.gender',
  birthDate: 'onboarding.ask.birthDate',
  heightCm: 'onboarding.ask.heightCm',
  weightKg: 'onboarding.ask.weightKg',
  goalWeightKg: 'onboarding.ask.goalWeightKg',
  activity: 'onboarding.ask.activity',
} as const satisfies Record<OnboardingField, string>;

const EXAMPLE_KEY = {
  gender: 'onboarding.eg.gender',
  birthDate: 'onboarding.eg.birthDate',
  heightCm: 'onboarding.eg.heightCm',
  weightKg: 'onboarding.eg.weightKg',
  goalWeightKg: 'onboarding.eg.goalWeightKg',
  activity: 'onboarding.eg.activity',
} as const satisfies Record<OnboardingField, string>;

export interface OnboardingAskOption {
  value: string;
  label: string;
  /** The sentence picking this writes into the thread — a shortcut for typing. */
  text: string;
  Icon?: ComponentType<{ size?: number; strokeWidth?: number; color?: string }>;
}

export interface OnboardingAsk {
  field: OnboardingField;
  question: string;
  /** Shown as the composer placeholder, so the answer format is never a guess. */
  example: string;
  color: string;
  options?: readonly OnboardingAskOption[];
}

/** A question the person has already answered, kept visible in the thread. */
export interface OnboardingTurn {
  field: OnboardingField;
  ask: OnboardingAsk;
  /** Set only for closed-set answers — a typed weight has no chip to strike. */
  chosen?: string;
}

/**
 * One colour per fact, carried from the question chip all the way into the
 * totals dock — so the dock the user reads tomorrow is already colour-coded by
 * something they picked today.
 */
const FIELD_COLOR: Record<OnboardingField, string> = {
  gender: Colors.dark.carbs,
  birthDate: Colors.dark.water,
  heightCm: Colors.dark.protein,
  weightKg: Colors.dark.accent,
  goalWeightKg: Colors.dark.calories,
  activity: Colors.dark.fat,
};

/**
 * Options exist only where the answer is a closed set. Height and weight stay
 * typed: a picker of every centimetre would teach nothing, while typing "1,75m"
 * is the exact gesture the app asks for every day after this.
 */
function optionsFor(field: OnboardingField, lang: Lang): readonly OnboardingAskOption[] | undefined {
  if (field === 'gender') {
    return genderOptions.map((option) => ({
      value: option.value,
      label: option.label[lang],
      text: option.label[lang],
      Icon: option.Icon,
    }));
  }
  if (field === 'activity') {
    return activityOptions.map((option) => ({
      value: option.value,
      label: option.label[lang],
      // The label, not the description: "Treino moderado 3-5 vezes por semana"
      // would parse its own "5 vezes" back as `high`.
      text: option.label[lang],
      Icon: option.Icon,
    }));
  }
  return undefined;
}

export function fieldColor(field: OnboardingField): string {
  return FIELD_COLOR[field];
}

/**
 * The next thing to ask about — first field still missing, in reading order.
 *
 * A suggestion, not a gate: answering three things in one sentence just skips
 * ahead, because the question follows what is missing rather than a step index.
 * That is the whole difference between this and the wizard it replaced.
 */
export function nextAsk(
  missing: readonly OnboardingField[],
  lang: Lang = 'pt-BR',
): OnboardingAsk | null {
  const field = ONBOARDING_FIELDS.find((candidate) => missing.includes(candidate));
  if (!field) return null;
  return {
    field,
    question: t(ASK_KEY[field]),
    example: t(EXAMPLE_KEY[field]),
    color: FIELD_COLOR[field],
    options: optionsFor(field, lang),
  };
}
