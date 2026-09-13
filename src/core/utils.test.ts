import { hashKey, newId, normalizeEditableText, normalizeText } from './utils';

test('normalizeText trims, lowercases, and collapses whitespace', () => {
  expect(normalizeText('  In  N   Out ')).toBe('in n out');
});

test('normalizeEditableText ignores harmless edit formatting', () => {
  expect(normalizeEditableText('  Bike  06:19 / km  ')).toBe('bike 6:19/km');
});

test('hashKey is stable and disambiguates by part', () => {
  expect(hashKey('food', 'abc')).toBe(hashKey('food', 'abc'));
  expect(hashKey('food', 'abc')).not.toBe(hashKey('workout', 'abc'));
});

test('newId produces unique ids under a tight loop', () => {
  const ids = new Set(Array.from({ length: 1000 }, () => newId()));
  expect(ids.size).toBe(1000);
});
