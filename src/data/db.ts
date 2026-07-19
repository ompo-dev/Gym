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
          media TEXT,
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
        CREATE TABLE IF NOT EXISTS saved_meals (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          data TEXT NOT NULL,
          media TEXT,
          sourceEntryId TEXT,
          createdAt INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS saved_workouts (
          id TEXT PRIMARY KEY NOT NULL,
          kind TEXT NOT NULL,
          name TEXT NOT NULL,
          exercises TEXT NOT NULL,
          sourceEntryId TEXT,
          sourceDate TEXT,
          createdAt INTEGER NOT NULL
        );
      `);
      const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(entries)');
      if (!columns.some((column) => column.name === 'media')) {
        await db.execAsync('ALTER TABLE entries ADD COLUMN media TEXT;');
      }
      const savedMealColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(saved_meals)');
      if (!savedMealColumns.some((column) => column.name === 'media')) {
        await db.execAsync('ALTER TABLE saved_meals ADD COLUMN media TEXT;');
      }
      if (!savedMealColumns.some((column) => column.name === 'sourceEntryId')) {
        await db.execAsync('ALTER TABLE saved_meals ADD COLUMN sourceEntryId TEXT;');
      }
      await db.execAsync(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_meals_source
          ON saved_meals (sourceEntryId)
          WHERE sourceEntryId IS NOT NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_workouts_source
          ON saved_workouts (sourceEntryId)
          WHERE sourceEntryId IS NOT NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_workouts_day
          ON saved_workouts (sourceDate)
          WHERE sourceDate IS NOT NULL AND kind = 'day';
      `);
      return db;
    })();
  }
  return dbPromise;
}
