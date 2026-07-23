import { parse } from 'expo-linking';
import { z } from 'zod';

/**
 * Deep-link entry point for Siri / the Shortcuts app. Both hosts mean the same
 * thing — "log this" — so `gym://add?...` and `gym://log?...` are accepted.
 *
 * The whole integration rides on the app already being text-first: a dictated
 * phrase is dropped into the exact same enrich pipeline as a note typed by hand,
 * so "comprei 2 bananas" (purchase), "supino 80kg 3x10" (sets), "receita de
 * frango" (recipe) and "monte um treino de peito" (plan) all resolve with no
 * Siri-specific parsing here.
 */
export const COMMAND_HOSTS = ['add', 'log'] as const;
type CommandHost = (typeof COMMAND_HOSTS)[number];

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const commandSchema = z.object({
  text: z.string().trim().min(1).max(500),
  // Omitted → food: foodAuto already tells a meal from a purchase from a recipe
  // on its own. Workout is the branch that has to be asked for by name.
  domain: z.enum(['food', 'workout']).default('food'),
  date: isoDate.optional(),
});

export interface CommandLink {
  text: string;
  domain: 'food' | 'workout';
  /** Omitted means "today" — resolved by the runtime, not here, to keep this pure. */
  date?: string;
}

function first(value: string | (string | null)[] | null | undefined): string | undefined {
  const single = Array.isArray(value) ? value[0] : value;
  return single ?? undefined;
}

/**
 * Parse a deep link into a validated command, or `null` if it is not one of
 * ours (unknown host, blank text, bogus domain, non-`gym` url). Pure — no bus,
 * store or navigation — so it unit-tests without native modules; the side
 * effects live in `useCommandLink`.
 */
export function parseCommandLink(url: string): CommandLink | null {
  const { hostname, path, queryParams } = parse(url);
  const host = (hostname ?? path ?? '').replace(/^\/+/, '').toLowerCase();
  if (!COMMAND_HOSTS.includes(host as CommandHost)) return null;

  const parsed = commandSchema.safeParse({
    text: first(queryParams?.text),
    domain: first(queryParams?.domain),
    date: first(queryParams?.date),
  });
  if (!parsed.success) return null;
  return { text: parsed.data.text, domain: parsed.data.domain, date: parsed.data.date };
}
