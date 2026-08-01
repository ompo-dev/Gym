import { DEFAULT_FLAGS, FEATURE_FLAGS, getScopeEnabled, type FeatureFlag } from "./flags";

test("DEFAULT_FLAGS has a key for every feature flag", () => {
  for (const flag of FEATURE_FLAGS) {
    expect(Object.prototype.hasOwnProperty.call(DEFAULT_FLAGS, flag)).toBe(true);
  }
});

test("DEFAULT_FLAGS has no extra keys", () => {
  const keys = Object.keys(DEFAULT_FLAGS) as FeatureFlag[];
  expect(keys.sort()).toEqual([...FEATURE_FLAGS].sort());
});

test("offlineForce defaults to false", () => {
  expect(DEFAULT_FLAGS.offlineForce).toBe(false);
});

test("all other flags default to true", () => {
  for (const flag of FEATURE_FLAGS) {
    if (flag === "offlineForce") continue;
    expect(DEFAULT_FLAGS[flag]).toBe(true);
  }
});

// ---- getScopeEnabled ----

test("getScopeEnabled: both flags on → both true", () => {
  expect(getScopeEnabled({ food: true, workout: true }, "food")).toBe(true);
  expect(getScopeEnabled({ food: true, workout: true }, "workout")).toBe(true);
});

test("getScopeEnabled: food off, workout on → food false, workout true", () => {
  expect(getScopeEnabled({ food: false, workout: true }, "food")).toBe(false);
  expect(getScopeEnabled({ food: false, workout: true }, "workout")).toBe(true);
});

test("getScopeEnabled: both off → both true (anti-loop fallback)", () => {
  expect(getScopeEnabled({ food: false, workout: false }, "food")).toBe(true);
  expect(getScopeEnabled({ food: false, workout: false }, "workout")).toBe(true);
});

test("getScopeEnabled: missing flags → default to true", () => {
  expect(getScopeEnabled({}, "food")).toBe(true);
  expect(getScopeEnabled({}, "workout")).toBe(true);
});
