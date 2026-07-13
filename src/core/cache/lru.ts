/**
 * Tiny LRU over a Map (insertion order = recency). Used to dedupe AI enrich
 * results by text hash so re-typing the same entry resolves without a request.
 * ponytail: ~25 lines beats pulling a cache dependency for this.
 */
export class Lru<K, V> {
  private readonly map = new Map<K, V>();

  constructor(private readonly max = 100) {}

  get(key: K): V | undefined {
    const value = this.map.get(key);
    if (value === undefined) return undefined;
    this.map.delete(key);
    this.map.set(key, value); // touch → most recent
    return value;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.max) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  get size(): number {
    return this.map.size;
  }
}
