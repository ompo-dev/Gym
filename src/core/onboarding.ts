import { addDays, todayISO } from '@/core/date';

export type OnboardingGender = 'male' | 'female' | 'other' | 'private';
export type OnboardingActivity = 'sedentary' | 'light' | 'moderate' | 'high';
export type OnboardingBias = 0 | 1 | 2 | 3 | 4;
export type OnboardingMicronutrient = 'sugar' | 'fiber' | 'sodium';
export type OnboardingConsideration =
  | 'high-protein'
  | 'low-carb'
  | 'athlete'
  | 'strength'
  | 'endurance'
  | 'vegetarian';

export type OnboardingWeightUnit = 'kg' | 'lb';
export type OnboardingTrainingLevel = 'beginner' | 'intermediate' | 'advanced';
export type OnboardingWorkoutGoal = 'hypertrophy' | 'strength' | 'endurance' | 'weightLoss';
export type OnboardingEnvironment = 'fullGym' | 'basicGym' | 'home' | 'outdoor';
export type OnboardingEquipment = 'dumbbells' | 'barbell' | 'machines' | 'bands' | 'kettlebell';
export type OnboardingCookingSkill = 'none' | 'basic' | 'confident';
export type OnboardingBudget = 'tight' | 'normal' | 'flexible';

export type OnboardingMicronutrients = Record<OnboardingMicronutrient, boolean>;

export interface OnboardingMicronutrientTargets {
  sugarG: number;
  fiberG: number;
  sodiumMg: number;
}

export interface OnboardingProfile {
  gender: OnboardingGender;
  birthDate: string;
  heightCm: number;
  weightKg: number;
  goalWeightKg: number;
  goalDate: string | null;
  activity: OnboardingActivity;
  considerations: OnboardingConsideration[];
  notes: string;
  estimationBias: OnboardingBias;
  trackMicronutrients: boolean;
  micronutrients: OnboardingMicronutrients;
  micronutrientTargets: OnboardingMicronutrientTargets;

  /**
   * Concrete default 'kg' because that is already the parser's fallback hint —
   * it states nothing new about the user. The two below are optional on
   * purpose: a default would make every profile saved before this existed
   * *claim* the person is a beginner. An old profile must stay silent, not
   * wrong, so the line drops out of the prompt instead of lying.
   */
  weightUnit: OnboardingWeightUnit;
  trainingLevel?: OnboardingTrainingLevel;
  workoutGoal?: OnboardingWorkoutGoal;

  /**
   * Free-text lists rather than closed unions: these end up concatenated into a
   * prompt, and a closed union would need an i18n label per item and still get
   * the user's actual injury wrong. `equipment` is the exception — five values
   * cover almost everything and a chip costs one tap against ~8s of typing.
   */
  environment?: OnboardingEnvironment;
  equipment: OnboardingEquipment[];
  sportsLiked: string[];
  exercisesDisliked: string[];
  injuries: string[];
  foodsLiked: string[];
  foodsDisliked: string[];
  restrictions: string[];
  cookingSkill?: OnboardingCookingSkill;
  budget?: OnboardingBudget;
}

export interface OnboardingSummary {
  age: number;
  bmr: number;
  tdee: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  waterMl: number;
  sugarG: number;
  fiberG: number;
  sodiumMg: number;
  deltaKg: number;
  targetDays: number;
}

const considerationText: Record<OnboardingConsideration, Record<'pt-BR' | 'en-US', string>> = {
  'high-protein': { 'pt-BR': 'alta proteína', 'en-US': 'high protein' },
  'low-carb': { 'pt-BR': 'baixo carboidrato', 'en-US': 'low carb' },
  athlete: { 'pt-BR': 'atleta', 'en-US': 'athlete' },
  strength: { 'pt-BR': 'treino de força', 'en-US': 'strength training' },
  endurance: { 'pt-BR': 'resistência/cardio', 'en-US': 'endurance/cardio' },
  vegetarian: { 'pt-BR': 'vegetariano', 'en-US': 'vegetarian' },
};

