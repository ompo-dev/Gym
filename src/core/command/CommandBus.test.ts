import type { EnrichRequest, EnrichResponse } from '@/core/enrich/types';
import type { Domain, Entry } from '@/core/types';

import { MAX_NOTES_PER_DAY, NOTE_MAX_CHARS } from '@/constants/limits';
import { type BusDeps, CommandBus } from './CommandBus';

const TODAY = '2026-07-13';
// One macrotask is not enough to drain the enrich chain: a plan resolves, then
// expands into notes, then deletes its own draft — each with its own persist
// await. A test that acted after a single tick was asserting on a half-applied
// state the app never actually shows.
const flush = async () => {
  for (let i = 0; i < 10; i += 1) await new Promise((r) => setTimeout(r, 0));
};

const foodOk = (): EnrichResponse => ({
  ok: true,
  data: { items: [{ label: 'burger', calories: 620, protein: 30, carbs: 40, fat: 35 }] },
});

const workoutOk = () => ({ exercise: 'Supino reto', kind: 'série' });

function harness(
  enrichFn: (req: EnrichRequest) => Promise<EnrichResponse>,
  extraDeps: Partial<Pick<BusDeps, 'getUserContext' | 'getPantry' | 'isOffline' | 'onOffline'>> = {},
) {
  const day: Record<Domain, { date: string; entries: Entry[] }> = {
    food: { date: TODAY, entries: [] },
    workout: { date: TODAY, entries: [] },
    onboarding: { date: TODAY, entries: [] },
  };
  const rows = new Map<string, Entry>();
  const scheduled: { fn: () => void; ms: number }[] = [];

  const store: BusDeps['store'] = {
    getDay: (d) => day[d],
    upsert: (d, e) => {
      // Mirrors useAppStore.ts:95 — the store holds only the visible day, so an
      // entry stamped with another date is dropped from memory but still
      // written to the repo below.
      if (e.date !== day[d].date) return;
      const arr = day[d].entries;
      const i = arr.findIndex((x) => x.id === e.id);
      if (i === -1) arr.push(e);
      else arr[i] = e;
    },
    remove: (d, id) => {
      day[d].entries = day[d].entries.filter((x) => x.id !== id);
    },
  };
  const repo: BusDeps['repo'] = {
    insert: async (e) => void rows.set(e.id, { ...e }),
    update: async (id, patch) => {
      const cur = rows.get(id);
      if (cur) rows.set(id, { ...cur, ...patch });
    },
    delete: async (id) => void rows.delete(id),
    // Mirrors EntryRepository.findPending: unfinished notes across every day.
    findPending: async () =>
      [...rows.values()].filter(
        (e) =>
          e.status === 'thinking' ||
          e.status === 'queued' ||
          (e.status === 'error' && e.error === 'enrich.offline'),
      ),
  };

  const bus = new CommandBus({
    repo,
    store,
    enrichFn,
    ...extraDeps,
    now: () => 1,
    schedule: (fn, ms) => scheduled.push({ fn, ms }),
  });
  return { bus, day, rows, scheduled };
}

test('add is optimistic then resolves to done with parsed data', async () => {
  const { bus, day } = harness(async () => foodOk());
  await bus.addEntry('in n out burger', 'food');
  expect(day.food.entries).toHaveLength(1); // optimistic, already visible

  await flush();
  const entry = day.food.entries[0];
  expect(entry.status).toBe('done');
  expect((entry.data as { items: { calories: number }[] }).items[0].calories).toBe(620);
});

test('add keeps media attachments after enrich resolves', async () => {
const media = [{ id: 'photo-1', kind: 'foodPhoto' as const, uri: 'file://meal.jpg', description: '' }];
  const { bus, day } = harness(async () => foodOk());
  await bus.addEntry('foto do alimento', 'food', media);

  expect(day.food.entries[0].media).toEqual(media);
  await flush();
  expect(day.food.entries[0].status).toBe('done');
  expect(day.food.entries[0].media).toEqual(media);
});

