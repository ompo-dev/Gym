import { DEFAULT_FLAGS, FEATURE_FLAGS, type FeatureFlag } from "./flags";

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