const activityMultiplier: Record<OnboardingActivity, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  high: 1.725,
};

/**
 * What a REAL training day adds to the target. Comes from the log
 * (src/domains/trainingLoad.ts), not from what the user declared at onboarding.
 */
export interface TrainingAdjustment {
  /** kcal to add, already net of what `activity` assumes. */
  calories: number;
  /** extra g/kg of protein on a day with actual lifting. */
  proteinPerKg: number;
}

export const noTrainingAdjustment: TrainingAdjustment = { calories: 0, proteinPerKg: 0 };

/**
 * How much TRAINING each declared level already bakes into the multiplier, in
 * kcal/day. Without this, someone who declared "high" and then trained would be
 * paid for the same session twice.
 *
 * ponytail: calibration table. The training slice of the gap up to 1.2 is an
 * estimate (the rest of that gap is NEAT), not a derivation. Tune here if the
 * target on a trained day comes out too generous.
 */
const assumedTrainingKcal: Record<OnboardingActivity, number> = {
  sedentary: 0,
  light: 120,
  moderate: 250,
  high: 400,
};

export function assumedDailyTrainingKcal(activity: OnboardingActivity): number {
  return assumedTrainingKcal[activity];
}

export const defaultMicronutrientTargets: OnboardingMicronutrientTargets = {
  sugarG: 25,
  fiberG: 25,
  sodiumMg: 2300,
};

export function micronutrientsFromTrack(enabled: boolean): OnboardingMicronutrients {
  return {
    sugar: enabled,
    fiber: enabled,
    sodium: enabled,
  };
}

export function defaultOnboardingProfile(): OnboardingProfile {
  return {
    gender: 'male',
    birthDate: '2004-07-23',
    heightCm: 175,
    weightKg: 98,
    goalWeightKg: 85,
    goalDate: addDays(todayISO(), 84),
    activity: 'light',
    considerations: ['strength'],
    notes: '',
    estimationBias: 2,
    trackMicronutrients: false,
    micronutrients: micronutrientsFromTrack(false),
    micronutrientTargets: defaultMicronutrientTargets,
    weightUnit: 'kg',
    equipment: [],
    sportsLiked: [],
    exercisesDisliked: [],
    injuries: [],
    foodsLiked: [],
    foodsDisliked: [],
    restrictions: [],
  };
}

export function normalizeOnboardingProfile(profile: Partial<OnboardingProfile>): OnboardingProfile {
  const base = defaultOnboardingProfile();
  const legacyTrack = Boolean(profile.trackMicronutrients);
  const micronutrients = {
    ...base.micronutrients,
    ...(profile.micronutrients ?? micronutrientsFromTrack(legacyTrack)),
  };
  return {
    ...base,
    ...profile,
    micronutrients,
    micronutrientTargets: {
      ...base.micronutrientTargets,
      ...profile.micronutrientTargets,
    },
    trackMicronutrients: Object.values(micronutrients).some(Boolean),
    // A profile saved before these existed has no arrays at all; without this
    // every `.map` downstream would throw on undefined.
    equipment: profile.equipment ?? base.equipment,
    sportsLiked: profile.sportsLiked ?? base.sportsLiked,
    exercisesDisliked: profile.exercisesDisliked ?? base.exercisesDisliked,
    injuries: profile.injuries ?? base.injuries,
    foodsLiked: profile.foodsLiked ?? base.foodsLiked,
    foodsDisliked: profile.foodsDisliked ?? base.foodsDisliked,
    restrictions: profile.restrictions ?? base.restrictions,
  };
}

export function enabledMicronutrients(profile: OnboardingProfile): OnboardingMicronutrient[] {
  const normalized = normalizeOnboardingProfile(profile);
  return (Object.keys(normalized.micronutrients) as OnboardingMicronutrient[]).filter(
    (key) => normalized.micronutrients[key],
  );
}

