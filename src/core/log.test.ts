import { _setOnForTest, clearLogBuffer, getLogBuffer, log } from "./log";

// Enable the ring buffer push path (console stays quiet because emit only logs
// to console when ON is true — we set it true just for the ring buffer path).
_setOnForTest(true);
clearLogBuffer();

test("getLogBuffer returns empty array initially", () => {
  clearLogBuffer();
  expect(getLogBuffer()).toHaveLength(0);
});

test("getLogBuffer returns most recent first", () => {
  clearLogBuffer();
  log.ai("first");
  log.ai("second");
  log.ai("third");
  const buffer = getLogBuffer();
  expect(buffer.length).toBeGreaterThanOrEqual(3);
  // The 3 latest should be at the start (most recent first).
  expect(buffer[0].event).toBe("third");
  expect(buffer[1].event).toBe("second");
  expect(buffer[2].event).toBe("first");
});

test("log with huge meta is clipped to ~520 chars max", () => {
  clearLogBuffer();
  const hugeString = "x".repeat(10_000);
  log.ai("huge", hugeString);
  const buffer = getLogBuffer();
  expect(buffer.length).toBeGreaterThanOrEqual(1);
  const entry = buffer[0];
  expect(entry.event).toBe("huge");
  // meta should be clipped: ≤ 500 chars + "..." suffix (3 chars)
  expect(entry.meta).toBeDefined();
  expect(entry.meta!.length).toBeLessThanOrEqual(520);
  expect(entry.meta!.endsWith("...")).toBe(true);
});

test("log with small meta is stored as-is", () => {
  clearLogBuffer();
  log.ai("small", { key: "value" });
  const buffer = getLogBuffer();
  expect(buffer.length).toBeGreaterThanOrEqual(1);
  const entry = buffer[0];
  expect(entry.meta).toBe('{"key":"value"}');
});

test("log with undefined meta stores no meta field", () => {
  clearLogBuffer();
  log.ai("no meta");
  const buffer = getLogBuffer();
  expect(buffer.length).toBeGreaterThanOrEqual(1);
  expect(buffer[0].meta).toBeUndefined();
});
