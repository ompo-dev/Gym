import type { FoodData } from '@/domains/schemas';

import type { Domain, FoodMediaAction } from './types';

export const APP_MODAL_TRANSITION_MS = 10;

export type OnboardingPickerKind = "height" | "weight" | "goalWeight" | "goalDate";

export interface AppModalAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type AppModalId =
  | "day.root"
  | "settings.root"
  | "settings.nutritionGoals"
  | "settings.goalWeightPicker"
  | "settings.goalDatePicker"
  | "settings.healthProfile"
  | "settings.birthDatePicker"
  | "settings.healthProfilePicker"
  | "settings.weightControl"
  | "settings.registerWeight"
  | "settings.registerWeightPicker"
  | "settings.estimationBias"
  | "settings.workoutMonitor"
  | "settings.savedExercises"
  | "settings.savedMeals"
  | "settings.apiKeys"
  | "settings.routines"
  | "day.saveRoutine"
  | "settings.savedMealDetails"
  | "settings.savedMealActionMenu"
  | "settings.savedMealAiEdit"
  | "settings.savedMealNutritionEdit"
  | "food.goals"
  | "food.savedMealPicker"
  | "food.entryDetail"
  | "food.actionMenu"
  | "food.aiEdit"
  | "food.nutritionEdit"
  | "food.mediaCapture"
  | "food.barcodeNutritionEdit"
  | "food.mediaDraftTray"
  | "workout.progress"
  | "workout.savedExercisePicker"
  | "onboarding.root"
  | "onboarding.picker"
  | "onboarding.birthDatePicker"
  | "onboarding.goalDatePicker";

export const APP_MODAL_LABELS: Record<AppModalId, string> = {
  "day.root": "Notas",
  "settings.root": "Ajustes",
  "settings.nutritionGoals": "Metas nutricionais",
  "settings.goalWeightPicker": "Peso-alvo",
  "settings.goalDatePicker": "Data-alvo",
  "settings.birthDatePicker": "Data de nascimento",
  "settings.healthProfilePicker": "Seletor do perfil de saude",
  "settings.healthProfile": "Perfil de saúde",
  "settings.weightControl": "Controle de peso",
  "settings.registerWeight": "Registrar peso",
  "settings.registerWeightPicker": "Seletor de peso",
  "settings.estimationBias": "Viés de estimativa",
  "settings.workoutMonitor": "Monitoramento de treino",
  "settings.savedExercises": "Exercícios salvos",
  "settings.savedMeals": "Refeições salvas",
  "settings.apiKeys": "Chaves de API",
  "settings.routines": "Dias salvos",
  "day.saveRoutine": "Salvar o dia",
  "settings.savedMealDetails": "Detalhes da refeição salva",
  "settings.savedMealActionMenu": "Menu da refeição salva",
  "settings.savedMealAiEdit": "Editar refeição salva com IA",
  "settings.savedMealNutritionEdit": "Editar nutrição da refeição salva",
  "food.goals": "Metas do dia",
  "food.savedMealPicker": "Selecionar refeições salvas",
  "food.entryDetail": "Detalhes nutricionais",
  "food.actionMenu": "Menu da refeição",
  "food.aiEdit": "Editar com IA",
  "food.nutritionEdit": "Editar nutrição",
  "food.mediaCapture": "Capturar alimento",
  "food.barcodeNutritionEdit": "Nutrição por código de barras",
  "food.mediaDraftTray": "Mídias adicionadas",
  "workout.progress": "Progresso do treino",
  "workout.savedExercisePicker": "Selecionar exercícios salvos",
  "onboarding.root": "Onboarding",
  "onboarding.picker": "Seletor do onboarding",
  "onboarding.birthDatePicker": "Data de nascimento",
  "onboarding.goalDatePicker": "Data-alvo",
};

export const APP_MODAL_LINKS: Partial<
  Record<AppModalId, readonly AppModalId[]>