test('editing an entry re-enriches with the new text', async () => {
  const enrichFn = jest.fn(async () => foodOk());
  const { bus, day } = harness(enrichFn);
  await bus.addEntry('burger', 'food');
  await flush();

  await bus.editEntry(day.food.entries[0], 'salad');
  await flush();

  expect(day.food.entries[0].text).toBe('salad');
  expect(day.food.entries[0].status).toBe('done');
  expect(enrichFn).toHaveBeenCalledTimes(2); // burger, then salad
});

test('identical text is enriched only once (cache / in-flight dedup)', async () => {
  const enrichFn = jest.fn(async () => foodOk());
  const { bus } = harness(enrichFn);

  await bus.addEntry('burger', 'food');
  await flush();
  await bus.addEntry('burger', 'food');
  await flush();

  expect(enrichFn).toHaveBeenCalledTimes(1);
});

test('food enrich includes the local user nutrition context', async () => {
  const enrichFn = jest.fn(async () => foodOk());
  const { bus } = harness(enrichFn, {
    getUserContext: () => 'targets=2518 kcal, water 3450ml\nconsiderations=vegetarian',
  });

  await bus.addEntry('burger', 'food');
  await flush();

  expect(enrichFn).toHaveBeenCalledWith(
    expect.objectContaining({
      domain: 'food',
userContext: 'targets=2518 kcal, water 3450ml\nconsiderations=vegetarian',
    }));
});

test('food enrich preserves hydration returned by the AI', async () => {
  const { bus, day } = harness(async () => ({
    ok: true,
    data: {
      items: [{ label: 'agua', calories: 0, protein: 0, carbs: 0, fat: 0, waterMl: 500 }],
    },
  }));

  await bus.addEntry('500ml de agua', 'food');
  await flush();

  expect((day.food.entries[0].data as { items: { waterMl: number }[] }).items[0].waterMl).toBe(500);
});

test('undo removes the added entry from store and repo', async () => {
  const { bus, day, rows } = harness(async () => foodOk());
  await bus.addEntry('burger', 'food');
  await flush();

  await bus.undo();
  expect(day.food.entries).toHaveLength(0);
  expect(rows.size).toBe(0);
});

test('undo is bound to its command and ignores anything done after it', async () => {
  const { bus, day, rows } = harness(async () => foodOk());
  await bus.addEntry('burger', 'food');
  await flush();

  const deleted = day.food.entries[0];
  const deleteCommand = await bus.deleteEntry(deleted);
  await bus.addEntry('salad', 'food');
  await flush();

  // The undo toast for the delete is still on screen, but the user has since
  // added an entry. Undoing must not take the salad away.
  expect(await bus.undo(deleteCommand)).toBeNull();
  expect(day.food.entries).toHaveLength(1);
  expect(day.food.entries[0].text).toBe('salad');
  expect(rows.size).toBe(1);
});

test('network failure queues, then a retry resolves it', async () => {
  let calls = 0;
  const { bus, day, scheduled } = harness(async () => {
    calls += 1;
    if (calls === 1) throw new Error('offline');
    return foodOk();
  });

  await bus.addEntry('burger', 'food');
  await flush();
  expect(day.food.entries[0].status).toBe('queued');
  expect(scheduled).toHaveLength(1);

  scheduled[0].fn(); // simulate the backoff firing
  await flush();
  expect(day.food.entries[0].status).toBe('done');
});

test('AI data that fails schema validation marks the entry errored', async () => {
  const { bus, day } = harness(async () => ({ ok: true, data: { nope: true } }));
  await bus.addEntry('burger', 'food');
  await flush();
  expect(day.food.entries[0].status).toBe('error');
});

test('workout entries are parsed locally without calling the AI', async () => {
  const enrichFn = jest.fn(async () => foodOk());
  const { bus, day } = harness(enrichFn);

  await bus.addEntry('8x100\n95', 'workout');
  await flush();

  expect(enrichFn).not.toHaveBeenCalled();
  expect(day.workout.entries[0].status).toBe('done');
  expect(day.workout.entries[0].data).toEqual({
    exercise: null,
    synergists: [],
    stabilizers: [],
    kind: 'strength',
sets: [{ weight: 100, unit: 'kg', reps: 8 }],
  });
});

