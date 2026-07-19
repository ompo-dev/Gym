import { APP_MODAL_LABELS, canOpenAppModal, type AppModalId } from './appModals';

describe('app modal registry', () => {
  it('knows every app modal label', () => {
    const modalIds = Object.keys(APP_MODAL_LABELS) as AppModalId[];
    expect(modalIds).toContain('day.root');
    expect(modalIds).toContain('settings.root');
    expect(modalIds).toContain('settings.goalWeightPicker');
    expect(modalIds).toContain('settings.goalDatePicker');
    expect(modalIds).toContain('settings.birthDatePicker');
    expect(modalIds).toContain('settings.healthProfilePicker');
    expect(modalIds).toContain('settings.registerWeightPicker');
    expect(modalIds).toContain('settings.estimationBias');
    expect(modalIds).toContain('settings.workoutMonitor');
    expect(modalIds).toContain('settings.savedWorkouts');
    expect(modalIds).toContain('settings.savedMealNutritionEdit');
    expect(modalIds).toContain('food.entryDetail');
    expect(modalIds).toContain('food.mediaDraftTray');
    expect(modalIds).toContain('workout.progress');
    expect(modalIds).toContain('workout.savedWorkoutPicker');
    expect(modalIds).toContain('onboarding.root');
    expect(modalIds).toContain('onboarding.picker');
  });

  it('allows only mapped modal chain transitions', () => {
    expect(canOpenAppModal('day.root', 'settings.root')).toBe(true);
    expect(canOpenAppModal('day.root', 'food.goals')).toBe(true);
    expect(canOpenAppModal('day.root', 'food.savedMealPicker')).toBe(true);
    expect(canOpenAppModal('day.root', 'food.entryDetail')).toBe(true);
    expect(canOpenAppModal('day.root', 'food.mediaCapture')).toBe(true);
    expect(canOpenAppModal('day.root', 'food.mediaDraftTray')).toBe(true);
    expect(canOpenAppModal('day.root', 'workout.progress')).toBe(true);
    expect(canOpenAppModal('day.root', 'workout.savedWorkoutPicker')).toBe(true);
    expect(canOpenAppModal('settings.root', 'settings.nutritionGoals')).toBe(true);
    expect(canOpenAppModal('settings.root', 'settings.estimationBias')).toBe(true);
    expect(canOpenAppModal('settings.root', 'settings.workoutMonitor')).toBe(true);
    expect(canOpenAppModal('settings.root', 'settings.savedWorkouts')).toBe(true);
    expect(canOpenAppModal('settings.nutritionGoals', 'settings.healthProfile')).toBe(true);
    expect(canOpenAppModal('settings.nutritionGoals', 'settings.goalWeightPicker')).toBe(true);
    expect(canOpenAppModal('settings.nutritionGoals', 'settings.goalDatePicker')).toBe(true);
    expect(canOpenAppModal('settings.healthProfile', 'settings.birthDatePicker')).toBe(true);
    expect(canOpenAppModal('settings.healthProfile', 'settings.healthProfilePicker')).toBe(true);
    expect(canOpenAppModal('settings.registerWeight', 'settings.registerWeightPicker')).toBe(true);
    expect(canOpenAppModal('settings.savedMeals', 'settings.savedMealDetails')).toBe(true);
    expect(canOpenAppModal('settings.savedMealDetails', 'settings.savedMealActionMenu')).toBe(true);
    expect(canOpenAppModal('settings.savedMealActionMenu', 'settings.savedMealAiEdit')).toBe(true);
    expect(canOpenAppModal('settings.savedMealActionMenu', 'settings.savedMealNutritionEdit')).toBe(true);
    expect(canOpenAppModal('food.entryDetail', 'food.actionMenu')).toBe(true);
    expect(canOpenAppModal('food.actionMenu', 'food.aiEdit')).toBe(true);
    expect(canOpenAppModal('food.mediaCapture', 'food.barcodeNutritionEdit')).toBe(true);
    expect(canOpenAppModal('onboarding.root', 'onboarding.picker')).toBe(true);
    expect(canOpenAppModal('onboarding.root', 'onboarding.goalDatePicker')).toBe(true);
    expect(canOpenAppModal('settings.nutritionGoals', 'settings.registerWeight')).toBe(false);
  });
});
