import { useEffect, type ReactNode } from 'react';

import type { FoodMediaAction, Domain, Entry } from '@/core/types';
import type { AppModal } from '@/core/appModals';
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
  /** Already attached, so the camera strip and the tray agree on what exists. */
  mediaDrafts: { uri?: string }[];
  /** `imageUri` is the frame the code was read from — it survived only because
   *  JS ignores extra arguments; the type used to stop at `code`. */
  onBarcode: (code: string, imageUri?: string) => void;
  onFoodCaptureDismiss: () => void;
  onSaveBarcodeFood: (text: string, data: FoodData) => Promise<void> | void;
  onSelectSavedMeals: (meals: SavedMeal[]) => void;
  onSelectSavedExercises: (workouts: SavedExercise[]) => void;
}

const FOOD_ENTRY_MODALS: readonly string[] = [
  'food.entryDetail',
  'food.actionMenu',
  'food.aiEdit',
  'food.nutritionEdit',
];

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
  mediaDrafts,
  onBarcode,
  onFoodCaptureDismiss,
  onSaveBarcodeFood,
  onSelectSavedMeals,
  onSelectSavedExercises,
}: AppModalHostProps) {
  const stack = useAppModalStore((state) => state.stack);
  const closeAppModal = useAppModalStore((state) => state.closeAppModal);
  const activeModal = stack.at(-1);
  const modal = activeModal?.domain === domain ? activeModal : null;

  const entryOf = (item: AppModal): Entry | null =>
    'entryId' in item ? (entries.find((entry) => entry.id === item.entryId) ?? null) : null;
  const dataOf = (entry: Entry | null): FoodData | null =>
    entry?.status === 'done' && entry.data && 'items' in entry.data
      ? (entry.data as FoodData)
      : null;
  // The note this modal is about, gone from under it — deleting it must close
  // the sheet rather than leave an empty one open.
  const orphaned = Boolean(modal && FOOD_ENTRY_MODALS.includes(modal.id) && !entryOf(modal));

  useEffect(() => {
    if (modal && orphaned) closeAppModal(modal.id);
  }, [closeAppModal, modal, orphaned]);

  if (!modal) return null;

  // Settings owns its own slice of the stack and nests its own sheets.
  if (modal.id.startsWith('settings.')) {
    return <SettingsSheet visible domain={domain} />;
  }

  /**
   * One sheet per stack entry, each rendered *inside* the one below it. That is
   * the fridge behaviour: tapping a row does not swap sheets, it slides a new
   * one over a parent that stays put — and RN only stacks Modals nested in each
   * other's view tree (see `SheetFrame`'s `nested`).
   *
   * `null` means "this entry draws no sheet of its own" — an anchored menu, an
   * inline composer — and whatever is above it belongs to the sheet below.
   */
  const renderModal = (item: AppModal, nested: ReactNode): ReactNode | null => {
    switch (item.id) {
      case 'food.savedMealPicker':
        return (
          <SavedMealsSheet
            visible
            onClose={() => closeAppModal('food.savedMealPicker')}
            onSelect={onSelectSavedMeals}
          />
        );

      case 'workout.savedExercisePicker':
        return (
          <SavedExercisesSheet
            visible
            onClose={() => closeAppModal('workout.savedExercisePicker')}
            onSelect={onSelectSavedExercises}
          />
        );

      case 'food.entryDetail': {
        const entry = entryOf(item);
        return (
          <FoodEntryDetailSheet
            visible={entry !== null}
            onClose={() => closeAppModal()}
            entry={entry}
            onDelete={onDeleteFoodEntry}
            onSaveMeal={onSaveMeal}
            onSaveNutrition={onSaveNutrition}
            onAiEdit={onAiEdit}
            reasoningLoading={entry?.id === reasoningLoadingId}
            initialMealSaved={selectedFoodMealSaved}
            nested={nested}
          />
        );
      }

      // The action menu and the AI composer are drawn inside the detail sheet.
      case 'food.actionMenu':
      case 'food.aiEdit':
        return null;

      case 'food.nutritionEdit': {
        const entry = entryOf(item);
        const data = dataOf(entry);
        if (!entry || !data) return null;
        return (
          <FoodNutritionEditSheet
            visible
            text={entry.text}
            data={data}
            media={entry.media}
            onClose={() => closeAppModal('food.nutritionEdit')}
            onSave={(text, next) => onSaveNutrition(entry, text, next)}
          />
        );
      }

      case 'food.mediaCapture':
        return (
          <FoodMediaCaptureSheet
            visible
            mode={item.mode}
            onClose={() => closeAppModal('food.mediaCapture')}
            onDismiss={onFoodCaptureDismiss}
            onPhoto={onPhoto}
            onBarcode={onBarcode}
            drafts={mediaDrafts}
            nested={nested}
          />
        );

      case 'food.barcodeNutritionEdit':
        return (
          <FoodNutritionEditSheet
            visible
            text={item.draft.text}
            data={item.draft.data}
            saveUnchanged
            onClose={() => closeAppModal('food.barcodeNutritionEdit')}
            onSave={onSaveBarcodeFood}
          />
        );

      default:
        return null;
    }
  };

  return (
    <>
      {stack
        .filter((item) => item.domain === domain)
        .reduceRight<ReactNode>((nested, item) => renderModal(item, nested) ?? nested, null)}
    </>
  );
}
