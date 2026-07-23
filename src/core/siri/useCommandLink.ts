import { useURL } from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';

import { bus } from '@/core/command/bus';
import { todayISO } from '@/core/date';
import { log } from '@/core/log';
import { useAppStore } from '@/store/useAppStore';

import { parseCommandLink, type CommandLink } from './commandLink';

/**
 * Focus the target day and log the dictated note through the ordinary enrich
 * pipeline — identical to a note typed by hand, which is the whole point: the
 * confirmation "preview" the user asked for is just the entry appearing in the
 * list and resolving into its calories / sets.
 */
export function runCommandLink(cmd: CommandLink): void {
  const date = cmd.date ?? todayISO();
  useAppStore.getState().setDate(cmd.domain, date);
  router.navigate(cmd.domain === 'workout' ? '/workout' : '/');
  void bus.addEntry(cmd.text, cmd.domain, undefined, date);
  log.nav('siri command', { domain: cmd.domain, chars: cmd.text.length });
}

/**
 * Runs a `gym://add?...` deep link once it lands. `useURL` covers both the cold
 * start (app launched by Siri) and the warm case. Gated on `ready` so a command
 * that arrives before onboarding is done waits for the tabs to exist before it
 * navigates.
 *
 * ponytail: the same URL string won't refire (dedup ref) — repeating the exact
 * dictated phrase in one session is rare. Swap to `Linking.addEventListener` if
 * that assumption ever bites.
 */
export function useCommandLink(ready: boolean): void {
  const url = useURL();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!ready || !url || handled.current === url) return;
    handled.current = url;
    const cmd = parseCommandLink(url);
    if (cmd) runCommandLink(cmd);
  }, [ready, url]);
}
