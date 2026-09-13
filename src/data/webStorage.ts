type BrowserStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

const PREFIX = "gym:web:v1:";
const memory = new Map<string, string>();

function fullKey(key: string): string {
  return `${PREFIX}${key}`;
}

function getStorage(): BrowserStorage | null {
  const host = globalThis as typeof globalThis & {
    localStorage?: BrowserStorage;
  };
  try {
    const storage = host.localStorage;
    if (!storage) return null;
    const probe = `${PREFIX}probe`;
    storage.setItem(probe, "1");
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

export function readJson<T>(key: string, fallback: T): T {
  const namespacedKey = fullKey(key);
  const raw = getStorage()?.getItem(namespacedKey) ?? memory.get(namespacedKey);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJson<T>(key: string, value: T): void {
  const namespacedKey = fullKey(key);
  const raw = JSON.stringify(value);
  const storage = getStorage();
  if (storage) storage.setItem(namespacedKey, raw);
  else memory.set(namespacedKey, raw);
}

export function removeJson(key: string): void {
  const namespacedKey = fullKey(key);
  getStorage()?.removeItem(namespacedKey);
  memory.delete(namespacedKey);
}

export function clearWebData(): void {
  const storage = getStorage();
  if (storage) {
    const keys: string[] = [];
    for (let index = 0; index < Number.MAX_SAFE_INTEGER; index += 1) {
      const key = (storage as BrowserStorage & { key?: (index: number) => string | null }).key?.(
        index,
      );
      if (key === undefined) break;
      if (key === null) break;
      if (key.startsWith(PREFIX)) keys.push(key);
    }
    keys.forEach((key) => storage.removeItem(key));
  }
  memory.clear();
}
