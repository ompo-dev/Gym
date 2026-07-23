import { defaultOnboardingProfile, buildOnboardingSummary } from '@/core/onboarding';

import {
  buildQuestions,
  currentQuestion,
  isAnswered,
  profileFromAnswers,
  type Answers,
} from './onboardingQuestions';

const questions = buildQuestions('pt-BR');
const base = { ...defaultOnboardingProfile(), goalDate: null };

test('the script covers every field the summary is sensitive to', () => {
  expect(questions.map((q) => q.id)).toEqual([
    'gender',
    'birthDate',
    'heightCm',
    'weightKg',
    'goalWeightKg',
    'goalDate',
    'activity',
    'weightUnit',
    'trainingLevel',
    'workoutGoal',
    'considerations',
    'micronutrients',
    'estimationBias',
    'environment',
    'equipment',
    'sportsLiked',
    'exercisesDisliked',
    'injuries',
    'foodsLiked',
    'foodsDisliked',
    'restrictions',
    'cookingSkill',
    'budget',
  ]);
});

test('walks forward one question at a time', () => {
  expect(currentQuestion(questions, {})?.id).toBe('gender');
  expect(currentQuestion(questions, { gender: 'male' })?.id).toBe('birthDate');
});

test('a skipped optional question does not block the script', () => {
  // Skipping writes an empty answer, which is different from never asking.
  const answers: Answers = { goalDate: [] };
  expect(isAnswered(answers, 'goalDate')).toBe(false);
  expect(currentQuestion(questions, answers)?.id).toBe('gender');
  expect(currentQuestion(questions.slice(5), answers)?.id).toBe('activity');
});

test('every question is answerable — closed sets have options, the rest open a sheet', () => {
  for (const question of questions) {
    if (question.kind === 'choice' || question.kind === 'multi' || question.kind === 'bias') {
      expect(question.options?.length).toBeGreaterThan(1);
    } else if (question.kind === 'list') {
      // Free text: no options and no sheet, the input is the answer.
      expect(question.options).toBeUndefined();
    } else {
      expect(question.hint).toBeTruthy();
    }
  }
});

test('answers fold into a profile the summary can actually use', () => {
  const answers: Answers = {
    gender: 'female',
    birthDate: '1999-03-10',
    heightCm: '162',
    weightKg: '70',
    goalWeightKg: '62',
    goalDate: '2026-12-01',
    activity: 'moderate',
    considerations: ['high-protein'],
    estimationBias: '3',
  };
  const profile = profileFromAnswers(answers, base);

  expect(profile).toMatchObject({
    gender: 'female',
    heightCm: 162,
    weightKg: 70,
    goalWeightKg: 62,
    activity: 'moderate',
    considerations: ['high-protein'],
    estimationBias: 3,
  });
  // The whole point of collecting these: a number that is not the default one.
  expect(buildOnboardingSummary(profile).calories).not.toBe(
    buildOnboardingSummary(base).calories,
  );
});

test('an abandoned answer keeps its default instead of becoming NaN', () => {
  const profile = profileFromAnswers({ weightKg: 'nonsense' }, base);
  expect(profile.weightKg).toBe(base.weightKg);
  expect(Number.isFinite(buildOnboardingSummary(profile).calories)).toBe(true);
});

test('multi answers replace, never accumulate duplicates', () => {
  const profile = profileFromAnswers({ considerations: ['athlete', 'low-carb'] }, base);
  expect(profile.considerations).toEqual(['athlete', 'low-carb']);
});

test('answers that need explaining carry their own description line', () => {
  // Tapping "Levemente ativo" has to reveal what that actually means, the way
  // the old wizard spelled it out on its own screen.
  const activity = questions.find((q) => q.id === 'activity');
  expect(activity?.options?.every((o) => Boolean(o.description))).toBe(true);

  const bias = questions.find((q) => q.id === 'estimationBias');
  expect(bias?.options?.every((o) => Boolean(o.description))).toBe(true);
});

test('considerations accept free text as well as chips', () => {
  expect(questions.find((q) => q.id === 'considerations')?.allowsText).toBe(true);
});

test('an answer can be changed after the fact', () => {
  // Re-picking must replace, not append — the note stays a single decision.
  const first = profileFromAnswers({ gender: 'male' }, base);
  const second = profileFromAnswers({ gender: 'female' }, base);
  expect(first.gender).toBe('male');
  expect(second.gender).toBe('female');
});

test('picking micronutrients turns them on in the goals sheet', () => {
  // FoodGoalsSheet reads `enabledMicronutrients(profile)`, which reads the
  // record — while the AI prompt reads the boolean. Both have to be set.
  const profile = profileFromAnswers({ micronutrients: ['fiber', 'sodium'] }, base);
  expect(profile.trackMicronutrients).toBe(true);
  expect(profile.micronutrients).toEqual({ sugar: false, fiber: true, sodium: true });
});

test('skipping micronutrients leaves them off everywhere', () => {
  const profile = profileFromAnswers({ micronutrients: [] }, base);
  expect(profile.trackMicronutrients).toBe(false);
  expect(Object.values(profile.micronutrients).some(Boolean)).toBe(false);
});

test('the bias scale reads as a scale — one colour per step', () => {
  const bias = questions.find((q) => q.id === 'estimationBias');
  const colors = bias?.options?.map((o) => o.color);
  expect(colors).toHaveLength(5);
  expect(new Set(colors).size).toBe(5);
});

test('micronutrient chips wear the colour of the ring they become', () => {
  const micros = questions.find((q) => q.id === 'micronutrients');
  expect(micros?.options?.every((o) => Boolean(o.color))).toBe(true);
});

test('an unanswered training field stays silent instead of claiming a default', () => {
  // Um perfil salvo antes destas perguntas nao pode *afirmar* que a pessoa e
  // iniciante — a linha some do prompt em vez de mentir.
  const profile = profileFromAnswers({}, base);
  expect(profile.trainingLevel).toBeUndefined();
  expect(profile.workoutGoal).toBeUndefined();
  // weightUnit e a excecao: 'kg' ja era o fallback do parser, nao afirma nada novo.
  expect(profile.weightUnit).toBe('kg');
});

test('answered training fields reach the profile', () => {
  const profile = profileFromAnswers(
    { weightUnit: 'lb', trainingLevel: 'advanced', workoutGoal: 'strength' },
    base,
  );
  expect(profile).toMatchObject({
    weightUnit: 'lb',
    trainingLevel: 'advanced',
    workoutGoal: 'strength',
  });
});

test('free-text lists split on commas and drop blanks', () => {
  const profile = profileFromAnswers(
    { injuries: ' ombro direito , joelho ,, ', foodsDisliked: 'jiló' },
    base,
  );
  expect(profile.injuries).toEqual(['ombro direito', 'joelho']);
  expect(profile.foodsDisliked).toEqual(['jiló']);
});

test('an untouched list is empty, never undefined', () => {
  // Every one of these is `.map`ped or `.join`ed downstream.
  const profile = profileFromAnswers({}, base);
  for (const key of [
    'equipment',
    'sportsLiked',
    'exercisesDisliked',
    'injuries',
    'foodsLiked',
    'foodsDisliked',
    'restrictions',
  ] as const) {
    expect(Array.isArray(profile[key])).toBe(true);
    expect(profile[key]).toHaveLength(0);
  }
});
