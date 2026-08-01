import { LIMIT_DEFAULTS, LIMIT_KEYS, getLimit } from "./limits";
import { useAppStore } from "@/store/useAppStore";

jest.mock('@/data/SettingsRepository', () => ({
  SettingsRepository: { get: jest.fn(async () => null), set: jest.fn(async () => undefined) },
}));
jest.mock('@/data/db', () => ({ wipeAllData: jest.fn(async () => undefined) }));

afterEach(() => {
  useAppStore.setState({ devLimits: {} });
});

test("LIMIT_DEFAULTS has a key for every limit", () => {
  for (const key of LIMIT_KEYS) {
    expect(Object.prototype.hasOwnProperty.call(LIMIT_DEFAULTS, key)).toBe(true);
  }
});

test("LIMIT_DEFAULTS has no extra keys", () => {
  const keys = Object.keys(LIMIT_DEFAULTS).sort();
  expect(keys).toEqual([...LIMIT_KEYS].sort());
});

test("getLimit returns the default when no override is set", () => {
  expect(getLimit("maxNotesPerDay")).toBe(LIMIT_DEFAULTS.maxNotesPerDay);
});

test("getLimit returns the override when set", () => {
  useAppStore.getState().setDevLimit("maxNotesPerDay", 5);
  expect(getLimit("maxNotesPerDay")).toBe(5);
});

test("setDevLimit clears override on <= 0", () => {
  useAppStore.getState().setDevLimit("maxNotesPerDay", 0);
  expect(getLimit("maxNotesPerDay")).toBe(LIMIT_DEFAULTS.maxNotesPerDay);

  useAppStore.getState().setDevLimit("maxNotesPerDay", -1);
  expect(getLimit("maxNotesPerDay")).toBe(LIMIT_DEFAULTS.maxNotesPerDay);
});

test("getLimit respects override regardless of __DEV__", () => {
  const origDev = (global as any).__DEV__;
  (global as any).__DEV__ = false;

  useAppStore.getState().setDevLimit("maxNotesPerDay", 5);
  expect(getLimit("maxNotesPerDay")).toBe(5);

  (global as any).__DEV__ = origDev;
});

test("setDevLimit floors the value", () => {
  useAppStore.getState().setDevLimit("noteMaxChars", 50.7);
  expect(getLimit("noteMaxChars")).toBe(50);
});

test("setDevLimit with undefined clears the override", () => {
  useAppStore.getState().setDevLimit("maxPhotosPerDay", 10);
  expect(getLimit("maxPhotosPerDay")).toBe(10);
  useAppStore.getState().setDevLimit("maxPhotosPerDay", undefined);
  expect(getLimit("maxPhotosPerDay")).toBe(LIMIT_DEFAULTS.maxPhotosPerDay);
});