export function estimateAge(birthDate: string, today = todayISO()): number {
  const [birthYear, birthMonth, birthDay] = birthDate.split('-').map(Number);
  const [todayYear, todayMonth, todayDay] = today.split('-').map(Number);
  let age = todayYear - birthYear;
  if (todayMonth < birthMonth || (todayMonth === birthMonth && todayDay < birthDay)) age -= 1;
  return age;
}

export function buildOnboardingSummary(
  profile: OnboardingProfile,
  today = todayISO(),
  training: TrainingAdjustment = noTrainingAdjustment,
): OnboardingSummary {
  profile = normalizeOnboardingProfile(profile);
  const age = estimateAge(profile.birthDate, today);
  const bmr = estimateBmrHarrisBenedict(profile, age);
  const tdeeBase = bmr * activityMultiplier[profile.activity];
  const targetDays = Math.max(28, daysUntil(profile.goalDate, today));
  const deltaKg = round1(profile.goalWeightKg - profile.weightKg);
  const calorieAdjustment = clamp((deltaKg / targetDays) * 7700, -400, 250);

  let calories = Math.round(tdeeBase + calorieAdjustment + biasAdjustment(profile.estimationBias));
  if (profile.considerations.includes('athlete')) calories += 180;
  calories += training.calories;
  calories = clamp(calories, 1400, 4200);

  let proteinPerKg = profile.considerations.includes('strength') ? 1.8 : 1.6;
  if (profile.considerations.includes('high-protein')) proteinPerKg += 0.15;
  proteinPerKg += training.proteinPerKg;
  const protein = Math.round(profile.goalWeightKg * proteinPerKg);

  let fat = Math.round(profile.goalWeightKg * 0.75);
  if (profile.considerations.includes('low-carb')) fat += 12;

  let carbs = Math.round((calories - protein * 4 - fat * 9) / 4);
  if (profile.considerations.includes('endurance')) carbs += 28;
  if (profile.considerations.includes('low-carb')) carbs = Math.round(carbs * 0.82);
  carbs = Math.max(70, carbs);
  const waterMl = Math.round(clamp(profile.weightKg * 35, 1800, 4500) / 50) * 50;

  return {
    age,
    bmr,
    tdee: Math.round(tdeeBase),
    calories,
    protein,
    carbs,
    fat,
    waterMl,
    sugarG: profile.micronutrientTargets.sugarG,
    fiberG: profile.micronutrientTargets.fiberG,
    sodiumMg: profile.micronutrientTargets.sodiumMg,
    deltaKg,
    targetDays,
  };
}

