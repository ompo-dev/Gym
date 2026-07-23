import { Lru } from '@/core/cache/lru';
import { normalizeForEnrich } from '@/core/enrich/normalize';
import type { EnrichRequest, EnrichResponse } from '@/core/enrich/types';
import type { Domain, Entry, EntryMediaAttachment } from '@/core/types';
import { hashKey, newId, normalizeText } from '@/core/utils';
import { ONBOARDING_FIELDS, parseOnboardingText } from '@/domains/onboardingNotes';
import {
  type EnrichData,
  type FoodData,
  foodMultiSchema,
  type OnboardingData,
  schemaByDomain,
  type WorkoutData,
} from '@/domains/schemas';
import { attachPantryProvenance, type PantryItem } from '@/domains/pantry';
import { getWorkoutExerciseLine, parseWorkoutText } from '@/domains/workout';
import { planLabel, planToNotes, workoutPlanSchema } from '@/domains/workoutPlan';

import { CompositeCommand, type Command } from './Command';

const MAX_ATTEMPTS = 5;
const BACKOFF_BASE_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;
const CACHE_SIZE = 200;
// ponytail: undo is a toast affordance, not history. 20 is far past what any
// toast can still be offering; the cap just stops the stack growing forever.
const MAX_UNDO = 20;
const MAX_EXERCISE_NAME = 60;

/**
 * Entry.error is diagnostic only — no screen renders it, the UI keys off
 * `status === 'error'` alone. Stable keys, not prose, so nothing reads like a
 * user-facing string that was never translated.
 */
export const ENRICH_ERROR = {
  parse: 'enrich.parse',
  offline: 'enrich.offline',
  failed: 'enrich.failed',
} as const;

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
  getLocale?: () => string;
  getUserContext?: (domain: Domain) => string | undefined | Promise<string | undefined>;
  /**
   * The current fridge, so a meal can be linked to what it drew from and priced
   * with the real product. Injected, like everything else — the bus never
   * imports a repository, so a test can hand it a plain array.
   */
  getPantry?: () => Promise<PantryItem[]>;
  onResolved?: () => void; // e.g. success haptic
  /**
   * A note was consumed and replaced by what it asked for. The surface uses it
   * to let go of the focus that is about to belong to a deleted row — the user
   * asked for a plan, not for a keyboard over one.
   */
  onNoteReplaced?: () => void;
  now?: () => number;
  schedule?: (fn: () => void, ms: number) => void;
}

/**
 * O modelo agora ve a nota inteira; um eco das linhas de serie virando nome de
 * exercicio apareceria como titulo da nota. `workoutSchema` nao limita o campo,
 * entao o limite mora aqui — no unico ramo que consome IA.
 */
function cleanExerciseName(value: string | null | undefined): string | null {
  const name = value?.split('\n')[0].trim() ?? '';
  return name && name.length <= MAX_EXERCISE_NAME ? name : null;
}

export class CommandBus {
  private readonly undoStack: Command[] = [];
  private readonly cache = new Lru<string, EnrichData>(CACHE_SIZE);
  private readonly inflight = new Map<string, Promise<EnrichResponse>>();
  private readonly attempts = new Map<string, number>();
  private readonly cancelled = new Set<string>();

  constructor(private readonly deps: BusDeps) {}

  // ---- command dispatch + undo -------------------------------------------

