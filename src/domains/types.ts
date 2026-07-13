import type { z } from 'zod';

import type { Domain } from '@/core/types';

/** One cell in the totals dock, e.g. { label: 'P', value: '59' }. UI-agnostic. */
export interface TotalItem {
  key: string;
  label: string;
  value: string;
  color?: string;
}

/**
 * Everything domain-specific about a vertical, as pure data/logic (no JSX).
 * `DayTemplate` is driven entirely by this, so Food and Workout reuse one engine.
 */
export interface DomainConfig<TData, TTotals> {
  id: Domain;
  title: string;
  placeholder: string;
  accent: string;
  schema: z.ZodType<TData>;
  /** One-line summary shown on a resolved entry, e.g. "620 cal". */
  formatResult: (data: TData) => string;
  emptyTotals: TTotals;
  addToTotals: (totals: TTotals, data: TData) => TTotals;
  describeTotals: (totals: TTotals) => TotalItem[];
}
