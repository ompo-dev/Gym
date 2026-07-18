import type { EnrichData } from '@/domains/schemas';

export type Domain = 'food' | 'workout';

/** thinking = enrich in flight · queued = waiting for network · done · error */
export type EntryStatus = 'thinking' | 'queued' | 'done' | 'error';
export type EntryMediaKind = 'foodPhoto' | 'menuPhoto' | 'barcode';
export type FoodMediaAction = EntryMediaKind;

export interface EntryMediaAttachment {
  id: string;
  kind: EntryMediaKind;
  uri?: string;
  description: string;
}

export interface Entry {
  id: string;
  date: string; // local YYYY-MM-DD
  domain: Domain;
  text: string;
  media?: EntryMediaAttachment[];
  status: EntryStatus;
  data: EnrichData | null;
  error: string | null;
  createdAt: number;
}
