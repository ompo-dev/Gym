import { runEnrichEngine } from './deepseek';

/**
 * The real model, the real prompts, the real sentences a user typed.
 *
 * Everything else in the suite mocks `enrichFn`, which proves the plumbing and
 * says NOTHING about whether the prompt actually makes the model split a note.
 * That gap is how "supino reto 3 de 10 com 50 cada lado e corrida de 10km em 1
 * hora" shipped coming back as one mangled exercise: the unit tests were green.
 *
 * Skipped unless LIVE_AI=1 — it costs money and needs network, so it must never
 * run in CI or on a normal `npm test`. Run it after touching any router prompt:
 *
 *   LIVE_AI=1 DEEPSEEK_API_KEY=... npx jest src/core/enrich/live.test.ts
 */

const KEY = process.env.DEEPSEEK_API_KEY ?? '';
const ENABLED = process.env.LIVE_AI === '1' && KEY.length > 0;
const describeLive = ENABLED ? describe : describe.skip;

// jest-expo installs React Native's fetch, which has no working transport in the
// node test env — every call came back as a bodyless object and the engine read
// it as "AI service error (undefined)". The engine only needs ok/status/text(),
// so back those three with node:https and the real prompts run untouched.
if (ENABLED) {
  const https = require('node:https') as typeof import('node:https');
  (global as unknown as { fetch: unknown }).fetch = (url: string, init: RequestInit = {}) =>
    new Promise((resolve, reject) => {
      const request = https.request(
        url,
        { method: init.method ?? 'GET', headers: init.headers as Record<string, string> },
        (response) => {
          let body = '';
          response.setEncoding('utf8');
          response.on('data', (chunk) => (body += chunk));
          response.on('end', () =>
            resolve({
              ok: (response.statusCode ?? 0) >= 200 && (response.statusCode ?? 0) < 300,
              status: response.statusCode ?? 0,
              text: async () => body,
              json: async () => JSON.parse(body),
            }),
          );
        },
      );
      request.on('error', reject);
      if (init.body) request.write(init.body);
      request.end();
    });
}

const keys = { chat: KEY, image: KEY };
const LIVE_TIMEOUT = 90_000;

type Note = { text: string; data: Record<string, unknown> };
const notesOf = (data: unknown): Note[] | null => {
  const notes = (data as { notes?: Note[] })?.notes;
  return Array.isArray(notes) ? notes : null;
};
const show = (data: unknown) => JSON.stringify(data);

describeLive('live: the model splits what the user actually typed', () => {
  test(
    'workout — "supino reto 3 de 10 com 50 cada lado e corrida de 10km em 1 hora" is TWO notes',
    async () => {
      const res = await runEnrichEngine(
        {
          text: 'supino reto 3 de 10 com 50 cada lado e corrida de 10km em 1 hora',
          domain: 'workout',
          intent: 'workoutAuto',
          locale: 'pt-BR',
        },
        keys,
      );
      expect(res.ok).toBe(true);
      if (!res.ok) return;

      const notes = notesOf(res.data);
      // eslint-disable-next-line no-console
      console.log('WORKOUT →', show(res.data));
      expect(notes).not.toBeNull();
      expect(notes).toHaveLength(2);

      const blob = show(res.data).toLowerCase();
      expect(blob).toContain('supino');
      // The cardio must survive — dropping it is the exact failure reported.
      expect(blob).toMatch(/corrida|10000|3600/);

      // "50 cada lado" is 100 kg total, and it belongs to the supino note only.
      const supino = notes!.find((n) => show(n.data).toLowerCase().includes('supino'));
      expect(supino).toBeDefined();
      const supinoSets = (supino!.data as { sets?: { weight?: number; reps?: number }[] }).sets ?? [];
      expect(supinoSets.length).toBe(3);
      expect(supinoSets[0]?.weight).toBe(100);
      expect(supinoSets[0]?.reps).toBe(10);
      // ...and the run must NOT carry a load.
      const corrida = notes!.find((n) => n !== supino);
      const corridaSets =
        (corrida!.data as { sets?: { weight?: number; distanceMeters?: number }[] }).sets ?? [];
      expect(corridaSets.some((s) => s.distanceMeters === 10000)).toBe(true);
      expect(corridaSets.every((s) => s.weight === undefined)).toBe(true);
    },
    LIVE_TIMEOUT,
  );

  test(
    'food — "almocei arroz e frango e jantei arroz e feijao" is TWO meals',
    async () => {
      const res = await runEnrichEngine(
        {
          text: 'almocei arroz e frango e jantei arroz e feijao',
          domain: 'food',
          intent: 'foodAuto',
          locale: 'pt-BR',
        },
        keys,
      );
      expect(res.ok).toBe(true);
      if (!res.ok) return;

      const notes = notesOf(res.data);
      // eslint-disable-next-line no-console
      console.log('FOOD →', show(res.data));
      expect(notes).not.toBeNull();
      expect(notes).toHaveLength(2);

      // Each note carries only its own foods: the lunch has chicken and no beans,
      // the dinner has beans and no chicken. Merging them is the reported bug.
      const texts = notes!.map((n) => show(n.data).toLowerCase());
      const lunch = texts.find((t) => t.includes('frango'));
      const dinner = texts.find((t) => t.includes('feij'));
      expect(lunch).toBeDefined();
      expect(dinner).toBeDefined();
      expect(lunch).not.toBe(dinner);
      expect(lunch).not.toMatch(/feij/);
      expect(dinner).not.toMatch(/frango/);

      // The model tags each occasion from the WORDS: lunch note → lunch, dinner
      // note → dinner. (The local fallback would cover an omission, but the
      // prompt should get it right.)
      const lunchNote = notes!.find((n) => show(n.data).toLowerCase().includes('frango'));
      const dinnerNote = notes!.find((n) => show(n.data).toLowerCase().includes('feij'));
      expect((lunchNote!.data as { mealType?: string }).mealType).toBe('lunch');
      expect((dinnerNote!.data as { mealType?: string }).mealType).toBe('dinner');
    },
    LIVE_TIMEOUT,
  );

  test(
    'single exercise still comes back bare, never wrapped in notes[]',
    async () => {
      const res = await runEnrichEngine(
        { text: 'supino reto 3x10 80kg', domain: 'workout', intent: 'workoutAuto', locale: 'pt-BR' },
        keys,
      );
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      // eslint-disable-next-line no-console
      console.log('SINGLE →', show(res.data));
      expect(notesOf(res.data)).toBeNull();
    },
    LIVE_TIMEOUT,
  );
});
