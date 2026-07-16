import type { EnrichRequest, EnrichResponse } from '@/core/enrich/types';
import type { Domain, Entry } from '@/core/types';

import { type BusDeps, CommandBus } from './CommandBus';

const TODAY = '2026-07-13';
const flush = () => new Promise((r) => setTimeout(r, 0));

const foodOk = (): EnrichResponse => ({
  ok: true,
  data: { items: [{ label: 'burger', calories: 620, protein: 30, carbs: 40, fat: 35 }] },
});

function harness(
  enrichFn: (req: EnrichRequest) => Promise<EnrichResponse>,
  extraDeps: Partial<Pick<BusDeps, 'getUserContext'>> = {},
) {
  const day: Record<Domain, { date: string; entries: Entry[] }> = {
    food: { date: TODAY, entries: [] },
    workout: { date: TODAY, entries: [] },
  };
  const rows = new Map<string, Entry>();
  const scheduled: { fn: () => void; ms: number }[] = [];

  const store: BusDeps['store'] = {
    getDay: (d) => day[d],
    upsert: (d, e) => {
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
    }),
  );
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
    sets: [{ weight: 100, unit: 'kg', reps: 8 }],
  });
});

test('workout entries use AI to correct the exercise name but keep local set parsing', async () => {
  const enrichFn = jest.fn(async () => ({
    ok: true,
    data: { exercise: 'Supino reto', sets: [] },
  }));
  const { bus, day } = harness(enrichFn);

  await bus.addEntry('sipino reto\n8x100', 'workout');
  await flush();

  expect(enrichFn).toHaveBeenCalledWith(
    expect.objectContaining({ text: 'sipino reto', domain: 'workout' }),
  );
  expect(day.workout.entries[0].data).toEqual({
    exercise: 'Supino reto',
    sets: [{ weight: 100, unit: 'kg', reps: 8 }],
  });
});