test('workout entries use AI to correct the exercise name but keep local set parsing', async () => {
  const enrichFn = jest.fn(async () => ({
    ok: true,
    data: { exercise: 'Supino reto', kind: 'série' },
  }));
  const { bus, day } = harness(enrichFn);

  await bus.addEntry('sipino reto\n8x100', 'workout');
  await flush();

  expect(enrichFn).toHaveBeenCalledWith(
    expect.objectContaining({ text: 'sipino reto\n8x100', domain: 'workout' }));
  expect(day.workout.entries[0].data).toEqual({
    exercise: 'Supino reto',
    synergists: [],
    stabilizers: [],
    kind: 'strength',
sets: [{ weight: 100, unit: 'kg', reps: 8 }],
  });
});

test('workout entries use AI to classify cardio while keeping local cardio metrics', async () => {
  const enrichFn = jest.fn(async () => ({
    ok: true,
    data: { exercise: 'Corrida', kind: 'cardio', sets: [] },
  }));
  const { bus, day } = harness(enrichFn);

  await bus.addEntry('corida\n1h/5km', 'workout');
  await flush();

  expect(enrichFn).toHaveBeenCalledWith(
    expect.objectContaining({ text: 'corida\n1h/5km', domain: 'workout' }));
  expect(day.workout.entries[0].data).toEqual({
    exercise: 'Corrida',
    synergists: [],
    stabilizers: [],
    kind: 'cardio',
    sets: [{ distanceMeters: 5000, durationSeconds: 3600 }],
  });
});

test('single-line cardio with distance and duration keeps both metrics', async () => {
  const enrichFn = jest.fn(async () => ({
    ok: true,
    data: { exercise: 'Corrida', kind: 'cardio', sets: [] },
  }));
  const { bus, day } = harness(enrichFn);

  await bus.addEntry('corrida 5km 30min', 'workout');
  await flush();

  const data = day.workout.entries[0].data as Record<string, unknown>;
  expect(data.exercise).toBe('Corrida');
  expect(data.kind).toBe('cardio');
  expect(data.sets).toEqual([{ distanceMeters: 5000, durationSeconds: 1800 }]);
});

// ---- onboarding domain ------------------------------------------------------

const ENRICH_DOWN = async (): Promise<EnrichResponse> => ({
  ok: false,
  error: 'enrich.unconfigured',
});

test('an onboarding note resolves with no key and no network', async () => {
  // The whole point of the domain: the very first note a new user writes must
  // land before they have given us anything.
  const { bus, day } = harness(ENRICH_DOWN);
  await bus.addEntry('homem, 25 anos, 1,75m e 98kg', 'onboarding');
  await flush();

  const entry = day.onboarding.entries[0];
  expect(entry.status).toBe('done');
  expect((entry.data as { capture: Record<string, unknown> }).capture).toMatchObject({
    gender: 'male',
    heightCm: 175,
    weightKg: 98,
  });
});

test('the model fills gaps but never overwrites what the user actually wrote', async () => {
  const { bus, day } = harness(async () => ({
    ok: true,
    data: {
      // The model contradicts the stated weight and adds a field the regexes missed.
      capture: { weightKg: 70, activity: 'high' },
fields: ['weightKg', 'activity'],
    },
  }));
  await bus.addEntry('98kg', 'onboarding');
  await flush();

  const capture = (day.onboarding.entries[0].data as { capture: Record<string, unknown> }).capture;
  expect(capture.weightKg).toBe(98);
  expect(capture.activity).toBe('high');
});

test('an onboarding note never ends in error', async () => {
  const { bus, day, scheduled } = harness(async () => {
    throw new Error('network down');
  });
  await bus.addEntry('bom dia', 'onboarding');
  await flush();

  const entry = day.onboarding.entries[0];
  expect(entry.status).toBe('done');
  expect(scheduled).toHaveLength(0); // no retry backoff for a note that already landed
});

// ---- contexto de perfil no enrich de treino ---------------------------------

