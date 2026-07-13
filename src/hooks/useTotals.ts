import { useMemo } from 'react';

import type { Entry } from '@/core/types';
import type { DomainConfig } from '@/domains/types';

/** Derives the day totals from resolved entries. Pure reduce — never stored. */
export function useTotals<TData, TTotals>(
  entries: Entry[],
  config: DomainConfig<TData, TTotals>,
): TTotals {
  return useMemo(
    () =>
      entries.reduce<TTotals>(
        (acc, e) =>
          e.status === 'done' && e.data ? config.addToTotals(acc, e.data as TData) : acc,
        config.emptyTotals,
      ),
    [entries, config],
  );
}
