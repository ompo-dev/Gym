/* eslint-disable import/first -- jest.mock factories must precede the imports
   they replace; babel-jest hoists them above these imports at run time. */
/**
 * End-to-end of the diet flow, one seam below the screen.
 *
 * The real singleton `bus`, the real `useAppStore`, the real pantry derivation
 * and provenance all run together — only the SQLite repository is swapped for an
 * in-memory Map, and only the network `enrich` is canned. Nothing here is a
 * hand-rolled reimplementation of the code under test: a note goes in, the same
 * command bus routes and resolves it, the same store reflects it, and the same
 * `pantryItems` reads it back.
 *
 * Why not the real EntryRepository too: it speaks raw SQL, and faking SQL in
 * node means writing a SQL engine — the exact over-engineering this suite would
 * exist to catch. The repository's job is (de)serialisation, which the domain
 * schemas already round-trip under test. This file covers the orchestration the
 * unit tests cannot: bus + store + fridge behaving as one system.
 */
import type { Entry } from '@/core/types';
import type { EnrichRequest, EnrichResponse } from '@/core/enrich/types';

const mockRows = new Map<string, Entry>();
const byDomain = (domain: string) => [...mockRows.values()].filter((e) => e.domain === domain);

jest.mock('@/data/EntryRepository', () => ({
  EntryRepository: {
    findByDate: async (domain: string, date: string) =>
      byDomain(domain)
        .filter((e) => e.date === date)
        .sort((a, b) => a.createdAt - b.createdAt),
    findAll: async (domain: string) =>
      byDomain(domain).sort((a, b) => b.createdAt - a.createdAt),
    insert: async (entry: Entry) => void mockRows.set(entry.id, { ...entry }),
    insertMany: async (entries: Entry[]) => {
      for (const entry of entries) mockRows.set(entry.id, { ...entry });
    },
    update: async (id: string, patch: Partial<Entry>) => {
      const current = mockRows.get(id);
      if (current) mockRows.set(id, { ...current, ...patch });
    },
    delete: async (id: string) => void mockRows.delete(id),
  },
}));

// The network, canned per test. Everything downstream of it is the real thing.
let mockEnrich: (req: EnrichRequest) => Promise<EnrichResponse> = async () => ({
  ok: false,
  error: 'not set',
});
jest.mock('@/core/enrich/client', () => ({
  enrich: (req: EnrichRequest) => mockEnrich(req),
  NetworkError: class NetworkError extends Error {},
}));

// Sever expo-sqlite: the store imports it transitively for prefs, which this
// flow never touches.
jest.mock('@/data/db', () => ({ getDb: jest.fn(), wipeAllData: jest.fn() }));
jest.mock('@/data/SettingsRepository', () => ({
  SettingsRepository: { get: async () => null, set: async () => undefined },
}));

import { bus } from '@/core/command/bus';
import { PantryRepository } from '@/data/PantryRepository';
import { todayISO } from '@/core/date';
import { useAppStore } from '@/store/useAppStore';

const TODAY = todayISO();
const flush = async () => {
  for (let i = 0; i < 10; i += 1) await new Promise((r) => setTimeout(r, 0));
};
const foodDay = () => useAppStore.getState().food.entries;

const meal = (items: unknown): EnrichResponse => ({ ok: true, data: { items } as never });
const purchase = (items: unknown): EnrichResponse => ({ ok: true, data: { purchase: items } as never });

const workoutDay = () => useAppStore.getState().workout.entries;

beforeEach(() => {
  mockRows.clear();
  useAppStore.setState({
    food: { date: TODAY, entries: [] },
    workout: { date: TODAY, entries: [] },
  });
});

test('a typed meal is optimistic, then resolves to done through the real store', async () => {
  mockEnrich = async () => meal([{ label: 'frango', calories: 300, protein: 40, carbs: 0, fat: 15 }]);

  await bus.addEntry('frango grelhado', 'food');
  expect(foodDay()).toHaveLength(1); // optimistic
  await flush();

  const entry = foodDay()[0];
  expect(entry.status).toBe('done');
  expect(entry.data && 'items' in entry.data && entry.data.items[0].calories).toBe(300);
});

test('a purchase note stocks the fridge without touching the day', async () => {
  mockEnrich = async () => purchase([{ label: 'arroz', grams: 5000, price: 30 }]);

  await bus.addEntry('comprei 5kg de arroz por 30', 'food');
  await flush();

  const shelf = await PantryRepository.all();
  expect(shelf).toHaveLength(1);
  expect(shelf[0].label).toBe('arroz');
  expect(shelf[0].remainingGrams).toBe(5000);
});