test('workout enrich carries the user profile, food keeps its own context', async () => {
  const seen: Record<string, string | undefined> = {};
  const { bus } = harness(
    async (req) => {
      seen[req.domain] = req.userContext;
      return req.domain === 'food' ? foodOk() : { ok: true, data: workoutOk() };
    },
    { getUserContext: (domain) => `ctx-for-${domain}` },
  );

  await bus.addEntry('supino\n8x100', 'workout');
  await bus.addEntry('arroz', 'food');
  await flush();

  expect(seen.workout).toBe('ctx-for-workout');
  expect(seen.food).toBe('ctx-for-food');
});

test('onboarding notes never receive the profile back', async () => {
  // Essas notas sao o que constroi o perfil; devolve-lo faria o modelo repetir
  // defaults como se o usuario os tivesse dito.
  let seen: string | undefined = 'nao chamado';
  const { bus } = harness(
    async (req) => {
      seen = req.userContext;
      return { ok: false, error: 'enrich.unconfigured' };
    },
    { getUserContext: () => 'perfil' },
  );

  await bus.addEntry('98kg', 'onboarding');
  await flush();

  expect(seen).toBeUndefined();
});

test('a throwing getUserContext cannot break a workout note', async () => {
  // O ramo de treino nunca falha. userContext e calculado fora do try de
  // runEnrich, entao um throw aqui deixaria a nota presa em "thinking".
  const { bus, day } = harness(async () => ({ ok: true, data: workoutOk() }), {
    getUserContext: () => {
      throw new Error('perfil corrompido');
    },
  });

  await bus.addEntry('supino\n8x100', 'workout');
  await flush();

  expect(day.workout.entries[0].status).toBe('done');
});

test('an exercise name echoing the whole note is discarded', async () => {
  // O modelo ve a nota inteira agora; um eco das linhas de serie viraria titulo.
  const { bus, day } = harness(async () => ({
    ok: true,
    data: { ...workoutOk(), exercise: 'supino reto\n8x100\n8x95' },
  }));

  await bus.addEntry('supino\n8x100', 'workout');
  await flush();

  const data = day.workout.entries[0].data as { exercise: string | null };
  expect(data.exercise).toBe('supino reto');
});

test('an absurdly long exercise name falls back to the local one', async () => {
  const { bus, day } = harness(async () => ({
    ok: true,
    data: { ...workoutOk(), exercise: 'x'.repeat(61) },
  }));

  await bus.addEntry('supino\n8x100', 'workout');
  await flush();

  const data = day.workout.entries[0].data as { exercise: string | null };
  expect(data.exercise).toBe('supino');
});

// ---- escrita em outro dia ---------------------------------------------------

test('an entry can be written to a day other than the visible one', async () => {
  // "monte meu treino da semana" grava em 7 datas; o store so mostra o dia
  // visivel, mas o SQLite tem que receber todas.
  const { bus, day, rows } = harness(async () => ({ ok: true, data: workoutOk() }));

  await bus.addEntry('supino', 'workout', undefined, '2026-07-20');
  await flush();

  expect(day.workout.entries).toHaveLength(0); // fora do dia visivel
  expect([...rows.values()].map((e) => e.date)).toEqual(['2026-07-20']);
});

test('a note on another day does not inherit today exercise', async () => {
  // lastExercise significa "a serie anterior desta sessao". Sem o guard, os 7
  // dias de um plano nasceriam todos com o exercicio de hoje.
  const enrichFn = jest.fn(async () => ({ ok: true, data: workoutOk() }));
  const { bus } = harness(enrichFn);

  await bus.addEntry('supino reto', 'workout');
  await flush();
  enrichFn.mockClear();

  await bus.addEntry('8x100', 'workout', undefined, '2026-07-20');
  await flush();

  for (const call of enrichFn.mock.calls) {
    expect((call[0] as { context?: string }).context).toBeUndefined();
  }
});

test('createAddEntry refuses empty text without touching the stack', () => {
  const { bus } = harness(async () => foodOk());
  expect(bus.createAddEntry('   ', 'food')).toBeNull();
  expect(bus.canUndo).toBe(false);
});

// ---- roteamento decidido pelo modelo ---------------------------------------

