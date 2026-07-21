import {
  defaultOnboardingProfile,
  type OnboardingActivity,
  type OnboardingGender,
  type OnboardingProfile,
} from '@/core/onboarding';
import { todayISO } from '@/core/date';

/**
 * The local parser for onboarding notes — sibling of `parseWorkoutText`.
 *
 * Same contract, and for the same reason: a note must resolve without a network
 * round trip or an API key, so the very first thing a new user types works. The
 * AI can enrich afterwards; it is never what makes the note land.
 *
 * Only the six fields that actually move `buildOnboardingSummary` are parsed
 * here. The rest of `OnboardingProfile` has a defensible default and its own
 * screen in Settings — asking for them up front buys accuracy nobody can feel.
 */

/** A note yields a partial profile: one sentence rarely carries every field. */
export type OnboardingCapture = Partial<
  Pick<
    OnboardingProfile,
    'gender' | 'birthDate' | 'heightCm' | 'weightKg' | 'goalWeightKg' | 'activity'
  >
>;

export interface OnboardingNoteData {
  capture: OnboardingCapture;
  /** Field order as understood, so the row can echo it back in reading order. */
  fields: OnboardingField[];
}

export type OnboardingField = keyof OnboardingCapture;

/** The six the summary is actually sensitive to, in the order we ask for them. */
export const ONBOARDING_FIELDS: readonly OnboardingField[] = [
  'gender',
  'birthDate',
  'heightCm',
  'weightKg',
  'goalWeightKg',
  'activity',
] as const;

const NUM = String.raw`(\d+(?:[.,]\d+)?)`;

// Height in cm (170, 170cm, 1,75m, 1.75). Metres are the common Brazilian form,
// so a bare 1.x is read as metres and anything three-digit as centimetres.
const HEIGHT_CM_RE = new RegExp(String.raw`${NUM}\s*(?:cm\b|centimetros?\b|cent[íi]metros?\b)`, 'i');
const HEIGHT_M_RE = new RegExp(String.raw`\b(1)\s*[.,]\s*(\d{1,2})\s*(?:m\b|metros?\b)?`, 'i');

// Weight. "quero/meta/objetivo/chegar" ahead of a number marks the goal weight,
// which is why the two are matched from the same sentence rather than globally.
const WEIGHT_RE = new RegExp(String.raw`${NUM}\s*(?:kg\b|quilos?\b|kilos?\b)`, 'gi');
const GOAL_HINT_RE =
  /\b(?:quero|queria|meta|objetivo|chegar|alcan[cç]ar|target|goal|want|reach|get to)\b/i;

const AGE_RE = new RegExp(
  String.raw`\b(?:tenho|idade|anos?|years?|year|age|sou)\b[^\d]{0,12}${NUM}|${NUM}\s*(?:anos?\b|years?\b|yo\b)`,
  'i',
);

const GENDER_RE: readonly [RegExp, OnboardingGender][] = [
  [/\b(?:homem|masculino|male|man|menino|rapaz)\b/i, 'male'],
  [/\b(?:mulher|feminino|female|woman|menina|moça|moca)\b/i, 'female'],
  [/\b(?:n[aã]o.?bin[aá]ri[oa]|outro|other|nonbinary|non-binary)\b/i, 'other'],
  [/\b(?:prefiro n[aã]o|privado|private|prefer not)\b/i, 'private'],
];

// Weekly training frequency is how people actually describe activity; the
// sedentary/light/moderate/high scale is jargon they would have to translate.
const PER_WEEK_RE = new RegExp(String.raw`${NUM}\s*(?:x|vezes?|times?)\s*(?:por|na|a|per|\/)?\s*semana|week`, 'i');

// Open-ended suffixes on purpose: "Levemente" and "Moderately" are the labels
// on the chips, and a trailing \b would reject exactly the words we offer.
const ACTIVITY_RE: readonly [RegExp, OnboardingActivity][] = [
  [/\b(?:sedent[aá]r|parad[oa]|n[aã]o treino|nao treino|nothing)/i, 'sedentary'],
  [/\b(?:leve|pouco|[àa]s vezes|as vezes|light)/i, 'light'],
  [/\b(?:moderad|m[eé]dio|medio|moderate)/i, 'moderate'],
  [/\b(?:pesad|intens|todo dia|muito ativ|atleta|high|heavy|athlete|very active)/i, 'high'],
];

