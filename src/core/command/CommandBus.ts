import { Lru } from '@/core/cache/lru';
import type { EnrichRequest, EnrichResponse } from '@/core/enrich/types';
import type { Domain, Entry } from '@/core/types';
import { hashKey, newId, normalizeText } from '@/core/utils';
import { type EnrichData, schemaByDomain, type WorkoutData } from '@/domains/schemas';

import type { Command } from './Command';

const MAX_ATTEMPTS = 5;
const BACKOFF_BASE_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;
const CACHE_SIZE = 200;

/** Minimal surface the bus needs from the visible-day store — keeps it testable. */
export interface StorePort {
  getDay: (domain: Domain) => { date: string; entries: Entry[] };
  upsert: (domain: Domain, entry: Entry) => void;
  remove: (domain: Domain, id: string) => void;
}

export interface RepoPort {
  insert: (entry: Entry) => Promise<void>;
  update: (id: string, patch: Partial<Entry>) => Promise<void>;
  delete: (id: string) => Promise<void>;
}

export interface BusDeps {
  repo: RepoPort;
  enrichFn: (req: EnrichRequest) => Promise<EnrichResponse>;
  store: StorePort;
  locale?: string;
  onResolved?: () => void; // e.g. success haptic
  now?: () => number;
  schedule?: (fn: () => void, ms: number) => void;
}

export class CommandBus {
  private readonly undoStack: Command[] = [];
  private readonly cache = new Lru<string, EnrichData>(CACHE_SIZE);
  private readonly inflight = new Map<string, Promise<EnrichResponse>>();
  private readonly attempts = new Map<string, number>();
  private readonly cancelled = new Set<string>();

  constructor(private readonly deps: BusDeps) {}

  // ---- command dispatch + undo -------------------------------------------

  async run(cmd: Command): Promise<void> {
    await cmd.execute();
    this.undoStack.push(cmd);
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  async undo(): Promise<string | null> {
    const cmd = this.undoStack.pop();
    if (!cmd) return null;
    await cmd.undo();
    return cmd.label;
  }

  // ---- public actions -----------------------------------------------------

  async addEntry(text: string, domain: Domain): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) return;
    const entry: Entry = {
      id: newId(),
      date: this.deps.store.getDay(domain).date,
      domain,
      text: trimmed,
      status: 'thinking',
      data: null,
      error: null,
      createdAt: this.now(),
    };
    await this.run(new AddEntryCommand(this, entry));
  }

  async deleteEntry(entry: Entry): Promise<void> {
    await this.run(new DeleteEntryCommand(this, entry));
  }

  /** Change an entry's text and re-enrich it (notes-block editing). */
  async editEntry(entry: Entry, newText: string): Promise<void> {
    const trimmed = newText.trim();
    if (!trimmed || trimmed === entry.text) return;
    await this.run(new EditEntryCommand(this, entry, trimmed));
  }

  /** Re-run enrichment for an entry that errored out. */
  retry(entry: Entry): void {
    this.attempts.delete(entry.id);
    this.cancelled.delete(entry.id);
    void this.setStatus(entry.domain, entry.id, 'thinking');
    this.enqueueEnrich(entry);
  }

  // ---- internals used by the commands ------------------------------------

  now(): number {
    return this.deps.now ? this.deps.now() : Date.now();
  }

  cancelEnrich(id: string): void {
    this.cancelled.add(id);
  }

  enqueueEnrich(entry: Entry): void {
    this.cancelled.delete(entry.id);
    void this.runEnrich(entry).catch(() => {
      /* handled inside runEnrich */
    });
  }

  async persistUpsert(domain: Domain, entry: Entry): Promise<void> {
    await this.deps.repo.insert(entry);
    this.deps.store.upsert(domain, entry);
  }

  async persistRemove(domain: Domain, id: string): Promise<void> {
    await this.deps.repo.delete(id);
    this.deps.store.remove(domain, id);
  }

  // ---- enrichment engine --------------------------------------------------

  private async runEnrich(entry: Entry): Promise<void> {
    const key = hashKey(entry.domain, normalizeText(entry.text));

    const cached = this.cache.get(key);
    if (cached) {
      await this.applyResolved(entry, cached);
      return;
    }

    const context =
      entry.domain === 'workout' ? this.lastExercise(entry.domain) : undefined;

    let promise = this.inflight.get(key);
    if (!promise) {
      promise = this.deps.enrichFn({
        text: entry.text,
        domain: entry.domain,
        context,
        locale: this.deps.locale ?? 'pt-BR',
      });
      this.inflight.set(key, promise);
    }

    try {
      const res = await promise;
      this.inflight.delete(key);
      if (this.cancelled.has(entry.id)) return;

      if (!res.ok) {
        await this.setError(entry.domain, entry.id, res.error);
        return;
      }
      const parsed = schemaByDomain[entry.domain].safeParse(res.data);
      if (!parsed.success) {
        await this.setError(entry.domain, entry.id, 'Could not read the AI response');
        return;
      }
      let data = parsed.data as EnrichData;
      if (entry.domain === 'workout') {
        data = this.fillExercise(entry.domain, data as WorkoutData);
      }
      this.cache.set(key, data);
      await this.applyResolved(entry, data);
    } catch {
      this.inflight.delete(key);
      if (this.cancelled.has(entry.id)) return;
      await this.retryLater(entry);
    }
  }

  private async retryLater(entry: Entry): Promise<void> {
    const attempt = (this.attempts.get(entry.id) ?? 0) + 1;
    this.attempts.set(entry.id, attempt);
    if (attempt >= MAX_ATTEMPTS) {
      await this.setError(entry.domain, entry.id, 'Offline — tap to retry');
      return;
    }
    await this.setStatus(entry.domain, entry.id, 'queued');
    const delay = Math.min(BACKOFF_BASE_MS * 2 ** (attempt - 1), BACKOFF_MAX_MS);
    const fn = () => {
      if (this.cancelled.has(entry.id)) return;
      void this.runEnrich(entry).catch(() => {});
    };
    if (this.deps.schedule) this.deps.schedule(fn, delay);
    else setTimeout(fn, delay);
  }

  private async applyResolved(entry: Entry, data: EnrichData): Promise<void> {
    this.attempts.delete(entry.id);
    await this.patch(entry.domain, entry.id, { status: 'done', data, error: null });
    this.deps.onResolved?.();
  }

  private setStatus(domain: Domain, id: string, status: Entry['status']): Promise<void> {
    return this.patch(domain, id, { status });
  }

  private setError(domain: Domain, id: string, error: string): Promise<void> {
    return this.patch(domain, id, { status: 'error', error });
  }

  /** Update repo + reflect into the store only if the entry is on the visible day. */
  private async patch(domain: Domain, id: string, patch: Partial<Entry>): Promise<void> {
    await this.deps.repo.update(id, patch);
    const current = this.deps.store.getDay(domain).entries.find((e) => e.id === id);
    if (current) this.deps.store.upsert(domain, { ...current, ...patch });
  }

  private lastExercise(domain: Domain): string | undefined {
    const entries = this.deps.store.getDay(domain).entries;
    for (let i = entries.length - 1; i >= 0; i--) {
      const d = entries[i].data as WorkoutData | null;
      if (d && 'sets' in d && d.exercise) return d.exercise;
    }
    return undefined;
  }

  private fillExercise(domain: Domain, data: WorkoutData): WorkoutData {
    if (data.exercise) return data;
    const inherited = this.lastExercise(domain);
    return inherited ? { ...data, exercise: inherited } : data;
  }
}

