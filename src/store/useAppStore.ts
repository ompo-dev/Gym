import { Appearance } from 'react-native';
import { create } from 'zustand';

import { todayISO } from '@/core/date';
import type { ApiKeyMode, ApiKeys } from '@/core/enrich/types';
import {
  defaultOnboardingProfile,
  micronutrientsFromTrack,
  normalizeOnboardingProfile,
  type OnboardingProfile,
} from '@/core/onboarding';
import type { Domain, Entry } from '@/core/types';
import { wipeAllData } from '@/data/db';
import { SettingsRepository } from '@/data/SettingsRepository';
import { defaultLang, registerLangGetter, type Lang } from '@/i18n';

export interface DayState {
  date: string;
  entries: Entry[];
}

export type ThemeMode = 'system' | 'light' | 'dark';

interface AppState {
  food: DayState;
  workout: DayState;
  onboarding: DayState;
  theme: ThemeMode;
  lang: Lang;
  prefsLoaded: boolean;
  onboardingDone: boolean;
  onboardingProfile: OnboardingProfile | null;
  apiKeys: ApiKeys;
  setApiKeys: (patch: Partial<ApiKeys>) => Promise<void>;
  setDate: (domain: Domain, date: string) => void;
  setEntries: (domain: Domain, entries: Entry[]) => void;
  upsertEntry: (domain: Domain, entry: Entry) => void;
  removeEntry: (domain: Domain, id: string) => void;
  hydratePrefs: () => Promise<void>;
  setTheme: (theme: ThemeMode) => Promise<void>;
  setLang: (lang: Lang) => Promise<void>;
  completeOnboarding: (profile: OnboardingProfile) => Promise<void>;
  updateOnboardingProfile: (patch: Partial<OnboardingProfile>) => Promise<void>;
  signOut: () => Promise<void>;
  eraseAllData: () => Promise<void>;
}

const emptyDay = (): DayState => ({ date: todayISO(), entries: [] });
const THEME_KEY = 'theme';
const LANG_KEY = 'lang';
const ONBOARDING_DONE_KEY = 'onboarding_done';
const ONBOARDING_PROFILE_KEY = 'onboarding_profile';
const API_MODE_KEY = 'api_mode';
const API_KEY_CHAT_KEY = 'api_key_chat';
const API_KEY_IMAGE_KEY = 'api_key_image';

const defaultApiKeys = (): ApiKeys => ({ mode: 'managed', chat: '', image: '' });

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark';
}

function isLang(value: string | null): value is Lang {
  return value === 'pt-BR' || value === 'en-US';
}

function applyTheme(theme: ThemeMode): void {
  // react-native-web does not implement setColorScheme; there the OS preference
  // is the only source and forcing it is a no-op rather than a crash.
  Appearance.setColorScheme?.(theme === 'system' ? null : theme);
}

/**
 * In-memory source of truth for the *visible* day of each vertical. SQLite is
 * the disk; this store holds only what's on screen, so switching tabs/days
 * never inflates memory. Preferences live here too so theme/lang changes
 * propagate instantly through the app.
 */