  async run(cmd: Command): Promise<Command> {
    await cmd.execute();
    this.undoStack.push(cmd);
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
    return cmd;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /**
   * Undo the most recent command. Pass the command you mean to undo — the bus is
   * shared by both verticals, so without it an undo toast for a deleted food
   * entry would happily undo a workout entry added while the toast was up.
   */
  async undo(expected?: Command): Promise<string | null> {
    if (expected && this.undoStack.at(-1) !== expected) return null;
    const cmd = this.undoStack.pop();
    if (!cmd) return null;
    await cmd.undo();
    return cmd.label;
  }

  // ---- public actions -----------------------------------------------------

  /**
   * Builds the command without running it. Exists for `CompositeCommand`:
   * `AddEntryCommand` is private, and assembling the entry — id, trim,
   * createdAt, default day — has to keep happening in exactly one place.
   */
  createAddEntry(
    text: string,
    domain: Domain,
    media?: EntryMediaAttachment[],
    date?: string,
    /** Already known — skips enrichment entirely. See {@link AddEntryCommand}. */
    data?: EnrichData,
  ): Command | null {
    const trimmed = text.trim();
    if (!trimmed) return null;
    const entry: Entry = {
      id: newId(),
      date: date ?? this.deps.store.getDay(domain).date,
      domain,
      text: trimmed,
      media: media?.length ? media : undefined,
      status: data ? 'done' : 'thinking',
      data: data ?? null,
      error: null,
      createdAt: this.now(),
    };
    return new AddEntryCommand(this, entry);
  }

  /** `date` omitted = the visible day, which is every call the UI makes today. */
  async addEntry(
    text: string,
    domain: Domain,
    media?: EntryMediaAttachment[],
    date?: string,
  ): Promise<void> {
    const cmd = this.createAddEntry(text, domain, media, date);
    if (cmd) await this.run(cmd);
  }

  /** Returns the command so the caller can undo exactly this delete. */
  async deleteEntry(entry: Entry): Promise<Command> {
    return this.run(new DeleteEntryCommand(this, entry));
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

  /**
   * Onboarding fica de fora de proposito: essas notas sao o que *constroi* o
   * perfil, e devolver o perfil atual faria o modelo repetir valores default
   * como se o usuario os tivesse dito.
   *
   * O try/catch e o que mantem o ramo de treino infalivel: isto roda fora do
   * try de runEnrich, e um throw deixaria a nota presa em 'thinking' para
   * sempre, porque enqueueEnrich engole o erro.
   */
  private async userContext(domain: Domain): Promise<string | undefined> {
    if (domain === 'onboarding') return undefined;
    try {
      // Awaited because the food context now includes the pantry, which is
      // derived from stored notes rather than held in memory.
      return await this.deps.getUserContext?.(domain);
    } catch {
      return undefined;
    }
  }

  private async runEnrich(entry: Entry): Promise<void> {
    await this.runEnrichInner(entry);
  }

  private async runEnrichInner(entry: Entry): Promise<void> {
    const locale = this.deps.getLocale ? this.deps.getLocale() : this.deps.locale ?? 'pt-BR';
    // Meal, purchase or recipe — the model decides, from the note's meaning.
    // This used to be two local regex allowlists, and they had to know every
    // verb and every accent a person might type. They did not: "me de uma
    // receita com patinho" missed on a single missing accent and was logged as
    // food that was never eaten. The note goes to the model either way, so
    // asking it what the note *is* costs a field, not a request.
    const intent = entry.domain === 'food' ? 'foodAuto' : undefined;
    const userContext = await this.userContext(entry.domain);
    const normalizedCacheText =
      entry.domain === 'workout'
        ? normalizeForEnrich(entry.text, { domain: entry.domain, locale })
        : entry.text;
    const key = hashKey(
      entry.domain,
      `${locale}:${userContext ?? ''}:${normalizeText(normalizedCacheText)}`,
    );

    const cached = this.cache.get(key);
    if (cached) {
      await this.applyResolved(entry, cached);
      return;
    }

    // Parser-first, exactly like workout: the first note a new user ever writes
    // must land before they have given us anything — no key, no account, no
    // network. The AI only refines what the regexes already understood.
    if (entry.domain === 'onboarding') {
      const localData = parseOnboardingText(entry.text);

      let promise = this.inflight.get(key);
      if (!promise) {
        promise = this.deps.enrichFn(
          {
          text: entry.text,
          domain: entry.domain,
          context: undefined,
          userContext: undefined,
          locale,
        });
        this.inflight.set(key, promise);
      }

      try {
        const res = await promise;
        this.inflight.delete(key);
        if (this.cancelled.has(entry.id)) return;
        if (!res.ok) throw new Error(res.error);

        const parsed = schemaByDomain.onboarding.safeParse(res.data);
        if (!parsed.success) throw new Error('schema');

        // The model wins only where the parser found nothing: it is the polish
        // pass, so a hallucinated weight can never overwrite a stated one.
        const merged: OnboardingData = {
          capture: { ...parsed.data.capture, ...localData.capture },
          fields: ONBOARDING_FIELDS.filter(
            (field) =>
              localData.capture[field] !== undefined || parsed.data.capture[field] !== undefined,
          ),
        };
        this.cache.set(key, merged);
        await this.applyResolved(entry, merged);
      } catch {
        this.inflight.delete(key);
        if (this.cancelled.has(entry.id)) return;
        // Deliberately NOT cached. A fallback is what we show when the model
        // could not be reached or could not be understood — caching it makes
        // every later note with the same text resolve instantly to that same
        // failure, and turns the retry button into a lie.
        await this.applyResolved(entry, localData);
      }
      return;
    }

    if (entry.domain === 'workout') {
      const fallbackExercise = this.lastExercise(entry.domain, entry.date);
      const localData = parseWorkoutText(entry.text, {
        locale,
        fallbackExercise,
      });
      const exerciseText = getWorkoutExerciseLine(entry.text);

      if (!exerciseText) {
        this.cache.set(key, localData);
        await this.applyResolved(entry, localData);
        return;
      }

      let promise = this.inflight.get(key);
      if (!promise) {
        promise = this.deps.enrichFn(
          {
          // A nota inteira: as linhas de serie sao a melhor pista de qual
          // exercicio e ("30min" desambigua esteira de agachamento). Os numeros
          // continuam vindo do parser local — nada que a IA devolva em `sets`
          // e lido no merge abaixo.
          text: entry.text,
          domain: entry.domain,
          intent: 'workoutAuto',
          context: fallbackExercise,
          userContext,
          locale,
        });
        this.inflight.set(key, promise);
      }

      try {
        const res = await promise;
        this.inflight.delete(key);
        if (this.cancelled.has(entry.id)) return;

        if (!res.ok) {
          // Deliberately NOT cached. A fallback is what we show when the model
          // could not be reached or could not be understood — caching it makes
          // every later note with the same text resolve instantly to that same
          // failure, and turns the retry button into a lie.
          await this.applyResolved(entry, localData);
          return;
        }

        // The note was a request, not a log. The optimistic entry holding the
        // typed request is replaced by the plan it asked for — in ONE composite,
        // so a single undo puts the typed line back and takes the plan away.
        // Deliberately not cached: a plan is anchored to a date, and replaying
        // a cached one onto another day would silently write the wrong week.
        const plan = workoutPlanSchema.safeParse(res.data);
        if (plan.success) {
          const commands = planToNotes(plan.data, entry.date).flatMap((note) => {
            // Resolved on arrival: the model just told us the exercise and its
            // sets, so sending each generated note back for another round trip
            // would buy nothing and cost one request per exercise.
            const cmd = this.createAddEntry(
              note.text,
              note.domain,
              undefined,
              note.date,
              parseWorkoutText(note.text, { locale }),
            );
            return cmd ? [cmd] : [];
          });
          if (commands.length) {
            await this.run(
              new CompositeCommand(planLabel(plan.data), [
                ...commands,
                new DeleteEntryCommand(this, entry, false),
              ]),
            );
            this.deps.onNoteReplaced?.();
            return;
          }
        }

        const parsed = schemaByDomain.workout.safeParse(res.data);
        if (!parsed.success) {
          // Deliberately NOT cached. A fallback is what we show when the model
          // could not be reached or could not be understood — caching it makes
          // every later note with the same text resolve instantly to that same
          // failure, and turns the retry button into a lie.
          await this.applyResolved(entry, localData);
          return;
        }

        const aiData = parsed.data as WorkoutData;
        const data: WorkoutData = {
          ...localData,
          exercise: cleanExerciseName(aiData.exercise) ?? localData.exercise,
          kind: aiData.kind ?? localData.kind,
          // Anatomy only ever comes from the model — the local parser reads
          // numbers, not what a movement trains.
          primary: aiData.primary ?? localData.primary,
          synergists: aiData.synergists.length ? aiData.synergists : localData.synergists,
          stabilizers: aiData.stabilizers.length ? aiData.stabilizers : localData.stabilizers,
        };
        this.cache.set(key, data);
        await this.applyResolved(entry, data);
      } catch {
        this.inflight.delete(key);
        if (this.cancelled.has(entry.id)) return;
        // Deliberately NOT cached. A fallback is what we show when the model
        // could not be reached or could not be understood — caching it makes
        // every later note with the same text resolve instantly to that same
        // failure, and turns the retry button into a lie.
        await this.applyResolved(entry, localData);
      }
      return;
    }

    let promise = this.inflight.get(key);
    if (!promise) {
      promise = this.deps.enrichFn(
        {
        text: entry.text,
        domain: entry.domain,
        context: undefined,
        intent,
        userContext,
        locale,
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

      // Only food reaches here — onboarding and workout returned above. The
      // fridge is read once and shared by both the split and the single meal.
      const pantry = (await this.deps.getPantry?.()) ?? [];

      // One note that was several actions. "comprei 3 e comi 4" comes back as
      // `notes[]`, each its own note, exactly as a workout plan explodes into
      // one note per exercise — one composite, so a single undo takes the whole
      // thing back. Not cached: a split is a one-off reading of this exact text.
      // Any `notes` wrapper explodes, even a single one: the alternative is a
      // parse error, since the single shapes do not know the `notes` key.
      const multi = foodMultiSchema.safeParse(res.data);
      if (multi.success) {
        const commands = multi.data.notes.flatMap((note) => {
          const data =
            'items' in note.data
              ? { ...note.data, items: attachPantryProvenance(note.data.items, pantry) }
              : note.data;
          const cmd = this.createAddEntry(note.text, entry.domain, undefined, entry.date, data);
          return cmd ? [cmd] : [];
        });
        if (commands.length) {
          await this.run(
            new CompositeCommand(`${commands.length} notes`, [
              ...commands,
              new DeleteEntryCommand(this, entry, false),
            ]),
          );
          this.deps.onNoteReplaced?.();
          return;
        }
      }

      const parsed = schemaByDomain[entry.domain].safeParse(res.data);
      if (!parsed.success) {
        await this.setError(entry.domain, entry.id, ENRICH_ERROR.parse);
        return;
      }
      // A meal is linked to the fridge it drew from and repriced with the real
      // product; a purchase passes straight through. `attachPantryProvenance`
      // is a no-op with an empty pantry, so a first-ever note behaves as before.
      const parsedData = parsed.data as EnrichData;
      const data =
        'items' in parsedData
          ? ({ ...parsedData, items: attachPantryProvenance(parsedData.items, pantry) } as FoodData)
          : parsedData;
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
      await this.setError(entry.domain, entry.id, ENRICH_ERROR.offline);
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

  private lastExercise(domain: Domain, date: string): string | undefined {
    const day = this.deps.store.getDay(domain);
    // The fallback means "the previous set of this session". Outside the
    // visible day there is no session in memory to inherit from, and today's
    // is not it — a week-long plan would otherwise be born with today's
    // exercise on every one of its days.
    if (day.date !== date) return undefined;
    const entries = day.entries;
    for (let i = entries.length - 1; i >= 0; i--) {
      const d = entries[i].data as WorkoutData | null;
      if (d && 'sets' in d && d.exercise) return d.exercise;
    }
    return undefined;
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
    // A note born resolved has nothing left to ask. Enriching it anyway is how
    // a plan turned into one AI round trip *per exercise* — and, when the model
    // read a generated note as another plan request, into an endless one.
    if (this.entry.status === 'done') return;
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
    /**
     * Off when the note was consumed rather than deleted — a request that
     * became a workout plan. Resuming there would re-ask the model and rebuild
     * the very plan the undo was meant to remove, so undo would look broken.
     * The note comes back as 'error' instead: visible, deletable, and with the
     * retry that regenerates the plan on purpose rather than by accident.
     */
    private readonly resumeOnUndo = true,
  ) {}

  async execute(): Promise<void> {
    this.bus.cancelEnrich(this.entry.id);
    await this.bus.persistRemove(this.entry.domain, this.entry.id);
  }

  async undo(): Promise<void> {
    const restored: Entry = this.resumeOnUndo
      ? this.entry
      : { ...this.entry, status: 'error', error: ENRICH_ERROR.failed };
    await this.bus.persistUpsert(restored.domain, restored);
    if (this.resumeOnUndo && restored.status !== 'done') this.bus.enqueueEnrich(restored);
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
