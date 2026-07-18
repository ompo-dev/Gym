import { Appearance } from 'react-native';
import { create } from 'zustand';

import { todayISO } from '@/core/date';
import {
  micronutrientsFromTrack,
  normalizeOnboardingProfile,
  type OnboardingProfile,
} from '@/core/onboarding';
import type { Domain, Entry } from '@/core/types';
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
  theme: ThemeMode;
  lang: Lang;
  prefsLoaded: boolean;
  onboardingDone: boolean;
  onboardingProfile: OnboardingProfile | null;
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
}

const emptyDay = (): DayState => ({ date: todayISO(), entries: [] });
const THEME_KEY = 'theme';
const LANG_KEY = 'lang';
const ONBOARDING_DONE_KEY = 'onboarding_done';
const ONBOARDING_PROFILE_KEY = 'onboarding_profile';

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark';
}

function isLang(value: string | null): value is Lang {
  return value === 'pt-BR' || value === 'en-US';
}

function applyTheme(theme: ThemeMode): void {
  Appearance.setColorScheme(theme === 'system' ? null : theme);
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
  theme: 'system',
  lang: defaultLang,
  prefsLoaded: false,
  onboardingDone: false,
  onboardingProfile: null,

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
      const [storedTheme, storedLang, storedOnboardingDone, storedOnboardingProfile] =
        await Promise.all([
        SettingsRepository.get(THEME_KEY),
        SettingsRepository.get(LANG_KEY),
        SettingsRepository.get(ONBOARDING_DONE_KEY),
        SettingsRepository.get(ONBOARDING_PROFILE_KEY),
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

  completeOnboarding: async (profile) => {
    profile = normalizeOnboardingProfile(profile);
    set({ onboardingDone: true, onboardingProfile: profile });
    await Promise.all([
      SettingsRepository.set(ONBOARDING_DONE_KEY, '1'),
      SettingsRepository.set(ONBOARDING_PROFILE_KEY, JSON.stringify(profile)),
    ]);
  },

  updateOnboardingProfile: async (patch) => {
    const current = useAppStore.getState().onboardingProfile;
    if (!current) return;
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
