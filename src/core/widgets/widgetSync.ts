import { ExtensionStorage } from '@bacons/apple-targets';
import { Platform } from 'react-native';

// Must match the App Group in app.json + targets/widget/expo-target.config.js.
export const APP_GROUP = 'group.com.ompinho.gymnotes';

const storage = Platform.OS === 'ios' ? new ExtensionStorage(APP_GROUP) : null;

export interface FoodWidgetSnapshot {
  calories: number;
  caloriesGoal: number;
  protein: number;
  proteinGoal: number;
  carbs: number;
  carbsGoal: number;
  fat: number;
  fatGoal: number;
  sugarG: number;
  sugarGoal: number;
  fiberG: number;
  fiberGoal: number;
  sodiumMg: number;
  sodiumGoal: number;
}

export interface WorkoutWidgetSnapshot {
  sets: number;
  volumeKg: number;
  durationSeconds: number;
  distanceMeters: number;
}

function write(key: string, value: Record<string, number>): void {
  if (!storage) return;
  try {
    storage.set(key, value);
    ExtensionStorage.reloadWidget();
  } catch {
    // No native module (Expo Go) or write failed — the widget keeps its last
    // snapshot. Never let widget syncing break the app.
  }
}

export function writeFoodWidget(snapshot: FoodWidgetSnapshot): void {
  write('food', { ...snapshot });
}

export function writeWorkoutWidget(snapshot: WorkoutWidgetSnapshot): void {
  write('workout', { ...snapshot });
}