// The app no longer guesses what a note is. Two regex allowlists used to, and
// they had to know every verb and every accent someone might type — "me de uma
// receita com patinho" missed on one missing accent and was logged as food that
// was never eaten. These tests pin the new contract: one intent leaves the
// device, and the model's answer decides what the note becomes.

test.each([
  ['me de uma receita com patinho', 'sem acento, um pedido de receita'],
  ['comprei meio quilo de patinho por 30', 'uma compra'],
  ['arroz e frango', 'uma refeicao comum'],
])('%s is sent for the model to classify, not classified here', async (text) => {
  const enrichFn = jest.fn(async () => foodOk());
  const { bus } = harness(enrichFn, { getUserContext: () => 'restrictions=lactose' });

  await bus.addEntry(text, 'food');
  await flush();

  expect(enrichFn).toHaveBeenCalledWith(
    expect.objectContaining({
      intent: 'foodAuto',
      // On for every branch now. A purchase carrying the nutrition context is
      // a few wasted tokens; a recipe missing it ignores an allergy.
      userContext: 'restrictions=lactose',
    }));
});

test('a note the model reads as a purchase resolves as a purchase', async () => {
  const { bus, day } = harness(async () => ({
    ok: true as const,
    data: { purchase: [{ label: 'patinho', price: 30, grams: 500 }] },
  }));

  await bus.addEntry('comprei meio quilo de patinho por 30', 'food');
  await flush();

  const entry = day.food.entries[0];
  expect(entry.status).toBe('done');
  // Disjoint by construction, which is what every downstream `'items' in data`
  // guard relies on: a purchase must never carry calories.
  expect(entry.data && 'purchase' in entry.data).toBe(true);
  expect(entry.data && 'items' in entry.data).toBe(false);
});

test('a note the model reads as a meal resolves as a meal', async () => {
  const { bus, day } = harness(async () => foodOk());

  await bus.addEntry('me de uma receita com patinho', 'food');
  await flush();

  const entry = day.food.entries[0];
  expect(entry.status).toBe('done');
  expect(entry.data && 'items' in entry.data).toBe(true);
});

// "comprei 3 e comi 4" is two actions. The model returns one entry per action
// and the bus explodes them into real notes — a purchase (which stocks the
// fridge) and a meal (which counts) — so neither is lost inside the other.
test('a mixed note splits into one note per action', async () => {
  const { bus, day } = harness(async () => ({
    ok: true as const,
    data: {
      notes: [
        { text: 'comprei arroz', data: { purchase: [{ label: 'arroz', grams: 5000, price: 30 }] } },
        { text: 'comi frango', data: { items: [{ label: 'frango', calories: 300, protein: 40, carbs: 0, fat: 15 }] } },
      ],
    },
  }));

  await bus.addEntry('comprei 5kg de arroz e comi frango', 'food');
  await flush();

  expect(day.food.entries).toHaveLength(2);
  const [purchase, meal] = day.food.entries;
  expect(purchase.data && 'purchase' in purchase.data).toBe(true);
  expect(meal.data && 'items' in meal.data).toBe(true);
  // One composite, one undo: both split notes go, and the typed line comes back
  // — as error, so it is visible and retryable rather than silently re-split.
  await bus.undo();
  expect(day.food.entries).toHaveLength(1);
  expect(day.food.entries[0].text).toBe('comprei 5kg de arroz e comi frango');
  expect(day.food.entries[0].status).toBe('error');
});

