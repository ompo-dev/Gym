import { renderHook } from '@testing-library/react-native';

import type { Entry } from '@/core/types';
import { foodConfig } from '@/domains/food';

import { useTotals } from './useTotals';

const entry: Entry = { id: 'planned', domain: 'food', date: '2026-10-21', text: 'almoco',
  planned: true, completedAt: null, status: 'done', createdAt: 1, error: null,
  data: { items: [{ label: 'almoco', calories: 650, protein: 40, carbs: 80, fat: 12 }] } };

test('a plan counts only after checking and unchecking removes all its macros', async () => {
  const hook = await renderHook((entries: Entry[]) => useTotals(entries, foodConfig), { initialProps: [entry] });
  expect(hook.result.current).toMatchObject({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  await hook.rerender([{ ...entry, completedAt: 100 }]);
  expect(hook.result.current).toMatchObject({ calories: 650, protein: 40, carbs: 80, fat: 12 });
  await hook.rerender([entry]);
  expect(hook.result.current).toMatchObject({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  await hook.rerender([{ ...entry, planned: false }]);
  expect(hook.result.current.calories).toBe(650);
});

test('checked entries without resolved data still do not count', async () => {
  const hook = await renderHook(() => useTotals([{ ...entry, completedAt: 100, status: 'thinking' }], foodConfig));
  expect(hook.result.current.calories).toBe(0);
});
