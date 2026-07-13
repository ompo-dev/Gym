import * as SQLite from 'expo-sqlite';

/** Single shared connection + schema for entries and settings. */
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('gym.db');
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS entries (
          id TEXT PRIMARY KEY NOT NULL,
          date TEXT NOT NULL,
          domain TEXT NOT NULL,
          text TEXT NOT NULL,
          status TEXT NOT NULL,
          data TEXT,
          error TEXT,
          createdAt INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_entries_day ON entries (domain, date);
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL
        );
      `);
      return db;
    })();
  }
  return dbPromise;
}