// Two eating occasions in one note — "almocei arroz e frango e jantei arroz e
// feijao" — is TWO meals, both `items` (no purchase). The exact case the user
// hit: the model returns two note[] entries and the bus must explode them into
// two separate meals, each counting on its own.
test('two meals in one note split into two separate meal entries', async () => {
  const { bus, day } = harness(async () => ({
    ok: true as const,
    data: {
      notes: [
        { text: 'almocei arroz e frango', data: { items: [{ label: 'arroz', calories: 130, protein: 3, carbs: 28, fat: 0 }, { label: 'frango', calories: 165, protein: 31, carbs: 0, fat: 4 }] } },
        { text: 'jantei arroz e feijao', data: { items: [{ label: 'arroz', calories: 130, protein: 3, carbs: 28, fat: 0 }, { label: 'feijao', calories: 77, protein: 5, carbs: 14, fat: 0 }] } },
      ],
    },
  }));

  await bus.addEntry('almocei arroz e frango e jantei arroz e feijao', 'food');
  await flush();

  expect(day.food.entries).toHaveLength(2);
  const [lunch, dinner] = day.food.entries;
  expect(lunch.text).toBe('almocei arroz e frango');
  expect(dinner.text).toBe('jantei arroz e feijao');
  // Each carries only its own foods.
  expect(lunch.data && 'items' in lunch.data && lunch.data.items.some((i) => i.label === 'frango')).toBe(true);
  expect(dinner.data && 'items' in dinner.data && dinner.data.items.some((i) => i.label === 'feijao')).toBe(true);
});

// A single action must never be wrapped: a meal drawn from the fridge is linked
// and repriced with the real product the app injected.
test('a meal eaten from the fridge is linked and repriced', async () => {
  const { bus, day } = harness(
    async () => ({
      ok: true as const,
      data: { items: [{ label: 'arroz', quantity: 100, unit: 'g', calories: 999, protein: 0, carbs: 0, fat: 0 }] },
    }),
    {
      getPantry: async () => [
        {
          key: 'arroz',
          label: 'arroz',
          history: [],
          lastBoughtAt: 1,
          nutrition: { calories: 130, protein: 2, carbs: 28, fat: 0 },
        },
      ],
    },
  );

  await bus.addEntry('comi 100g de arroz', 'food');
  await flush();

  const data = day.food.entries[0].data;
  const eaten = data && 'items' in data ? data.items[0] : null;
  expect(eaten?.from).toEqual({ pantryItemId: 'arroz', label: 'arroz', grams: 100 });
  expect(eaten?.calories).toBe(130); // the real bag, not the model's 999
});

// ---- plano de treino --------------------------------------------------------

const planOk = () => ({
  ok: true as const,
  data: {
    days: [
      { dayOffset: 0, title: 'A', exercises: [{ exercise: 'Supino', sets: [{ weight: 80, reps: 8 }] }] },
      { dayOffset: 1, exercises: [{ exercise: 'Agachamento', sets: [{ weight: 100, reps: 5 }] }] },
    ],
  },
});

test('a workout note goes out for the model to classify too', async () => {
  const enrichFn = jest.fn(async () => ({ ok: true as const, data: workoutOk() }));
  const { bus } = harness(enrichFn, { getUserContext: () => 'injuriesAvoid=ombro direito' });

  await bus.addEntry('gere um teino full body pra hoje', 'workout');
  await flush();

  expect(enrichFn).toHaveBeenCalledWith(
    expect.objectContaining({
      intent: 'workoutAuto',
      // The whole ordering of hardness depends on this reaching the model.
      userContext: 'injuriesAvoid=ombro direito',
    }));
});

test('a note the model answers with a plan becomes real notes, undoable in one go', async () => {
  const { bus, day, rows } = harness(async () => planOk());

  // Misspelt on purpose: "teino" is what the user actually typed, and it is
  // exactly what the old regex could not match.
  await bus.addEntry('gere um teino full body pra hoje', 'workout');
  await flush();

  // The typed request is gone, replaced by what it asked for. Day 0 is visible;
  // day 1 lives only in the repo until the user navigates to it.
  expect(day.workout.entries).toHaveLength(1);
  expect(day.workout.entries[0].text).toContain('Supino');
  expect([...rows.values()].map((e) => e.date).sort()).toEqual([TODAY, '2026-07-14']);

  // One undo puts the typed line back and takes the whole plan away.
  await bus.undo();
  expect([...rows.values()].map((e) => e.text)).toEqual(['gere um teino full body pra hoje']);
});

test('a note the model answers with a log still parses as a log', async () => {
  const { bus, day } = harness(async () => ({ ok: true as const, data: workoutOk() }));

  await bus.addEntry('supino 80x8', 'workout');
  await flush();

  const entry = day.workout.entries[0];
  expect(entry.status).toBe('done');
  expect(entry.text).toBe('supino 80x8');
});

