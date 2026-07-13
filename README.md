# Gym — AI notes for Diet & Workout

A fast, interactive "smart notes" app for iPhone. Type a line in plain language
and the AI structures it inline: food → calories + macros, a set → normalized
`kg × reps`. Optimistic, offline-tolerant, with real Liquid Glass on iOS 26.

Built with **Expo SDK 54** (RN 0.81, React 19.1) — compatible with the App Store
Expo Go — with Expo Router **native glass tabs**, `expo-glass-effect`,
`expo-sqlite`, `zustand`, `zod`, and **DeepSeek** behind a server-side proxy.

## Setup

```bash
npm install
```

Then add your DeepSeek key. It lives **only on the server** (never in the app
bundle):

1. Get a key at https://platform.deepseek.com
2. Put it in `.env` (gitignored):
   ```
   DEEPSEEK_API_KEY=sk-...
   ```

> ⚠️ If you shared a key in plaintext anywhere, **rotate it** — treat it as public.

**Language:** the app ships pt-BR + en-US. Set `EXPO_PUBLIC_LANG=pt-BR` (default)
or `en-US` in `.env` — it drives the UI strings, date labels, and the language
the AI replies in.

## Run

```bash
npx expo start
```

Open in **Expo Go on an iPhone running iOS 26** (scan the QR). The `/api/enrich`
route is served by the Metro dev server, so the app and proxy share one origin
in dev — nothing else to start. Below iOS 26 the glass gracefully falls back to
a translucent panel.

## Scripts

| Command | What |
|---|---|
| `npm start` | Expo dev server |
| `npm test` | Jest (core logic: cache, command bus, schemas, totals) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | `expo lint` |

## Architecture

- **Atomic design** — `src/components/{atoms,molecules,organisms,templates}`.
- **One engine, two verticals** — `DayTemplate` is driven by a `DomainConfig`
  (`src/domains/food.ts`, `workout.ts`); Diet and Workout reuse it.
- **Command pattern** — `src/core/command/CommandBus.ts`: optimistic add,
  undo stack, offline retry queue, in-flight dedup.
- **Cache/memory** — LRU (`src/core/cache/lru.ts`) keyed by text hash + SQLite
  querying only the visible day (`src/data/EntryRepository.ts`).
- **AI proxy** — `src/app/api/enrich+api.ts` holds the key and calls DeepSeek
  (`deepseek-v4-flash`, JSON mode), validating output with zod both server- and
  client-side.

## Deploy the proxy (production)

The `+api.ts` route needs a server. Deploy to EAS Hosting:

```bash
npx expo export
eas deploy            # or: npx eas-cli deploy
eas env:create --name DEEPSEEK_API_KEY --value sk-... --environment production
```

Then set `EXPO_PUBLIC_API_URL` to the deployed origin so the app calls the
hosted proxy instead of the dev server.

## Deferred (phase 2)

Voice input, streak counter, web-search ("sources") entries, exercise grouping,
cloud sync, proxy rate limiting, FlashList. See the plan for the full list.
