import { useEffect } from 'react';

import type { FoodMediaAction, Domain, Entry } from '@/core/types';
import type { FoodData } from '@/domains/schemas';
import type { SavedMeal } from '@/data/SavedMealRepository';
import type { SavedExercise } from '@/data/SavedExerciseRepository';
import { useAppModalStore } from '@/store/useAppModalStore';

import { FoodEntryDetailSheet } from './FoodEntryDetailSheet';
import { FoodMediaCaptureSheet } from './FoodMediaCaptureSheet';
import { FoodNutritionEditSheet } from './FoodNutritionEditSheet';
import { SavedExercisesSheet } from './settings/SavedExercisesSheet';
import { SavedMealsSheet } from './settings/SavedMealsSheet';
import { SettingsSheet } from './SettingsSheet';

type CapturedFoodPhoto = {
  kind: Extract<FoodMediaAction, 'foodPhoto' | 'menuPhoto'>;
  uri: string;
  base64?: string;
  mimeType?: string;
};

interface AppModalHostProps {
  domain: Domain;
  entries: Entry[];
  selectedFoodMealSaved: boolean;
  reasoningLoadingId: string | null;
  onDeleteFoodEntry: (entry: Entry) => void;
  onSaveMeal: (entry: Entry) => Promise<void> | void;
  onSaveNutrition: (entry: Entry, text: string, data: FoodData) => Promise<void> | void;
  onAiEdit: (entry: Entry, instruction: string) => Promise<void> | void;
  onPhoto: (photo: CapturedFoodPhoto) => void;
  onBarcode: (code: string) => void;
  onFoodCaptureDismiss: () => void;
  onSaveBarcodeFood: (text: string, data: FoodData) => Promise<void> | void;
  onSelectSavedMeals: (meals: SavedMeal[]) => void;
  onSelectSavedExercises: (workouts: SavedExercise[]) => void;
}

export function AppModalHost({
  domain,
  entries,
  selectedFoodMealSaved,
  reasoningLoadingId,
  onDeleteFoodEntry,
  onSaveMeal,
  onSaveNutrition,
  onAiEdit,
  onPhoto,
  onBarcode,
  onFoodCaptureDismiss,
  onSaveBarcodeFood,
  onSelectSavedMeals,
  onSelectSavedExercises,
}: AppModalHostProps) {
  const activeModal = useAppModalStore((state) => state.stack.at(-1));
  const stack = useAppModalStore((state) => state.stack);
  const closeAppModal = useAppModalStore((state) => state.closeAppModal);
  const modal = activeModal?.domain === domain ? activeModal : null;
  const foodDetailModal = [...stack]
    .reverse()
    .find((item) =>
      item.domain === domain &&
      (item.id === 'food.entryDetail' ||
        item.id === 'food.actionMenu' ||
        item.id === 'food.aiEdit' ||
        item.id === 'food.nutritionEdit')
    );
  const foodEntry =
    foodDetailModal && 'entryId' in foodDetailModal
      ? entries.find((entry) => entry.id === foodDetailModal.entryId) ?? null
      : null;
  const foodData =
    foodEntry?.status === 'done' && foodEntry.data && 'items' in foodEntry.data
      ? (foodEntry.data as FoodData)
      : null;

  useEffect(() => {
    if (
      modal &&
      (modal.id === 'food.entryDetail' ||
        modal.id === 'food.actionMenu' ||
        modal.id === 'food.aiEdit' ||
        modal.id === 'food.nutritionEdit') &&
      !foodEntry
    ) {
      closeAppModal(modal.id);
    }
  }, [closeAppModal, foodEntry, modal]);

  if (!modal) return null;

  if (modal.id.startsWith('settings.')) {
    return (
      <SettingsSheet
        visible
        domain={domain}
      />
    );
  }

  if (modal.id === 'food.savedMealPicker') {
    return (
      <SavedMealsSheet
        visible
        onClose={() => closeAppModal('food.savedMealPicker')}
        onSelect={onSelectSavedMeals}
      />
    );
  }

  if (modal.id === 'workout.savedExercisePicker') {
    return (
      <SavedExercisesSheet
        visible
        onClose={() => closeAppModal('workout.savedExercisePicker')}
        onSelect={onSelectSavedExercises}
      />
    );
  }

  if (modal.id === 'food.nutritionEdit') {
    if (!foodEntry || !foodData) return null;
    return (
      <FoodNutritionEditSheet
        visible
        text={foodEntry.text}
        data={foodData}
        media={foodEntry.media}
        onClose={() => closeAppModal('food.nutritionEdit')}
        onSave={(text, data) => onSaveNutrition(foodEntry, text, data)}
      />
    );
  }

  if (
    modal.id === 'food.entryDetail' ||
    modal.id === 'food.actionMenu' ||
    modal.id === 'food.aiEdit'
  ) {
    return (
      <FoodEntryDetailSheet
        visible={foodEntry !== null}
        onClose={() => closeAppModal()}
        entry={foodEntry}
        onDelete={onDeleteFoodEntry}
        onSaveMeal={onSaveMeal}
        onSaveNutrition={onSaveNutrition}
        onAiEdit={onAiEdit}
        reasoningLoading={foodEntry?.id === reasoningLoadingId}
        initialMealSaved={selectedFoodMealSaved}
      />
    );
  }

  if (modal.id === 'food.mediaCapture') {
    return (
      <FoodMediaCaptureSheet
        visible
        mode={modal.mode}
        onClose={() => closeAppModal('food.mediaCapture')}
        onDismiss={onFoodCaptureDismiss}
        onPhoto={onPhoto}
        onBarcode={onBarcode}
      />
    );
  }

  if (modal.id === 'food.barcodeNutritionEdit') {
    return (
      <FoodNutritionEditSheet
        visible
        text={modal.draft.text}
        data={modal.draft.data}
        saveUnchanged
        onClose={() => closeAppModal('food.barcodeNutritionEdit')}
        onSave={onSaveBarcodeFood}
      />
    );
  }

  return null;
}
