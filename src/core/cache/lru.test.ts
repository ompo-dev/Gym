import { Lru } from './lru';

test('evicts the least-recently-used entry when over capacity', () => {
  const cache = new Lru<string, number>(2);
  cache.set('a', 1);
  cache.set('b', 2);
  cache.get('a'); // touch 'a' → 'b' becomes LRU
  cache.set('c', 3); // should evict 'b'

  expect(cache.has('a')).toBe(true);
  expect(cache.has('b')).toBe(false);
  expect(cache.get('c')).toBe(3);
});

test('overwriting a key does not grow the map', () => {
  const cache = new Lru<string, number>(2);
  cache.set('a', 1);
  cache.set('a', 2);

  expect(cache.get('a')).toBe(2);
  expect(cache.size).toBe(1);
});