test('an empty plan leaves the typed note alone instead of erasing it', async () => {
  const { bus, day } = harness(async () => ({ ok: true as const, data: { days: [] } }));

  await bus.addEntry('monte um treino', 'workout');
  await flush();

  // Nothing usable came back, so the worst outcome — losing what the person
  // typed and showing nothing in its place — must not happen.
  expect(day.workout.entries).toHaveLength(1);
  expect(day.workout.entries[0].text).toBe('monte um treino');
});

// The fallback used to be cached. A note that failed once resolved from that
// cache forever after: the same text never reached the model again, retry did
// nothing, and asking for the same workout twice was guaranteed to fail twice.
test('a failed enrich does not poison the next attempt', async () => {
  let fail = true;
  const enrichFn = jest.fn(async () => {
    if (fail) return { ok: false as const, error: 'upstream' };
    return { ok: true as const, data: workoutOk() };
  });
  const { bus, day } = harness(enrichFn);

  await bus.addEntry('supino 80x8', 'workout');
  await flush();
  expect(enrichFn).toHaveBeenCalledTimes(1);

  fail = false;
  await bus.addEntry('supino 80x8', 'workout');
  await flush();

  // Same text, second note: it must ask again rather than replay the failure.
  expect(enrichFn).toHaveBeenCalledTimes(2);
  expect(day.workout.entries[1].status).toBe('done');
});

test('a successful enrich is still cached', async () => {
  const enrichFn = jest.fn(async () => ({ ok: true as const, data: workoutOk() }));
  const { bus } = harness(enrichFn);

  await bus.addEntry('supino 80x8', 'workout');
  await flush();
  await bus.addEntry('supino 80x8', 'workout');
  await flush();

  expect(enrichFn).toHaveBeenCalledTimes(1);
});

// ---- offline queue ----------------------------------------------------------

// Offline, the retry queue must NOT burn its five attempts and decay to "failed"
// — a plane trip would turn every food note into an error in ~30s. The note is
// parked as `queued`, no backoff timer is set, and the badge flag is raised.
test('offline: a failed note is parked as queued, no timer, badge on', async () => {
  const flags: boolean[] = [];
  const { bus, day, scheduled } = harness(
    async () => {
      throw new Error('offline');
    },
    { isOffline: () => true, onOffline: (o) => flags.push(o) },
  );

  await bus.addEntry('burger', 'food');
  await flush();

  expect(day.food.entries[0].status).toBe('queued');
  expect(scheduled).toHaveLength(0); // no backoff timer while offline
  expect(flags).toContain(true); // header badge turned on
});

test('reconnecting drains the parked note to done', async () => {
  let offline = true;
  const { bus, day } = harness(
    async () => {
      if (offline) throw new Error('offline');
      return foodOk();
    },
    { isOffline: () => offline },
  );

  await bus.addEntry('burger', 'food');
  await flush();
  expect(day.food.entries[0].status).toBe('queued');

  offline = false;
  await bus.resumePending(); // what the connectivity listener calls
  await flush();
  expect(day.food.entries[0].status).toBe('done');
});

// The distinction that must never break: only a THROW (network down) queues.
// A request that failed while ONLINE (server blip) keeps the bounded backoff.
test('online request failure still uses the retry backoff, not the offline park', async () => {
  const { bus, day, scheduled } = harness(
    async () => {
      throw new Error('server blip');
    },
    { isOffline: () => false },
  );

  await bus.addEntry('burger', 'food');
  await flush();

  expect(day.food.entries[0].status).toBe('queued');
  expect(scheduled).toHaveLength(1); // backoff timer, exactly as before
});

test('a request that comes back clears the offline flag', async () => {
  const flags: boolean[] = [];
  const { bus } = harness(async () => foodOk(), {
    isOffline: () => false,
    onOffline: (o) => flags.push(o),
  });

  await bus.addEntry('burger', 'food');
  await flush();

  expect(flags).toContain(false); // markOnline fired on the resolved request
});