function num(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const value = Number(raw.replace(',', '.'));
  return Number.isFinite(value) ? value : undefined;
}

function activityFromFrequency(perWeek: number): OnboardingActivity {
  if (perWeek <= 0) return 'sedentary';
  if (perWeek <= 2) return 'light';
  if (perWeek <= 4) return 'moderate';
  return 'high';
}

/** Age is what the summary consumes; the exact day is never read back. */
export function birthDateFromAge(age: number, today = todayISO()): string {
  const [year, month, day] = today.split('-');
  return `${Number(year) - age}-${month}-${day}`;
}

function parseHeightCm(text: string): number | undefined {
  const cm = num(HEIGHT_CM_RE.exec(text)?.[1]);
  if (cm !== undefined && cm >= 100 && cm <= 250) return Math.round(cm);

  const metres = HEIGHT_M_RE.exec(text);
  if (metres) {
    const value = Number(`${metres[1]}.${metres[2]}`) * 100;
    if (value >= 100 && value <= 250) return Math.round(value);
  }
  return undefined;
}

function parseWeights(text: string): Pick<OnboardingCapture, 'weightKg' | 'goalWeightKg'> {
  const found: { value: number; index: number }[] = [];
  WEIGHT_RE.lastIndex = 0;
  for (let m = WEIGHT_RE.exec(text); m; m = WEIGHT_RE.exec(text)) {
    const value = num(m[1]);
    if (value !== undefined && value >= 30 && value <= 400) {
      found.push({ value, index: m.index });
    }
  }
  if (!found.length) return {};

  // One number is the current weight unless the sentence is clearly about a
  // target ("quero chegar em 85kg"), which is a whole note on its own.
  if (found.length === 1) {
    const before = text.slice(0, found[0].index);
    return GOAL_HINT_RE.test(before) ? { goalWeightKg: found[0].value } : { weightKg: found[0].value };
  }

  // Two or more: the one preceded by a goal word is the target, else assume the
  // spoken order "estou com X, quero Y".
  const goalIndex = found.findIndex((w, i) => i > 0 && GOAL_HINT_RE.test(text.slice(found[i - 1].index, w.index)));
  const goalAt = goalIndex === -1 ? found.length - 1 : goalIndex;
  return {
    weightKg: found[goalAt === 0 ? 1 : 0].value,
    goalWeightKg: found[goalAt].value,
  };
}

function parseActivity(text: string): OnboardingActivity | undefined {
  const perWeek = num(PER_WEEK_RE.exec(text)?.[1]);
  if (perWeek !== undefined) return activityFromFrequency(perWeek);
  return ACTIVITY_RE.find(([re]) => re.test(text))?.[1];
}

/**
 * Never throws and never rejects a note: an unparseable sentence yields an
 * empty capture, which the row renders as "not understood" rather than an
 * error. A note the user has to fight is worse than one the AI refines later.
 */
export function parseOnboardingText(text: string, today = todayISO()): OnboardingNoteData {
  const capture: OnboardingCapture = {};

  const gender = GENDER_RE.find(([re]) => re.test(text))?.[1];
  if (gender) capture.gender = gender;

  const ageMatch = AGE_RE.exec(text);
  const age = num(ageMatch?.[1] ?? ageMatch?.[2]);
  if (age !== undefined && age >= 10 && age <= 110) {
    capture.birthDate = birthDateFromAge(Math.round(age), today);
  }

  const heightCm = parseHeightCm(text);
  if (heightCm !== undefined) capture.heightCm = heightCm;

  Object.assign(capture, parseWeights(text));

  const activity = parseActivity(text);
  if (activity) capture.activity = activity;

  return {
    capture,
    fields: ONBOARDING_FIELDS.filter((field) => capture[field] !== undefined),
  };
}

/** Folds every resolved note into one profile. Later notes win, so a correction is just another note. */
export function applyCaptures(captures: readonly OnboardingCapture[]): OnboardingProfile {
  return captures.reduce<OnboardingProfile>(
    (profile, capture) => ({ ...profile, ...capture }),
    { ...defaultOnboardingProfile(), goalDate: null },
  );
}

/** Which of the six are still missing — drives the dock and the closing move. */
export function missingFields(captures: readonly OnboardingCapture[]): OnboardingField[] {
  const seen = new Set(captures.flatMap((c) => Object.keys(c) as OnboardingField[]));
  return ONBOARDING_FIELDS.filter((field) => !seen.has(field));
}