// ---- concrete commands ----------------------------------------------------

class AddEntryCommand implements Command {
  readonly label = 'Add entry';
  constructor(
    private readonly bus: CommandBus,
    private readonly entry: Entry,
  ) {}

  async execute(): Promise<void> {
    await this.bus.persistUpsert(this.entry.domain, this.entry);
    this.bus.enqueueEnrich(this.entry);
  }

  async undo(): Promise<void> {
    this.bus.cancelEnrich(this.entry.id);
    await this.bus.persistRemove(this.entry.domain, this.entry.id);
  }
}

class DeleteEntryCommand implements Command {
  readonly label = 'Delete entry';
  constructor(
    private readonly bus: CommandBus,
    private readonly entry: Entry,
  ) {}

  async execute(): Promise<void> {
    this.bus.cancelEnrich(this.entry.id);
    await this.bus.persistRemove(this.entry.domain, this.entry.id);
  }

  async undo(): Promise<void> {
    await this.bus.persistUpsert(this.entry.domain, this.entry);
    if (this.entry.status !== 'done') this.bus.enqueueEnrich(this.entry);
  }
}

class EditEntryCommand implements Command {
  readonly label = 'Edit entry';
  private readonly before: Entry;
  constructor(
    private readonly bus: CommandBus,
    entry: Entry,
    private readonly newText: string,
  ) {
    this.before = { ...entry };
  }

  async execute(): Promise<void> {
    const updated: Entry = {
      ...this.before,
      text: this.newText,
      status: 'thinking',
      data: null,
      error: null,
    };
    await this.bus.persistUpsert(updated.domain, updated);
    this.bus.enqueueEnrich(updated);
  }

  async undo(): Promise<void> {
    this.bus.cancelEnrich(this.before.id);
    await this.bus.persistUpsert(this.before.domain, this.before);
  }
}
