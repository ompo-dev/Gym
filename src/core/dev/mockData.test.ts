import { foodSchema, workoutSchema } from "@/domains/schemas";

import { buildMockEntries, validateMockEntries, mulberry32 } from "./mockData";

const TODAY = "2026-01-15";

// ---- PRNG ---------------------------------------------------------------

test("mulberry32: same seed => same sequence", () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  for (let i = 0; i < 20; i++) {
    expect(a()).toBe(b());
  }
});

test("mulberry32: different seed => different sequence", () => {
  const a = mulberry32(1);
  const b = mulberry32(2);
  // At least one of the first 10 values should differ.
  const seqA = Array.from({ length: 10 }, () => a());
  const seqB = Array.from({ length: 10 }, () => b());
  expect(seqA).not.toEqual(seqB);
});

// ---- buildMockEntries ---------------------------------------------------

test("entries fall within the requested day window", () => {
  const entries = buildMockEntries({ days: 7, domains: ["food"], today: TODAY });
  for (const e of entries) {
    expect(e.date >= "2026-01-08").toBe(true);
    expect(e.date <= "2026-01-15").toBe(true);
  }
});

test("every id starts with mock-", () => {
  const entries = buildMockEntries({ days: 7, domains: ["food", "workout"], today: TODAY });
  expect(entries.length).toBeGreaterThan(0);
  for (const e of entries) {
    expect(e.id.startsWith("mock-")).toBe(true);
  }
});

test("all entries have status done and non-null data", () => {
  const entries = buildMockEntries({ days: 7, domains: ["food", "workout"], today: TODAY });
  for (const e of entries) {
    expect(e.status).toBe("done");
    expect(e.data).not.toBeNull();
  }
});

test("every data passes its domain schema safeParse", () => {
  const entries = buildMockEntries({ days: 7, domains: ["food", "workout"], today: TODAY });
  const invalid = validateMockEntries(entries);
  expect(invalid).toEqual([]);
});

test("every food entry has mealType", () => {
  const entries = buildMockEntries({ days: 7, domains: ["food"], today: TODAY });
  for (const e of entries) {
    const data = e.data as Record<string, unknown>;
    expect(data.mealType).toBeDefined();
    expect(typeof data.mealType).toBe("string");
    expect(data.mealType).not.toBe("");
  }
});

test("same params => same entries (determinism)", () => {
  const a = buildMockEntries({ days: 7, domains: ["food", "workout"], today: TODAY });
  const b = buildMockEntries({ days: 7, domains: ["food", "workout"], today: TODAY });
  expect(a.map((e) => e.id)).toEqual(b.map((e) => e.id));
  expect(a.map((e) => e.text)).toEqual(b.map((e) => e.text));
  expect(a.map((e) => e.createdAt)).toEqual(b.map((e) => e.createdAt));
});

test("includes both food and workout when both domains requested", () => {
  const entries = buildMockEntries({ days: 7, domains: ["food", "workout"], today: TODAY });
  const domains = new Set(entries.map((e) => e.domain));
  expect(domains.has("food")).toBe(true);
  expect(domains.has("workout")).toBe(true);
});

test("food-only does not generate workout entries", () => {
  const entries = buildMockEntries({ days: 7, domains: ["food"], today: TODAY });
  for (const e of entries) {
    expect(e.domain).toBe("food");
  }
});

test("every workout entry keeps its primary muscle after safeParse", () => {
  const entries = buildMockEntries({ days: 7, domains: ["workout"], today: TODAY });
  const workoutEntries = entries.filter((e) => e.domain === "workout");
  expect(workoutEntries.length).toBeGreaterThan(0);
  for (const e of workoutEntries) {
    const parsed = workoutSchema.safeParse(e.data);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.primary).toBeDefined();
      expect(parsed.data.primary?.muscle).toBeDefined();
      expect(typeof parsed.data.primary!.muscle).toBe("string");
    }
  }
});

test("30 days generates more entries than 7 days", () => {
  const short = buildMockEntries({ days: 7, domains: ["food"], today: TODAY });
  const long = buildMockEntries({ days: 30, domains: ["food"], today: TODAY });
  expect(long.length).toBeGreaterThan(short.length);
});