export function buildOnboardingPromptContext(
  profile: OnboardingProfile | null,
  locale: string,
  today = todayISO(),
): string | undefined {
  if (!profile) return undefined;
  profile = normalizeOnboardingProfile(profile);
  const lang = locale.toLowerCase().startsWith('en') ? 'en-US' : 'pt-BR';
  const summary = buildOnboardingSummary(profile, today);
  const considerations = profile.considerations.map((item) => considerationText[item][lang]);
  const notes = profile.notes.trim().slice(0, 240);
  const trackedMicros = enabledMicronutrients(profile);
  const microTargets = trackedMicros.map((key) => {
    if (key === 'sugar') return `sugar <= ${summary.sugarG}g/day`;
    if (key === 'fiber') return `fiber >= ${summary.fiberG}g/day`;
    return `sodium <= ${summary.sodiumMg}mg/day`;
  });

  return [
    lang === 'pt-BR' ? 'Perfil nutricional local do usuário:' : 'Local user nutrition profile:',
    `age=${summary.age}`,
    `gender=${profile.gender}`,
    `heightCm=${profile.heightCm}`,
    `currentWeightKg=${profile.weightKg}`,
    `goalWeightKg=${profile.goalWeightKg}`,
    `activity=${profile.activity}`,
    `targets=${summary.calories} kcal, protein ${summary.protein}g, carbs ${summary.carbs}g, fat ${summary.fat}g, water ${summary.waterMl}ml`,
    trackedMicros.length ? `trackMicronutrients=${trackedMicros.join(', ')}` : '',
    microTargets.length ? `micronutrientTargets=${microTargets.join(', ')}` : '',
    considerations.length ? `considerations=${considerations.join(', ')}` : '',
    notes ? `userNotes=${notes}` : '',
    `calorieEstimationBias=${profile.estimationBias}`,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * O que um parser de treino consegue usar: quem e a pessoa, nao quantas calorias
 * ela deve comer. Deliberadamente sem alvos, macros e micronutrientes — o prompt
 * de treino nao tem o que fazer com eles e pagaria tokens por eles.
 */
export function buildWorkoutPromptContext(
  profile: OnboardingProfile | null,
  locale: string,
  today = todayISO(),
): string | undefined {
  if (!profile) return undefined;
  profile = normalizeOnboardingProfile(profile);
  const lang = locale.toLowerCase().startsWith('en') ? 'en-US' : 'pt-BR';
  const considerations = profile.considerations.map((item) => considerationText[item][lang]);
  const notes = profile.notes.trim().slice(0, 240);

  return [
    lang === 'pt-BR' ? 'Perfil local do usuario:' : 'Local user profile:',
    `age=${estimateAge(profile.birthDate, today)}`,
    `gender=${profile.gender}`,
    `heightCm=${profile.heightCm}`,
    `weightKg=${profile.weightKg}`,
    `activity=${profile.activity}`,
    `weightUnit=${profile.weightUnit}`,
    // Omitted when never answered: an old profile stays silent rather than
    // asserting a level the user never claimed.
    profile.trainingLevel ? `trainingLevel=${profile.trainingLevel}` : '',
    profile.workoutGoal ? `workoutGoal=${profile.workoutGoal}` : '',
    profile.environment ? `environment=${profile.environment}` : '',
    profile.equipment.length ? `equipment=${profile.equipment.join(', ')}` : '',
    profile.sportsLiked.length ? `sportsLiked=${profile.sportsLiked.join(', ')}` : '',
    profile.exercisesDisliked.length
      ? `exercisesDisliked=${profile.exercisesDisliked.join(', ')}`
      : '',
    // Hard constraint, always last so it reads as the final word.
    profile.injuries.length ? `injuriesAvoid=${profile.injuries.join(', ')}` : '',
    considerations.length ? `considerations=${considerations.join(', ')}` : '',
    notes ? `userNotes=${notes}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function getOnboardingStage(step: number): 0 | 1 | 2 {
  if (step <= 0) return 0;
  if (step <= 6) return 1;
  return 2;
}

function estimateBmrHarrisBenedict(profile: OnboardingProfile, age: number): number {
  const safeAge = Math.max(age, 18);
  const male =
    88.362 + 13.397 * profile.weightKg + 4.799 * profile.heightCm - 5.677 * safeAge;
  const female =
    447.593 + 9.247 * profile.weightKg + 3.098 * profile.heightCm - 4.33 * safeAge;
  if (profile.gender === 'male') return Math.round(male);
  if (profile.gender === 'female') return Math.round(female);
  return Math.round((male + female) / 2);
}

function biasAdjustment(bias: OnboardingBias): number {
  return [-120, -60, 0, 60, 120][bias] ?? 0;
}

function daysUntil(target: string | null, today: string): number {
  if (!target) return 84;
  const [targetYear, targetMonth, targetDay] = target.split('-').map(Number);
  const [todayYear, todayMonth, todayDay] = today.split('-').map(Number);
  const targetDate = new Date(targetYear, targetMonth - 1, targetDay);
  const todayDate = new Date(todayYear, todayMonth - 1, todayDay);
  return Math.round((targetDate.getTime() - todayDate.getTime()) / 86_400_000);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
