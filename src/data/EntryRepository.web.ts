import { log } from "@/core/log";
import { persistedPhotoFields } from "@/core/food/photo-cutouts";
import type {
  Domain,
  Entry,
  EntryMediaAttachment,
  EntryMediaKind,
  EntryStatus,
} from "@/core/types";
import { type EnrichData, schemaByDomain } from "@/domains/schemas";

import { readJson, writeJson } from "./webStorage";

const TABLE = "entries";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isDomain(value: unknown): value is Domain {
  return value === "food" || value === "workout" || value === "onboarding";
}

function isStatus(value: unknown): value is EntryStatus {
  return (
    value === "queued" ||
    value === "thinking" ||
    value === "done" ||
    value === "error"
  );
}

function parseData(domain: Domain, raw: unknown): EnrichData | null {
  if (!raw) return null;
  const parsed = schemaByDomain[domain].safeParse(raw);
  return parsed.success ? (parsed.data as EnrichData) : null;
}

function isMediaKind(value: unknown): value is EntryMediaKind {
  return value === "foodPhoto" || value === "menuPhoto" || value === "barcode";
}

function parseMedia(raw: unknown): EntryMediaAttachment[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const media = raw.flatMap((item): EntryMediaAttachment[] => {
    if (!isRecord(item)) return [];
    if (typeof item.id !== "string" || !isMediaKind(item.kind)) return [];
    return [
      {
        id: item.id,
        kind: item.kind,
        uri: typeof item.uri === "string" ? item.uri : undefined,
        description:
          typeof item.description === "string" ? item.description : "",
        ...persistedPhotoFields(item),
      },
    ];
  });
  return media.length ? media : undefined;
}

function toEntry(value: unknown): Entry | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "string" ||
    typeof value.date !== "string" ||
    !isDomain(value.domain) ||
    typeof value.text !== "string" ||
    !isStatus(value.status) ||
    typeof value.createdAt !== "number"
  ) {
    return null;
  }

  const data = parseData(value.domain, value.data);
  return {
    id: value.id,
    date: value.date,
    domain: value.domain,
    text: value.text,
    media: parseMedia(value.media),
    planned: value.planned === true ? true : undefined,
    completedAt: typeof value.completedAt === "number" ? value.completedAt : null,
    status: value.status === "done" && !data ? "error" : value.status,
    data,
    error: typeof value.error === "string" ? value.error : null,
    createdAt: value.createdAt,
  };
}

function readEntries(): Entry[] {
  const raw = readJson<unknown[]>(TABLE, []);
  if (!Array.isArray(raw)) return [];
  return raw.map(toEntry).filter((entry): entry is Entry => entry !== null);
}

function writeEntries(entries: Entry[]): void {
  writeJson(TABLE, entries);
}

function byCreatedAtAsc(a: Entry, b: Entry): number {
  return a.createdAt - b.createdAt;
}

function byDateDescCreatedAtDesc(a: Entry, b: Entry): number {
  return b.date.localeCompare(a.date) || b.createdAt - a.createdAt;
}

function applyEntryPatch(entry: Entry, patch: Partial<Entry>): Entry {
  const next: Entry = { ...entry };
  if (patch.status !== undefined) next.status = patch.status;
  if (patch.text !== undefined) next.text = patch.text;
  if (patch.media !== undefined) next.media = patch.media;
  if (patch.planned !== undefined) next.planned = patch.planned;
  if (patch.completedAt !== undefined) next.completedAt = patch.completedAt;
  if (patch.error !== undefined) next.error = patch.error;
  if (patch.data !== undefined) next.data = patch.data;
  return next;
}

export const EntryRepository = {
  async findByDate(domain: Domain, date: string): Promise<Entry[]> {
    return readEntries()
      .filter((entry) => entry.domain === domain && entry.date === date)
      .sort(byCreatedAtAsc);
  },

  async findAll(domain: Domain): Promise<Entry[]> {
    return readEntries()
      .filter((entry) => entry.domain === domain)
      .sort(byDateDescCreatedAtDesc);
  },

  async findPending(): Promise<Entry[]> {
    return readEntries()
      .filter(
        (entry) =>
          entry.status === "thinking" ||
          entry.status === "queued" ||
            (entry.status === "error" && ['enrich.offline', 'agent.authRequired', 'agent.offline'].includes(entry.error ?? '')),
      )
      .sort(byCreatedAtAsc);
  },

  async findSince(domain: Domain, sinceISO: string): Promise<Entry[]> {
    return readEntries()
      .filter((entry) => entry.domain === domain && entry.date >= sinceISO)
      .sort(byCreatedAtAsc);
  },

  async lastLoggedDate(): Promise<string | null> {
    const dates = readEntries()
      .filter((entry) => entry.domain === "food" || entry.domain === "workout")
      .map((entry) => entry.date)
      .sort((a, b) => b.localeCompare(a));
    return dates[0] ?? null;
  },

  async insert(entry: Entry): Promise<void> {
    log.db("entries.insert", {
      id: entry.id,
      domain: entry.domain,
      status: entry.status,
    });
    const others = readEntries().filter((item) => item.id !== entry.id);
    writeEntries([...others, entry]);
  },

  async insertMany(entries: Entry[]): Promise<void> {
    if (!entries.length) return;
    const byId = new Map(readEntries().map((entry) => [entry.id, entry]));
    entries.forEach((entry) => byId.set(entry.id, entry));
    writeEntries([...byId.values()]);
  },

  async update(id: string, patch: Partial<Entry>): Promise<void> {
    log.db("entries.update", { id, fields: Object.keys(patch) });
    writeEntries(
      readEntries().map((entry) =>
        entry.id === id ? applyEntryPatch(entry, patch) : entry,
      ),
    );
  },

  async delete(id: string): Promise<void> {
    log.db("entries.delete", { id });
    writeEntries(readEntries().filter((entry) => entry.id !== id));
  },

  async deleteByIdPrefix(prefix: string): Promise<number> {
    log.db("entries.deleteByIdPrefix", { prefix });
    const entries = readEntries();
    const next = entries.filter((entry) => !entry.id.startsWith(prefix));
    writeEntries(next);
    return entries.length - next.length;
  },
};

export type EntryRepositoryType = typeof EntryRepository;
