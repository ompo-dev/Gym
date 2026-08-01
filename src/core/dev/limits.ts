import { useAppStore } from '@/store/useAppStore';
import {
  MAX_NOTES_PER_DAY,
  MAX_PHOTOS_PER_DAY,
  MAX_PHOTOS_PER_NOTE,
  NOTE_MAX_CHARS,
} from '@/constants/limits';

export const LIMIT_KEYS = [
  'noteMaxChars',
  'maxNotesPerDay',
  'maxPhotosPerNote',
  'maxPhotosPerDay',
] as const;
export type LimitKey = (typeof LIMIT_KEYS)[number];
export type DevLimits = Partial<Record<LimitKey, number>>;

export const LIMIT_DEFAULTS: Record<LimitKey, number> = {
  noteMaxChars: NOTE_MAX_CHARS,
  maxNotesPerDay: MAX_NOTES_PER_DAY,
  maxPhotosPerNote: MAX_PHOTOS_PER_NOTE,
  maxPhotosPerDay: MAX_PHOTOS_PER_DAY,
};

/** Non-hook resolver for non-React code (CommandBus). Release ALWAYS = default. */
export function getLimit(key: LimitKey): number {
  if (!__DEV__) return LIMIT_DEFAULTS[key];
  return useAppStore.getState().devLimits[key] ?? LIMIT_DEFAULTS[key];
}

/** Hook for render-time reads (maxLength), reactive to dev changes. Release = default. */
export function useLimit(key: LimitKey): number {
  const devLimits = useAppStore((s) => s.devLimits);
  if (!__DEV__) return LIMIT_DEFAULTS[key];
  return devLimits[key] ?? LIMIT_DEFAULTS[key];
}
