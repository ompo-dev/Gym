import { pantryItems, type PantryItem } from '@/domains/pantry';

import { EntryRepository } from './EntryRepository';

/**
 * A read model, not a table. It lives in `data/` anyway so callers reach the
 * pantry the way they reach every other store, while the aggregation itself
 * stays in `domains/` where jest can run it without SQLite.
 *
 * ponytail: full scan of the food domain per open, through the same `findAll`
 * the routine and monitor screens already use. Materialize a `purchases` table
 * when the pantry needs state of its own — not before.
 */
export const PantryRepository = {
  async all(): Promise<PantryItem[]> {
    return pantryItems(await EntryRepository.findAll('food'));
  },
};
