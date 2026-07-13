import { create } from 'zustand';

import { todayISO } from '@/core/date';
import type { Domain, Entry } from '@/core/types';

export interface DayState {
  date: string;
  entries: Entry[];
}

interface AppState {
  food: DayState;
  workout: DayState;
  setDate: (domain: Domain, date: string) => void;
  setEntries: (domain: Domain, entries: Entry[]) => void;
  upsertEntry: (domain: Domain, entry: Entry) => void;
  removeEntry: (domain: Domain, id: string) => void;
}

const emptyDay = (): DayState => ({ date: todayISO(), entries: [] });

/**
 * In-memory source of truth for the *visible* day of each vertical. SQLite is
 * the disk; this store holds only what's on screen, so switching tabs/days
 * never inflates memory. No persist middleware — the repository is the disk.
 */
export const useAppStore = create<AppState>((set) => ({
  food: emptyDay(),
  workout: emptyDay(),

  setDate: (domain, date) =>
    set(() => ({ [domain]: { date, entries: [] } }) as Partial<AppState>),

  setEntries: (domain, entries) =>
    set((s) => ({ [domain]: { ...s[domain], entries } }) as Partial<AppState>),

  upsertEntry: (domain, entry) =>
    set((s) => {
      const day = s[domain];
      if (entry.date !== day.date) return {}; // not the visible day → ignore
      const idx = day.entries.findIndex((e) => e.id === entry.id);
      const entries =
        idx === -1
          ? [...day.entries, entry]
          : day.entries.map((e) => (e.id === entry.id ? entry : e));
      return { [domain]: { ...day, entries } } as Partial<AppState>;
    }),

  removeEntry: (domain, id) =>
    set((s) => {
      const day = s[domain];
      return {
        [domain]: { ...day, entries: day.entries.filter((e) => e.id !== id) },
      } as Partial<AppState>;
    }),
}));
