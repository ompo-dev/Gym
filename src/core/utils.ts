let counter = 0;

/** Local-only unique id. Not a UUID — good enough for on-device rows. */
export function newId(): string {
  counter = (counter + 1) % 1_000_000;
  const rand = Math.floor(Math.random() * 1_000_000).toString(36);
  return `${Date.now().toString(36)}-${counter.toString(36)}-${rand}`;
}

export function normalizeText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Stable djb2 hash → short string. Used as the cache/dedup key. */
export function hashKey(...parts: string[]): string {
  const s = parts.join('|');
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}
