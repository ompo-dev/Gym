import type { SQLiteDatabase } from 'expo-sqlite';

import { log } from '@/core/log';
import type { Domain, Entry, EntryMediaAttachment, EntryMediaKind, EntryStatus } from '@/core/types';
import { type EnrichData, schemaByDomain } from '@/domains/schemas';

import { getDb } from './db';

type Bind = string | number | null;

interface Row {
  id: string;
  date: string;
  domain: string;
  text: string;
  media: string | null;
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

function isMediaKind(value: unknown): value is EntryMediaKind {
  return value === 'foodPhoto' || value === 'menuPhoto' || value === 'barcode';
}

function parseMedia(raw: string | null): EntryMediaAttachment[] | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return undefined;
    const media = parsed.flatMap((item): EntryMediaAttachment[] => {
      if (!item || typeof item !== 'object') return [];
      const record = item as Record<string, unknown>;
      if (typeof record.id !== 'string' || !isMediaKind(record.kind)) return [];
      return [
        {
          id: record.id,
          kind: record.kind,
          uri: typeof record.uri === 'string' ? record.uri : undefined,
          description: typeof record.description === 'string' ? record.description : '',
        },
      ];
    });
    return media.length ? media : undefined;
  } catch {
    return undefined;
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
    media: parseMedia(r.media),
    status,
    data,
    error: r.error,
    createdAt: r.createdAt,
  };
}

function insertRow(db: SQLiteDatabase, entry: Entry): Promise<unknown> {
  return db.runAsync(
    `INSERT OR REPLACE INTO entries
       (id, date, domain, text, media, status, data, error, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.id,
      entry.date,
      entry.domain,
      entry.text,
      entry.media?.length ? JSON.stringify(entry.media) : null,
      entry.status,
      entry.data ? JSON.stringify(entry.data) : null,
      entry.error,
      entry.createdAt,
    ],
  );
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

  async findAll(domain: Domain): Promise<Entry[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<Row>(
      'SELECT * FROM entries WHERE domain = ? ORDER BY date DESC, createdAt DESC',
      [domain],
    );
    return rows.map(toEntry);
  },

  async insert(entry: Entry): Promise<void> {
    log.db('entries.insert', { id: entry.id, domain: entry.domain, status: entry.status });
    const db = await getDb();
    await insertRow(db, entry);
  },

  /** All-or-nothing insert. A half-applied batch would leave the day showing
   *  some of the meals the user picked and silently drop the rest. */
  async insertMany(entries: Entry[]): Promise<void> {
    if (!entries.length) return;
    const db = await getDb();
    await db.withTransactionAsync(async () => {
      for (const entry of entries) await insertRow(db, entry);
    });
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
    if (patch.media !== undefined) {
      sets.push('media = ?');
      params.push(patch.media.length ? JSON.stringify(patch.media) : null);
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
    log.db('entries.update', { id, fields: sets.map((s) => s.split(' ')[0]) });
    params.push(id);
    await db.runAsync(`UPDATE entries SET ${sets.join(', ')} WHERE id = ?`, params);
  },

  async delete(id: string): Promise<void> {
    log.db('entries.delete', { id });
    const db = await getDb();
    await db.runAsync('DELETE FROM entries WHERE id = ?', [id]);
  },
};

export type EntryRepositoryType = typeof EntryRepository;
