import { readJson, writeJson } from "./webStorage";

const TABLE = "settings";

type SettingsRecord = Record<string, string>;

function readSettings(): SettingsRecord {
  return readJson<SettingsRecord>(TABLE, {});
}

/** Tiny key-value store for user settings (theme, language). */
export const SettingsRepository = {
  async get(key: string): Promise<string | null> {
    return readSettings()[key] ?? null;
  },

  async set(key: string, value: string): Promise<void> {
    writeJson(TABLE, { ...readSettings(), [key]: value });
  },
};