export const useAppStore = create<AppState>((set) => ({
  food: emptyDay(),
  workout: emptyDay(),
  onboarding: emptyDay(),
  theme: 'system',
  lang: defaultLang,
  prefsLoaded: false,
  onboardingDone: false,
  onboardingProfile: null,
  apiKeys: defaultApiKeys(),

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

  hydratePrefs: async () => {
    try {
      const [
        storedTheme,
        storedLang,
        storedOnboardingDone,
        storedOnboardingProfile,
        storedApiMode,
        storedChatKey,
        storedImageKey,
      ] = await Promise.all([
        SettingsRepository.get(THEME_KEY),
        SettingsRepository.get(LANG_KEY),
        SettingsRepository.get(ONBOARDING_DONE_KEY),
        SettingsRepository.get(ONBOARDING_PROFILE_KEY),
        SettingsRepository.get(API_MODE_KEY),
        SettingsRepository.get(API_KEY_CHAT_KEY),
        SettingsRepository.get(API_KEY_IMAGE_KEY),
      ]);
      const theme = isThemeMode(storedTheme) ? storedTheme : 'system';
      const lang = isLang(storedLang) ? storedLang : defaultLang;
      applyTheme(theme);
      set({
        theme,
        lang,
        prefsLoaded: true,
        onboardingDone: storedOnboardingDone === '1',
        onboardingProfile: parseOnboardingProfile(storedOnboardingProfile),
        apiKeys: {
          mode: storedApiMode === 'own' ? 'own' : 'managed',
          chat: storedChatKey ?? '',
          image: storedImageKey ?? '',
        },
      });
    } catch {
      applyTheme('system');
      set({ prefsLoaded: true });
    }
  },

  setTheme: async (theme) => {
    applyTheme(theme);
    set({ theme });
    await SettingsRepository.set(THEME_KEY, theme);
  },

  setLang: async (lang) => {
    set({ lang });
    await SettingsRepository.set(LANG_KEY, lang);
  },

  setApiKeys: async (patch) => {
    const next: ApiKeys = { ...useAppStore.getState().apiKeys, ...patch };
    // Switching to your own key without one saved would just fail every
    // request, so an empty key falls back to the managed mode.
    const mode: ApiKeyMode = next.mode === 'own' && !next.chat.trim() ? 'managed' : next.mode;
    const resolved: ApiKeys = { ...next, mode };
    set({ apiKeys: resolved });
    await Promise.all([
      SettingsRepository.set(API_MODE_KEY, resolved.mode),
      SettingsRepository.set(API_KEY_CHAT_KEY, resolved.chat.trim()),
      SettingsRepository.set(API_KEY_IMAGE_KEY, resolved.image.trim()),
    ]);
  },

  completeOnboarding: async (profile) => {
    profile = normalizeOnboardingProfile(profile);
    set({ onboardingDone: true, onboardingProfile: profile });
    await Promise.all([
      SettingsRepository.set(ONBOARDING_DONE_KEY, '1'),
      SettingsRepository.set(ONBOARDING_PROFILE_KEY, JSON.stringify(profile)),
    ]);
  },

  updateOnboardingProfile: async (patch) => {
    // Falls back to the defaults rather than bailing: onboarding writes the
    // profile before it is finished, so `onboardingProfile` is still null the
    // first time round. Bailing there silently dropped every answer — the goals
    // sheet kept reading defaults and micronutrients never showed up.
    const current = useAppStore.getState().onboardingProfile ?? defaultOnboardingProfile();
    const merged = {
      ...current,
      ...patch,
      ...('trackMicronutrients' in patch && !('micronutrients' in patch)
        ? { micronutrients: micronutrientsFromTrack(Boolean(patch.trackMicronutrients)) }
        : {}),
    };
    const profile = normalizeOnboardingProfile(merged);
    set({ onboardingProfile: profile });
    await SettingsRepository.set(ONBOARDING_PROFILE_KEY, JSON.stringify(profile));
  },

  // Clears the onboarding flag so RootLayout swaps back to a fresh OnboardingFlow.
  signOut: async () => {
    set({ onboardingDone: false, onboardingProfile: null });
    await Promise.all([
      SettingsRepository.set(ONBOARDING_DONE_KEY, '0'),
      SettingsRepository.set(ONBOARDING_PROFILE_KEY, ''),
    ]);
  },

  /**
   * Account deletion, locally: every row dropped and every value in memory back
   * to what a fresh install holds. Disk first — a crash between the two must
   * leave nothing behind, and the reverse order would leave a wiped screen in
   * front of data that is still on the device.
   *
   * The theme is deliberately kept: it is how the app looks, not something the
   * user typed, and flipping it to system on the way out reads as a glitch.
   */
  eraseAllData: async () => {
    await wipeAllData();
    set({
      food: emptyDay(),
      workout: emptyDay(),
      onboarding: emptyDay(),
      onboardingDone: false,
      onboardingProfile: null,
      apiKeys: defaultApiKeys(),
    });
    await SettingsRepository.set(THEME_KEY, useAppStore.getState().theme);
  },
}));

registerLangGetter(() => useAppStore.getState().lang);

function parseOnboardingProfile(value: string | null): OnboardingProfile | null {
  if (!value) return null;
  try {
    return normalizeOnboardingProfile(JSON.parse(value) as Partial<OnboardingProfile>);
  } catch {
    return null;
  }
}
