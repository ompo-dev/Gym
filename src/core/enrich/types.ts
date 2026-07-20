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

/**
 * `managed` bills through our key (the server env one); `own` sends the user's
 * key so the request never touches our quota. The mode is stored explicitly
 * rather than inferred from "has a key" because billing reads it, and because a
 * user may keep a key saved while temporarily switching back.
 */
export type ApiKeyMode = 'managed' | 'own';

export interface ApiKeys {
  mode: ApiKeyMode;
  /** Chat/parsing model key. */
  chat: string;
  /** Vision model key. Blank means "same as chat" — the common case. */
  image: string;
}

export interface EnrichKeys {
  chat: string;
  image?: string;
}

export interface EnrichRequest {
  text: string;
  domain: Domain;
  /** Only sent when the user opted into their own key. */
  keys?: EnrichKeys;
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
