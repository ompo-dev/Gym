import type { CommandBus } from '@/core/command/CommandBus';
import { readFileSync } from 'fs';
import { join } from 'path';

import { INTENT_COVERAGE } from '@/core/enrich/deepseek';
import { ENRICH_INTENTS } from '@/core/enrich/types';
import type { Command } from '@/core/command/Command';
import type { Entry } from '@/core/types';

import {
  invokeTool,
  isToolName,
  toolCatalog,
  toolRegistry,
  TOOL_ERROR,
  type ToolDeps,
} from './registry';

const built: { text: string; date?: string }[] = [];

const deps = (entries: Entry[] = []): ToolDeps => ({
  bus: {
    createAddEntry: (text: string, _d: unknown, _m: unknown, date?: string): Command | null => {
      if (!text.trim()) return null;
      built.push({ text, date });
      return { label: text, execute: async () => {}, undo: async () => {} };
    },
  } as unknown as CommandBus,
  entries: {
    findByDate: async () => entries,
    findAll: async () => entries,
  },
  savedMeals: { all: async () => [] },
  today: () => '2026-07-21',
});

beforeEach(() => {
  built.length = 0;
});

test('an unknown tool name is refused, not guessed at', () => {
  expect(isToolName('addEntries')).toBe(true);
  expect(isToolName('dropDatabase')).toBe(false);
  return invokeTool('dropDatabase', {}, deps()).then((r) =>
    expect(r).toMatchObject({ ok: false, error: TOOL_ERROR.unknown }),
  );
});

test('bad arguments are rejected before anything is built', async () => {
  const res = await invokeTool('addEntries', { entries: [{ text: '', domain: 'food' }] }, deps());
  expect(res.ok).toBe(false);
  expect(built).toHaveLength(0);
});

test('the model cannot write onboarding notes', async () => {
  // Those notes are what builds the profile; letting the model author them
  // would have it answering the questions on the user's behalf.
  const res = await invokeTool(
    'addEntries',
    { entries: [{ text: '98kg', domain: 'onboarding' }] },
    deps(),
  );
  expect(res.ok).toBe(false);
});

test('a week of entries becomes one undoable command', async () => {
  const week = Array.from({ length: 7 }, (_, i) => ({
    text: `treino ${i}`,
    domain: 'workout' as const,
    date: `2026-07-2${i + 1}`,
  }));
  const res = await invokeTool('addEntries', { entries: week, label: 'Semana' }, deps());

  expect(res).toMatchObject({ ok: true, kind: 'command' });
  if (res.ok && res.kind === 'command') expect(res.command.label).toBe('Semana');
  expect(built).toHaveLength(7);
  expect(built[6].date).toBe('2026-07-27');
});

test('a batch bigger than a month is refused', async () => {
  const tooMany = Array.from({ length: 32 }, () => ({ text: 'x', domain: 'food' as const }));
  const res = await invokeTool('addEntries', { entries: tooMany }, deps());
  expect(res.ok).toBe(false);
});

test('reading a day defaults to today rather than failing', async () => {
  const res = await invokeTool('readDay', { domain: 'food' }, deps());
  expect(res).toMatchObject({ ok: true, kind: 'data' });
  if (res.ok && res.kind === 'data') {
    expect((res.data as { date: string }).date).toBe('2026-07-21');
  }
});

test('purchases never reach the day totals a tool reports', async () => {
  const purchase: Entry = {
    id: 'p1',
    date: '2026-07-21',
    domain: 'food',
    text: 'comprei patinho',
    status: 'done',
    data: { purchase: [{ label: 'patinho', price: 30 }] },
    error: null,
    createdAt: 1,
  };
  const res = await invokeTool('readDay', { domain: 'food' }, deps([purchase]));
  if (res.ok && res.kind === 'data') {
    expect((res.data as { totals: { calories: number } }).totals.calories).toBe(0);
  }
});

test('the pantry tool reads what was bought', async () => {
  const purchase: Entry = {
    id: 'p1',
    date: '2026-07-21',
    domain: 'food',
    text: 'comprei patinho',
    status: 'done',
    data: { purchase: [{ label: 'patinho', grams: 500, price: 30 }] },
    error: null,
    createdAt: 1,
  };
  const res = await invokeTool('readPantry', {}, deps([purchase]));
  if (res.ok && res.kind === 'data') {
    expect(res.data).toEqual([
      { label: 'patinho', boughtTimes: 1, lastPrice: 30, pricePerKg: 60 },
    ]);
  }
});

test('every tool describes itself with a usable JSON schema', () => {
  // The schema that validates the answer is the schema that describes the
  // question — derived, so the two cannot drift apart.
  const catalog = toolCatalog();
  expect(catalog).toHaveLength(Object.keys(toolRegistry).length);
  for (const tool of catalog) {
    expect(tool.description.length).toBeGreaterThan(20);
    expect(tool.parameters).toHaveProperty('type', 'object');
    // Has to survive the trip to the model as plain JSON.
    expect(() => JSON.stringify(tool.parameters)).not.toThrow();
  }
});

test('every intent has both a prompt and a pinned output schema', () => {
  // The two live side by side in deepseek.ts precisely so they cannot drift: an
  // intent with a prompt but no schema falls back to the domain union, and a
  // meal-shaped reply to a purchase question would pass validation.
  for (const intent of ['foodEdit', 'purchase', 'recipe', 'workoutPlan'] as const) {
    expect(INTENT_COVERAGE[intent]).toEqual({ prompt: true, schema: true, tokens: true });
  }
});

// The proxy validated the wire with its own hand-written enum, and it never
// listed `recipe` or `workoutPlan` — so every recipe and every plan sent
// through the managed key was rejected as "Invalid request" before it reached
// the engine. Only people using their own key ever saw those work. Two lists
// that must agree is one list.
test('the proxy accepts every intent the engine can be asked for', () => {
  const route = readFileSync(join(__dirname, '../../app/api/enrich+api.ts'), 'utf8');

  expect(route).toContain('z.enum(ENRICH_INTENTS)');
  for (const intent of Object.keys(INTENT_COVERAGE)) {
    expect(ENRICH_INTENTS).toContain(intent);
  }
});