> = {
  "day.root": [
    "settings.root",
    "food.goals",
    "food.savedMealPicker",
    "food.entryDetail",
    "food.mediaCapture",
    "food.mediaDraftTray",
    "workout.progress",
    "workout.savedExercisePicker",
    "day.saveRoutine",
  ],
  "settings.root": [
    "settings.nutritionGoals",
    "settings.healthProfile",
    "settings.weightControl",
    "settings.estimationBias",
    "settings.workoutMonitor",
    "settings.savedExercises",
    "settings.savedMeals",
    "settings.apiKeys",
    "settings.routines",
  ],
  "settings.nutritionGoals": [
    "settings.healthProfile",
    "settings.goalWeightPicker",
    "settings.goalDatePicker",
  ],
  "settings.healthProfile": [
    "settings.birthDatePicker",
    "settings.healthProfilePicker",
    "settings.weightControl",
  ],
  "settings.weightControl": ["settings.registerWeight"],
  "settings.registerWeight": ["settings.registerWeightPicker"],
  "settings.savedMeals": ["settings.savedMealDetails"],
  "settings.savedMealDetails": [
    "settings.savedMealActionMenu",
    "settings.savedMealAiEdit",
    "settings.savedMealNutritionEdit",
  ],
  "settings.savedMealActionMenu": [
    "settings.savedMealAiEdit",
    "settings.savedMealNutritionEdit",
  ],
  "food.entryDetail": ["food.actionMenu", "food.aiEdit", "food.nutritionEdit"],
  "food.actionMenu": ["food.aiEdit", "food.nutritionEdit"],
  "food.mediaCapture": ["food.barcodeNutritionEdit"],
  "onboarding.root": [
    "onboarding.picker",
    "onboarding.birthDatePicker",
    "onboarding.goalDatePicker",
  ],
};

export function canOpenAppModal(from: AppModalId, to: AppModalId): boolean {
  return APP_MODAL_LINKS[from]?.includes(to) ?? false;
}

export interface BarcodeNutritionDraft {
  text: string;
  data: FoodData;
  imageUri?: string;
}

export type AppModal =
  | { id: "settings.root"; domain: Domain }
  | { id: "settings.nutritionGoals"; domain: Domain }
  | { id: "settings.goalWeightPicker"; domain: Domain }
  | { id: "settings.goalDatePicker"; domain: Domain }
  | { id: "settings.healthProfile"; domain: Domain }
  | { id: "settings.birthDatePicker"; domain: Domain }
  | {
      id: "settings.healthProfilePicker";
      domain: Domain;
      kind: Extract<OnboardingPickerKind, "height" | "weight">;
    }
  | { id: "settings.weightControl"; domain: Domain }
  | { id: "settings.registerWeight"; domain: Domain }
  | { id: "settings.registerWeightPicker"; domain: Domain }
  | { id: "settings.estimationBias"; domain: Domain }
  | { id: "settings.workoutMonitor"; domain: Domain }
  | { id: "settings.savedExercises"; domain: Domain }
  | { id: "settings.savedMeals"; domain: Domain }
  | { id: "settings.apiKeys"; domain: Domain }
  | { id: "settings.routines"; domain: Domain }
  | { id: "day.saveRoutine"; domain: Domain }
  | { id: "settings.savedMealDetails"; domain: Domain; mealId: string }
  | { id: "settings.savedMealActionMenu"; domain: Domain; mealId: string; anchor: AppModalAnchor | null }
  | { id: "settings.savedMealAiEdit"; domain: Domain; mealId: string }
  | { id: "settings.savedMealNutritionEdit"; domain: Domain; mealId: string }
  | { id: "food.goals"; domain: "food" }
  | { id: "food.savedMealPicker"; domain: "food" }
  | { id: "food.entryDetail"; domain: "food"; entryId: string }
  | { id: "food.actionMenu"; domain: "food"; entryId: string; anchor: AppModalAnchor | null }
  | { id: "food.aiEdit"; domain: "food"; entryId: string }
  | { id: "food.nutritionEdit"; domain: "food"; entryId: string }
  | { id: "food.mediaCapture"; domain: "food"; mode: FoodMediaAction }
  | { id: "food.barcodeNutritionEdit"; domain: "food"; draft: BarcodeNutritionDraft }
  | { id: "food.mediaDraftTray"; domain: "food" }
  | { id: "workout.progress"; domain: "workout" }
  | { id: "workout.savedExercisePicker"; domain: "workout" }
  | { id: "onboarding.picker"; domain: "onboarding"; kind: OnboardingPickerKind }
  | { id: "onboarding.birthDatePicker"; domain: "onboarding" }
  | { id: "onboarding.goalDatePicker"; domain: "onboarding" };
