import type { Domain, Entry, EntryStatus } from '@/core/types';
import { type EnrichData, schemaByDomain } from '@/domains/schemas';

import { getDb } from './db';

type Bind = string | number | null;

interface Row {
  id: string;
  date: string;
  domain: string;
  text: string;
  status: string;
  data: string | null;
  error: string | null;
  createdAt: number;
}

/** Validate persisted data against the CURRENT schema. Stale/corrupt rows
 * (e.g. from an older schema version) become un-enriched instead of crashing. */
function parseData(domain: Domain, raw: string | null): EnrichData | null {
  if (!raw) return null;
  try {
    const parsed = schemaByDomain[domain].safeParse(JSON.parse(raw));
    return parsed.success ? (parsed.data as EnrichData) : null;
  } catch {
    return null;
  }
}

function toEntry(r: Row): Entry {
  const domain = r.domain as Domain;
  const data = parseData(domain, r.data);
  const rawStatus = r.status as EntryStatus;
  // A "done" row whose data no longer validates is downgraded so it can be retried.
  const status: EntryStatus = rawStatus === 'done' && !data ? 'error' : rawStatus;
  return {
    id: r.id,
    date: r.date,
    domain,
    text: r.text,
    status,
    data,
    error: r.error,
    createdAt: r.createdAt,
  };
}

/** Repository over expo-sqlite. Query only the visible day → small memory footprint. */
export const EntryRepository = {
  async findByDate(domain: Domain, date: string): Promise<Entry[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<Row>(
      'SELECT * FROM entries WHERE domain = ? AND date = ? ORDER BY createdAt ASC',
      [domain, date],
    );
    return rows.map(toEntry);
  },

  async insert(entry: Entry): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      `INSERT OR REPLACE INTO entries
         (id, date, domain, text, status, data, error, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.id,
        entry.date,
        entry.domain,
        entry.text,
        entry.status,
        entry.data ? JSON.stringify(entry.data) : null,
        entry.error,
        entry.createdAt,
      ],
    );
  },

  async update(id: string, patch: Partial<Entry>): Promise<void> {
    const db = await getDb();
    const sets: string[] = [];
    const params: Bind[] = [];
    if (patch.status !== undefined) {
      sets.push('status = ?');
      params.push(patch.status);
    }
    if (patch.text !== undefined) {
      sets.push('text = ?');
      params.push(patch.text);
    }
    if (patch.error !== undefined) {
      sets.push('error = ?');
      params.push(patch.error);
    }
    if (patch.data !== undefined) {
      sets.push('data = ?');
      params.push(patch.data ? JSON.stringify(patch.data) : null);
    }
    if (sets.length === 0) return;
    params.push(id);
    await db.runAsync(`UPDATE entries SET ${sets.join(', ')} WHERE id = ?`, params);
  },

  async delete(id: string): Promise<void> {
    const db = await getDb();
    await db.runAsync('DELETE FROM entries WHERE id = ?', [id]);
  },
};

export type EntryRepositoryType = typeof EntryRepository;