// ---- resume pending (background/boot drain) ---------------------------------

// The in-memory retry queue dies with the process. A note left thinking/queued,
// or that gave up as error:offline, has nothing to resume it on the next launch
// — resumePending re-drives exactly those, skips media (retry loses the photos)
// and done rows, and is idempotent once they resolve.
test('resumePending re-drives stuck notes, skipping media and done', async () => {
  const enrichFn = jest.fn(async () => foodOk());
  const { bus, rows } = harness(enrichFn);

  const seed = (over: Partial<Entry> & Pick<Entry, 'id' | 'text' | 'status'>): Entry => ({
    date: TODAY,
    domain: 'food',
    media: undefined,
    data: null,
    error: null,
    createdAt: 1,
    ...over,
  });
  rows.set('a', seed({ id: 'a', text: 'burger', status: 'thinking' }));
  rows.set('b', seed({ id: 'b', text: 'salad', status: 'error', error: 'enrich.offline' }));
  rows.set(
    'c',
    seed({
      id: 'c',
      text: 'photo',
      status: 'thinking',
      media: [{ id: 'm', kind: 'foodPhoto', description: '' }],
    }),
  );
  rows.set('d', seed({ id: 'd', text: 'eaten', status: 'done' }));

  const count = await bus.resumePending();
  await flush();

  expect(count).toBe(2); // a + b only
  expect(enrichFn).toHaveBeenCalledTimes(2);
  expect(rows.get('a')?.status).toBe('done');
  expect(rows.get('b')?.status).toBe('done');
  expect(rows.get('c')?.status).toBe('thinking'); // media note left for the user
  expect(rows.get('d')?.status).toBe('done');

  // Nothing pending now → a second sweep is a no-op (idempotent).
  expect(await bus.resumePending()).toBe(0);
  expect(enrichFn).toHaveBeenCalledTimes(2);
});

// ---- usage caps -------------------------------------------------------------

test('addEntry returns false and adds nothing when combined food+workout count is at the daily cap', async () => {
  const { bus, day } = harness(async () => foodOk());
  // Fill to exactly the cap across both domains.
  day.food.entries = Array.from({ length: MAX_NOTES_PER_DAY - 2 }, (_, i) => ({
    id: `f${i}`, date: TODAY, domain: 'food' as const, text: 'food', status: 'done' as const, data: null, error: null, createdAt: 1,
  }));
  day.workout.entries = [
    { id: 'w1', date: TODAY, domain: 'workout' as const, text: 'w1', status: 'done' as const, data: null, error: null, createdAt: 1 },
    { id: 'w2', date: TODAY, domain: 'workout' as const, text: 'w2', status: 'done' as const, data: null, error: null, createdAt: 1 },
  ];

  const added = await bus.addEntry('burger', 'food');
  expect(added).toBe(false);
  // The 28 food + 2 workout entries stay — nothing new appended.
  expect(day.food.entries).toHaveLength(MAX_NOTES_PER_DAY - 2);
  expect(day.workout.entries).toHaveLength(2);
});

test('addEntry returns true and adds when below the daily cap', async () => {
  const { bus, day } = harness(async () => foodOk());
  day.food.entries = Array.from({ length: MAX_NOTES_PER_DAY - 1 }, (_, i) => ({
    id: `f${i}`, date: TODAY, domain: 'food' as const, text: 'food', status: 'done' as const, data: null, error: null, createdAt: 1,
  }));

  const added = await bus.addEntry('burger', 'food');
  expect(added).toBe(true);
  expect(day.food.entries).toHaveLength(MAX_NOTES_PER_DAY);
});

test('addEntry truncates a note longer than NOTE_MAX_CHARS to NOTE_MAX_CHARS', async () => {
  const { bus, day } = harness(async () => foodOk());
  const long = 'x'.repeat(200);
  await bus.addEntry(long, 'food');
  await flush();
  expect(day.food.entries[0].text.length).toBe(NOTE_MAX_CHARS);
  expect(day.food.entries[0].text).toBe('x'.repeat(NOTE_MAX_CHARS));
});
