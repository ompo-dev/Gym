import { useCallback, useEffect } from 'react';

import { bus } from '@/core/command/bus';
import { addDays, todayISO } from '@/core/date';
import type { Domain, Entry } from '@/core/types';
import { EntryRepository } from '@/data/EntryRepository';
import { useAppStore } from '@/store/useAppStore';

/** Loads the visible day for a vertical from SQLite and exposes stable actions. */
export function useDay(domain: Domain) {
  const day = useAppStore((s) => s[domain]);
  const setEntries = useAppStore((s) => s.setEntries);
  const setDate = useAppStore((s) => s.setDate);

  useEffect(() => {
    let alive = true;
    EntryRepository.findByDate(domain, day.date).then((entries) => {
      if (alive) setEntries(domain, entries);
    });
    return () => {
      alive = false;
    };
  }, [domain, day.date, setEntries]);

  const addEntry = useCallback((text: string) => void bus.addEntry(text, domain), [domain]);
  const editEntry = useCallback(
    (entry: Entry, text: string) => void bus.editEntry(entry, text),
    [],
  );
  const deleteEntry = useCallback((entry: Entry) => void bus.deleteEntry(entry), []);
  const retryEntry = useCallback((entry: Entry) => bus.retry(entry), []);
  const undo = useCallback(() => bus.undo(), []);
  const goPrev = useCallback(
    () => setDate(domain, addDays(day.date, -1)),
    [domain, day.date, setDate],
  );
  const goNext = useCallback(() => {
    const next = addDays(day.date, 1);
    if (next <= todayISO()) setDate(domain, next);
  }, [domain, day.date, setDate]);
  const goToday = useCallback(() => setDate(domain, todayISO()), [domain, setDate]);

  return {
    date: day.date,
    entries: day.entries,
    canGoNext: day.date < todayISO(),
    addEntry,
    editEntry,
    deleteEntry,
    retryEntry,
    undo,
    goPrev,
    goNext,
    goToday,
  };
}
