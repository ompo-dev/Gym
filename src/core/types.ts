import type { EnrichData } from '@/domains/schemas';

/**
 * `onboarding` is a note domain like the other two, not a mode: the first-run
 * profile is captured by writing notes with the same engine, so the app the
 * user learns in the first minute is the app they keep using.
 */
export type Domain = 'food' | 'workout' | 'onboarding';

/** thinking = enrich in flight · queued = waiting for network · done · error */
export type EntryStatus = 'thinking' | 'queued' | 'done' | 'error';
export type EntryMediaKind = 'foodPhoto' | 'menuPhoto' | 'barcode';
export type FoodMediaAction = EntryMediaKind;

export interface FoodPhotoCutout {
  id: string;
  label: string;
  description: string;
  /** [top, left, bottom, right], normalized to the full photo (0..1000). */
  box: [number, number, number, number];
  /** Contour points [x, y], relative to the box (0..1000). */
  polygon: [number, number][];
}

export interface EntryMediaAttachment {
  id: string;
  kind: EntryMediaKind;
  uri?: string;
  description: string;
  width?: number;
  height?: number;
  cutouts?: FoodPhotoCutout[];
}

export interface Entry {
  id: string;
  date: string; // local YYYY-MM-DD
  domain: Domain;
  text: string;
  media?: EntryMediaAttachment[];
  planned?: boolean;
  completedAt?: number | null;
  status: EntryStatus;
  data: EnrichData | null;
  error: string | null;
  createdAt: number;
}
