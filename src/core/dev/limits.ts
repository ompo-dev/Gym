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

/** Non-hook resolver for non-React code (CommandBus). */
export function getLimit(key: LimitKey): number {
  return useAppStore.getState().devLimits[key] ?? LIMIT_DEFAULTS[key];
}

/** Hook for render-time reads (maxLength), reactive to dev changes. */
export function useLimit(key: LimitKey): number {
  const devLimits = useAppStore((s) => s.devLimits);
  return devLimits[key] ?? LIMIT_DEFAULTS[key];
}
