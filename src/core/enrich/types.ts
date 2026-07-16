import type { Domain } from '@/core/types';

export interface EnrichRequest {
  text: string;
  domain: Domain;
  /** e.g. the day's current exercise, to help the workout parser. */
  context?: string;
  /** Nutrition/profile context derived locally from onboarding. */
  userContext?: string;
  /** UI locale so the AI returns labels in the right language. */
  locale: string;
}

/** Envelope returned by the /api/enrich proxy. `data` is re-validated client-side. */
export type EnrichResponse =
  | { ok: true; data: unknown }
  | { ok: false; error: string };
