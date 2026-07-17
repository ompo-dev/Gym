import type { Domain } from '@/core/types';
import type { FoodData } from '@/domains/schemas';

export interface EnrichMediaInput {
  id: string;
  kind: 'foodPhoto' | 'menuPhoto';
  mimeType?: string;
  base64: string;
  description?: string;
}

export interface EnrichMediaDescription {
  id: string;
  description: string;
}

export interface EnrichRequest {
  text: string;
  domain: Domain;
  intent?: 'parse' | 'foodEdit';
  currentFood?: FoodData;
  media?: EnrichMediaInput[];
  /** e.g. the day's current exercise, to help the workout parser. */
  context?: string;
  /** Nutrition/profile context derived locally from onboarding. */
  userContext?: string;
  /** UI locale so the AI returns labels in the right language. */
  locale: string;
}

/** Envelope returned by the /api/enrich proxy. `data` is re-validated client-side. */
export type EnrichResponse =
  | { ok: true; data: unknown; mediaDescriptions?: EnrichMediaDescription[] }
  | { ok: false; error: string };
