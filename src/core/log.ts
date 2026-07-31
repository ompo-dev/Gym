/**
 * One logger, for the Metro terminal that `npx expo start` opens.
 *
 * Instrumentation lives at the choke points every action already flows through
 * — the modal store (navigation), the command bus (notes + AI lifecycle), the
 * enrich client (requests), the app store (state) — not sprinkled across every
 * component. That is what makes "log everything" a dozen edits instead of a
 * thousand, and what keeps it from rotting the moment a new screen is added.
 *
 * Silent in production: `__DEV__` is false in a release bundle, so every call
 * compiles down to a guard that returns immediately. No log ever ships.
 */

// On in the Metro dev terminal, off in a release bundle, and off under jest —
// the logs are a debugging stream for `expo start`, not noise for the test
// runner. `NODE_ENV === 'test'` is what jest sets and Metro never does.
//
// `_setOnForTest` lets the log buffer test push entries through emit without
// spewing console noise — it only flips the ring-buffer path, not the console.
let ON =
  typeof __DEV__ !== 'undefined' &&
  __DEV__ &&
  (typeof process === 'undefined' || process.env?.NODE_ENV !== 'test');

/** Test-only: enable the ring buffer so log.<category>() pushes to it. */
export function _setOnForTest(on: boolean): void {
  ON = on;
}

export type LogCategory =
  | 'nav'
  | 'note'
  | 'ai'
  | 'store'
  | 'db'
  | 'ui'
  | 'input'
  | 'scroll'
  | 'error';

/**
 * Per-letter and per-scroll-frame logging is a firehose that drowns the useful
 * lines. It is off by default and flipped on only when you are chasing an input
 * or scroll bug. Everything else logs regardless.
 */
export const logConfig = { verbose: false };

const ICON: Record<LogCategory, string> = {
  nav: '🧭',
  note: '📝',
  ai: '🤖',
  store: '📦',
  db: '💾',
  ui: '👆',
  input: '⌨️',
  scroll: '📜',
  error: '🛑',
};

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

function stamp(): string {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(
    d.getMilliseconds(),
    3,
  )}`;
}

// ---- ring buffer (dev-only, on-screen log inspection) -----------------------

const RING_CAPACITY = 500;

interface LogEntry {
  ts: string;
  category: LogCategory;
  event: string;
  meta?: string;
}

const ring: LogEntry[] = [];

/**
 * Clip `meta` to ~500 chars so an AI log with a base64 image (megabytes) does
 * not blow up the ring buffer. The raw payload is still on the console.
 */
function clipMeta(meta: unknown): string | undefined {
  if (meta === undefined) return undefined;
  let text: string;
  try {
    text = JSON.stringify(meta);
  } catch {
    text = String(meta);
  }
  return text.length > 500 ? text.slice(0, 497) + "..." : text;
}

/** Copy of the ring buffer, most recent first. */
export function getLogBuffer(): ReadonlyArray<LogEntry> {
  return [...ring].reverse();
}

export function clearLogBuffer(): void {
  ring.length = 0;
}

function emit(category: LogCategory, event: string, meta?: unknown): void {
  if (!ON) return;
  const head = `${stamp()} ${ICON[category]} [${category}] ${event}`;
  if (meta === undefined) console.log(head);
  else console.log(head, meta);

  // Push clipped entry into the ring buffer. The clip is done HERE, on push,
  // so the ring never holds a reference to the original (potentially huge) meta.
  if (ring.length >= RING_CAPACITY) ring.shift();
  ring.push({ ts: stamp(), category, event, meta: clipMeta(meta) });
}

function make(category: LogCategory) {
  return (event: string, meta?: unknown) => emit(category, event, meta);
}

/**
 * A span with a duration, for anything worth timing — an AI round trip, a DB
 * write. `const end = log.time('ai', 'enrich food'); … end({ ok })` prints the
 * start and, on `end`, the same line with the elapsed milliseconds.
 */
function time(category: LogCategory, event: string, meta?: unknown) {
  emit(category, `${event} …`, meta);
  const startedAt = Date.now();
  return (endMeta?: unknown) =>
    emit(category, `${event} ✓ ${Date.now() - startedAt}ms`, endMeta);
}

export const log = {
  nav: make('nav'),
  note: make('note'),
  ai: make('ai'),
  store: make('store'),
  db: make('db'),
  ui: make('ui'),
  error: make('error'),
  /** Gated behind {@link logConfig}.verbose — the firehose. */
  input: (event: string, meta?: unknown) => {
    if (logConfig.verbose) emit('input', event, meta);
  },
  /** Gated behind {@link logConfig}.verbose — the firehose. */
  scroll: (event: string, meta?: unknown) => {
    if (logConfig.verbose) emit('scroll', event, meta);
  },
  time,
};

let installed = false;

/**
 * Routes every uncaught error and unhandled rejection through the same logger,
 * so a crash reads in the same stream as the action that led to it. Called once
 * from the app root. Chains the previous handler rather than replacing it, or
 * the red-box dev overlay would stop appearing.
 */
export function installErrorLogging(): void {
  if (installed || !ON) return;
  installed = true;

  const globalWithError = globalThis as {
    ErrorUtils?: {
      getGlobalHandler?: () => (error: unknown, isFatal?: boolean) => void;
      setGlobalHandler?: (handler: (error: unknown, isFatal?: boolean) => void) => void;
    };
  };
  const utils = globalWithError.ErrorUtils;
  const previous = utils?.getGlobalHandler?.();
  utils?.setGlobalHandler?.((error, isFatal) => {
    log.error(isFatal ? 'FATAL' : 'uncaught', error);
    previous?.(error, isFatal);
  });
}