// The claim the whole design rests on: eating draws the fridge down, and
// deleting the meal note puts it back — no ledger, just re-derivation.
test('eating from the fridge subtracts stock, and deleting the note restores it', async () => {
  mockEnrich = async () => purchase([{ label: 'arroz', grams: 5000, price: 30 }]);
  await bus.addEntry('comprei 5kg de arroz', 'food');
  await flush();

  mockEnrich = async () => meal([{ label: 'arroz', quantity: 100, unit: 'g', calories: 130, protein: 2, carbs: 28, fat: 0 }]);
  await bus.addEntry('comi 100g de arroz', 'food');
  await flush();

  expect((await PantryRepository.all())[0].remainingGrams).toBe(4900);

  const mealEntry = foodDay().find((e) => e.data && 'items' in e.data);
  await bus.deleteEntry(mealEntry as Entry);
  await flush();

  expect((await PantryRepository.all())[0].remainingGrams).toBe(5000);
});

test('a meal eaten from the fridge is linked and repriced with the real product', async () => {
  mockEnrich = async () => purchase([
    { label: 'arroz', grams: 1000, price: 8, nutrition: { calories: 130, protein: 2, carbs: 28, fat: 0 } },
  ]);
  await bus.addEntry('comprei arroz', 'food');
  await flush();

  // The model over-estimates; the app rewrites it from the bag the user owns.
  mockEnrich = async () => meal([{ label: 'arroz', quantity: 100, unit: 'g', calories: 999, protein: 0, carbs: 0, fat: 0 }]);
  await bus.addEntry('comi 100g de arroz', 'food');
  await flush();

  const eaten = foodDay().find((e) => e.data && 'items' in e.data);
  const item = eaten?.data && 'items' in eaten.data ? eaten.data.items[0] : null;
  expect(item?.from).toEqual({ pantryItemId: 'arroz', label: 'arroz', grams: 100 });
  expect(item?.calories).toBe(130);
});

// One note, two actions: the bus explodes it into a purchase and a meal, and a
// single undo takes the whole split back.
test('a mixed note splits into a purchase and a meal, undone as one', async () => {
  mockEnrich = async () => ({
    ok: true,
    data: {
      notes: [
        { text: 'comprei arroz', data: { purchase: [{ label: 'arroz', grams: 5000, price: 30 }] } },
        { text: 'comi frango', data: { items: [{ label: 'frango', calories: 300, protein: 40, carbs: 0, fat: 15 }] } },
      ],
    } as never,
  });

  await bus.addEntry('comprei 5kg de arroz e comi frango', 'food');
  await flush();

  const entries = foodDay();
  expect(entries).toHaveLength(2);
  expect(entries.some((e) => e.data && 'purchase' in e.data)).toBe(true);
  expect(entries.some((e) => e.data && 'items' in e.data)).toBe(true);
  // The purchase really stocked the fridge.
  expect((await PantryRepository.all())[0].label).toBe('arroz');

  await bus.undo();
  expect(foodDay()).toHaveLength(1);
  expect(foodDay()[0].text).toBe('comprei 5kg de arroz e comi frango');
  expect(foodDay()[0].status).toBe('error');
});

// ---- the other vertical -----------------------------------------------------

// A pure-number set never leaves the phone: the local parser resolves it, so no
// enrich call is made and the sets come straight from the text.
test('a workout set with no exercise name resolves locally, no network', async () => {
  const enrichSpy = jest.fn(async () => meal([]));
  mockEnrich = enrichSpy;

  await bus.addEntry('8x100\n95', 'workout');
  await flush();

  expect(enrichSpy).not.toHaveBeenCalled();
  const data = workoutDay()[0].data;
  expect(data && 'sets' in data && data.sets[0]).toMatchObject({ weight: 100, reps: 8 });
});

// "monte um treino da semana" is a request, not a log: the model returns a plan
// and the bus explodes it into one real, editable note per exercise per day.
test('a workout plan explodes into one note per exercise', async () => {
  mockEnrich = async () => ({
    ok: true,
    data: {
      days: [
        { dayOffset: 0, title: 'A', exercises: [{ exercise: 'Supino', sets: [{ weight: 80, reps: 8 }] }] },
        { dayOffset: 0, exercises: [{ exercise: 'Agachamento', sets: [{ weight: 100, reps: 5 }] }] },
      ],
    } as never,
  });

  await bus.addEntry('monte um treino pra hoje', 'workout');
  await flush();

  const names = workoutDay().map((e) => (e.data && 'exercise' in e.data ? e.data.exercise : null));
  expect(names).toEqual(expect.arrayContaining(['Supino', 'Agachamento']));
  // The typed request is gone, replaced by the plan it asked for.
  expect(workoutDay().some((e) => e.text === 'monte um treino pra hoje')).toBe(false);
});
