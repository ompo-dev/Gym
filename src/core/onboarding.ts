import { addDays, todayISO } from '@/core/date';

export type OnboardingGender = 'male' | 'female' | 'other' | 'private';
export type OnboardingActivity = 'sedentary' | 'light' | 'moderate' | 'high';
export type OnboardingBias = 0 | 1 | 2 | 3 | 4;
export type OnboardingConsideration =
  | 'high-protein'
  | 'low-carb'
  | 'athlete'
  | 'strength'
  | 'endurance'
  | 'vegetarian';

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
  };
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
): OnboardingSummary {
  const age = estimateAge(profile.birthDate, today);
  const bmr = estimateBmrHarrisBenedict(profile, age);
  const tdeeBase = bmr * activityMultiplier[profile.activity];
  const targetDays = Math.max(28, daysUntil(profile.goalDate, today));
  const deltaKg = round1(profile.goalWeightKg - profile.weightKg);
  const calorieAdjustment = clamp((deltaKg / targetDays) * 7700, -400, 250);

  let calories = Math.round(tdeeBase + calorieAdjustment + biasAdjustment(profile.estimationBias));
  if (profile.considerations.includes('athlete')) calories += 180;
  calories = clamp(calories, 1400, 4200);

  let proteinPerKg = profile.considerations.includes('strength') ? 1.8 : 1.6;
  if (profile.considerations.includes('high-protein')) proteinPerKg += 0.15;
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
  const lang = locale.toLowerCase().startsWith('en') ? 'en-US' : 'pt-BR';
  const summary = buildOnboardingSummary(profile, today);
  const considerations = profile.considerations.map((item) => considerationText[item][lang]);
  const notes = profile.notes.trim().slice(0, 240);

  return [
    lang === 'pt-BR' ? 'Perfil nutricional local do usuário:' : 'Local user nutrition profile:',
    `age=${summary.age}`,
    `gender=${profile.gender}`,
    `heightCm=${profile.heightCm}`,
    `currentWeightKg=${profile.weightKg}`,
    `goalWeightKg=${profile.goalWeightKg}`,
    `activity=${profile.activity}`,
    `targets=${summary.calories} kcal, protein ${summary.protein}g, carbs ${summary.carbs}g, fat ${summary.fat}g, water ${summary.waterMl}ml`,
    considerations.length ? `considerations=${considerations.join(', ')}` : '',
    notes ? `userNotes=${notes}` : '',
    `calorieEstimationBias=${profile.estimationBias}`,
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
