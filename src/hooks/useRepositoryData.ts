import { useEffect, useRef, useState, type DependencyList } from 'react';

/**
 * Read-on-open from a repository, the pattern six sheets were copy-pasting.
 *
 * The store holds only the visible day; secondary data (pantry, saved meals,
 * workout history) is read from SQLite when a panel opens. Every one of those
 * did the same dance — `useState` for the result, a `useEffect` that loads and
 * guards against `setState`-after-unmount with an `alive` flag. This is that
 * dance, once.
 *
 * `loader` is read through a ref so a fresh closure each render never forces a
 * reload; `deps` is what decides when to reload (usually `[visible]` or an id).
 * `enabled` skips the load while a panel is closed — no request for a sheet the
 * user is not looking at.
 */
export function useRepositoryData<T>(
  loader: () => Promise<T>,
  initial: T,
  deps: DependencyList,
  enabled = true,
): T {
  const [data, setData] = useState<T>(initial);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void loaderRef.current().then((value) => {
      if (alive) setData(value);
    });
    return () => {
      alive = false;
    };
    // loader is intentionally excluded — it is called through the ref, and the
    // caller's `deps` is the real trigger. `enabled` is included so opening a
    // panel reloads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);

  return data;
}
