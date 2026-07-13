/**
 * Tiny reactive i18n. Two locales (pt-BR default + en-US). The active language
 * lives in the settings store; i18n reads it through a registered getter so it
 * stays decoupled (no import cycle) and updates at runtime. ponytail: a dict +
 * t() beats an i18n library for two languages.
 */
const dict = {
  'pt-BR': {
    'diet.title': 'Dieta',
    'workout.title': 'Treino',
    'diet.placeholder': 'Adicionar comida…  ex: "hambúrguer com batata frita"',
    'workout.placeholder': 'Registrar série…  ex: "supino 95x7"',
    'status.thinking': 'pensando',
    'status.queued': 'na fila',
    'status.retry': 'repetir',
    'undo.deleted': 'Item apagado',
    'undo.action': 'Desfazer',
    'date.today': 'Hoje',
    'date.yesterday': 'Ontem',
    'totals.sets': 'séries',
    'totals.vol': 'vol',
    'macro.carbs': 'C',
    'macro.protein': 'P',
    'macro.fat': 'G',
    'settings.title': 'Ajustes',
    'settings.theme': 'Tema',
    'settings.language': 'Idioma',
    'settings.done': 'Concluir',
    'theme.system': 'Sistema',
    'theme.light': 'Claro',
    'theme.dark': 'Escuro',
  },
  'en-US': {
    'diet.title': 'Diet',
    'workout.title': 'Workout',
    'diet.placeholder': 'Add food…  e.g. "in n out burger and fries"',
    'workout.placeholder': 'Log a set…  e.g. "bench 95x7"',
    'status.thinking': 'thinking',
    'status.queued': 'queued',
    'status.retry': 'retry',
    'undo.deleted': 'Entry deleted',
    'undo.action': 'Undo',
    'date.today': 'Today',
    'date.yesterday': 'Yesterday',
    'totals.sets': 'sets',
    'totals.vol': 'vol',
    'macro.carbs': 'C',
    'macro.protein': 'P',
    'macro.fat': 'F',
    'settings.title': 'Settings',
    'settings.theme': 'Theme',
    'settings.language': 'Language',
    'settings.done': 'Done',
    'theme.system': 'System',
    'theme.light': 'Light',
    'theme.dark': 'Dark',
  },
} as const;

export type Lang = keyof typeof dict;
type Key = keyof (typeof dict)['pt-BR'];

function resolveEnvLang(): Lang {
  const raw = (process.env.EXPO_PUBLIC_LANG ?? 'pt-BR').toLowerCase();
  return raw.startsWith('en') ? 'en-US' : 'pt-BR';
}

/** Build-time default from EXPO_PUBLIC_LANG; overridden at runtime via settings. */
export const defaultLang: Lang = resolveEnvLang();

let langGetter: () => Lang = () => defaultLang;
export function registerLangGetter(fn: () => Lang): void {
  langGetter = fn;
}
export function getLang(): Lang {
  return langGetter();
}

export function languageNameOf(lang: Lang): string {
  return lang === 'en-US' ? 'English' : 'Brazilian Portuguese';
}

export function t(key: Key): string {
  return dict[getLang()][key];
}
