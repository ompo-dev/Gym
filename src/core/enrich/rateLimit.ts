
/**
 * Fixed-window per-IP rate limiter for the managed-key enrich path.
 *
 * Per-isolate in-memory Map — resets on Worker recycle. The real $ ceiling
 * is the DeepSeek account spend cap. If this proves insufficient, upgrade
 * path is a shared store like Upstash Redis.
 */

// ---- calibration knobs (tune these to balance abuse-protection vs legits) ----

/** Window duration in milliseconds. */
export const RATE_WINDOW_MS = 60_000;
/** Max managed-key enrich calls per IP per window. */
export const RATE_MAX_PER_WINDOW = 20;
/**
 * Memory bound. Before inserting a new IP that would exceed the cap, expired
 * entries are pruned in one pass; if still at the cap, the whole Map is cleared.
 */
export const RATE_MAX_TRACKED_IPS = 5_000;

// ---------------------------------------------------------------------------

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSec: number };

interface Entry {
  count: number;
  resetAt: number;
}

const store = new Map<string, Entry>();

export function checkRateLimit(ip: string, now: number): RateLimitResult {
  const entry = store.get(ip);

  // Fresh IP or expired window → start a new window.
  if (!entry || now >= entry.resetAt) {
    // Memory bound: prune before inserting when at/over capacity.
    if (!entry && store.size >= RATE_MAX_TRACKED_IPS) {
      for (const [k, v] of store) {
        if (now >= v.resetAt) store.delete(k);
      }
      // ponytail: still at cap after pruning → clear all. Per-isolate memory
      // resets on Worker recycle; the real $ ceiling is the DeepSeek spend
      // cap. Upgrade to Upstash Redis if this proves insufficient.
      if (store.size >= RATE_MAX_TRACKED_IPS) store.clear();
    }
    store.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return { ok: true };
  }

  // Active window: at/over limit → deny.
  if (entry.count >= RATE_MAX_PER_WINDOW) {
    return { ok: false, retryAfterSec: Math.ceil((entry.resetAt - now) / 1000) };
  }

  // Active window: under limit → increment.
  entry.count++;
  return { ok: true };
}

/** Clears all state — for test isolation only. */
export function resetRateLimit(): void {
  store.clear();
}
