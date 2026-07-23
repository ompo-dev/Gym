/**
 * Every intent the engine can be asked for. One list, because the proxy route
 * validates the wire with it and the engine dispatches on it — when they were
 * two hand-written lists they drifted, and `recipe` and `workoutPlan` were
 * rejected at the door by a proxy that had never heard of them.
 */
import type { Domain } from '@/core/types';
import type { FoodData } from '@/domains/schemas';

export const ENRICH_INTENTS = [
  'parse',
  'foodAuto',
  'workoutAuto',
  'foodEdit',
  'purchase',
  'recipe',
  'workoutPlan',
] as const;

export type EnrichIntent = (typeof ENRICH_INTENTS)[number];

/**
 * No managed proxy and no user key: the request is unsendable, not failing.
 * Terminal on purpose — retrying cannot conjure a server, and the fix is in
 * Settings, not in the network.
 *
 * Lives here rather than next to `enrich()` so the badge components can read it
 * without dragging the store — and the SQLite layer behind it — into the tree.
 */
export const ENRICH_UNCONFIGURED = 'enrich.unconfigured';

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
  intent?: EnrichIntent;
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
