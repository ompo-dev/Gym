import {
  RATE_MAX_PER_WINDOW,
  RATE_MAX_TRACKED_IPS,
  RATE_WINDOW_MS,
  checkRateLimit,
  resetRateLimit,
} from './rateLimit';

beforeEach(() => {
  resetRateLimit();
});

// ---- under the limit ----

test('allows RATE_MAX_PER_WINDOW calls for one IP in the same window', () => {
  const ip = '1.2.3.4';
  const now = 1_000_000;

  for (let i = 0; i < RATE_MAX_PER_WINDOW; i++) {
    expect(checkRateLimit(ip, now)).toEqual({ ok: true });
  }
});

test('the (N+1)th call is denied when window is full', () => {
  const ip = '1.2.3.4';
  const now = 1_000_000;

  for (let i = 0; i < RATE_MAX_PER_WINDOW; i++) {
    checkRateLimit(ip, now);
  }

  const result = checkRateLimit(ip, now);
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.retryAfterSec).toBeGreaterThanOrEqual(1);
    expect(result.retryAfterSec).toBeLessThanOrEqual(RATE_WINDOW_MS / 1000);
  }
});

// ---- window reset ----

test('allows same IP after window expires', () => {
  const ip = '1.2.3.4';
  const now = 1_000_000;

  // exhaust the window
  for (let i = 0; i < RATE_MAX_PER_WINDOW; i++) {
    checkRateLimit(ip, now);
  }
  expect(checkRateLimit(ip, now).ok).toBe(false);

  // advance past resetAt
  const future = now + RATE_WINDOW_MS + 1;
  expect(checkRateLimit(ip, future)).toEqual({ ok: true });
});

// ---- IP isolation ----

test('exhausting IP "a" does not affect IP "b"', () => {
  const now = 1_000_000;

  // exhaust IP "a"
  for (let i = 0; i < RATE_MAX_PER_WINDOW; i++) {
    checkRateLimit('a', now);
  }
  expect(checkRateLimit('a', now).ok).toBe(false);

  // IP "b" is unaffected
  expect(checkRateLimit('b', now)).toEqual({ ok: true });
});

// ---- memory bound ----

test('prunes expired entries before inserting new IP at capacity', () => {
  const now = 1_000_000;

  // fill the store with expired entries
  for (let i = 0; i < RATE_MAX_TRACKED_IPS; i++) {
    checkRateLimit(`ip-${i}`, 0); // now=0 → all expire at RATE_WINDOW_MS (< now)
  }

  // should still accept new IP — prunes expired, makes room, inserts fresh
  expect(checkRateLimit('new-ip', now)).toEqual({ ok: true });
});

test('clears the whole store when at capacity with all active entries', () => {
  const now = 1_000_000;

  // fill the store with active entries
  for (let i = 0; i < RATE_MAX_TRACKED_IPS; i++) {
    checkRateLimit(`ip-${i}`, now);
  }

  // all active → prune does nothing → clear() fires → new IP accepted
  expect(checkRateLimit('overflow-ip', now)).toEqual({ ok: true });
});
