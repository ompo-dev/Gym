import { Platform } from 'react-native';

if (Platform.OS === 'web') {
  void import('@/global.css');
}

export const Colors = {
  light: {
    text: '#151312',
    textSecondary: '#6F685F',
    textTertiary: '#9B9387',
    background: '#F7F4EF',
    backgroundElement: '#EFEBE4',
    backgroundSelected: '#E6E0D7',
    surface: '#FFFFFF',
    surfaceMuted: '#F3EEE7',
    surfaceStrong: '#ECE5DB',
    border: 'rgba(21,19,18,0.08)',
    overlay: 'rgba(21,19,18,0.18)',
    accent: '#E6A117',
    accentStrong: '#C88400',
    calories: '#E86F1D',
    carbs: '#7C3AED',
    protein: '#16A34A',
    fat: '#D99A00',
    water: '#0284C7',
    danger: '#E45858',
    success: '#3BA55D',
  },
  dark: {
    text: '#F2F2F2',
    textSecondary: '#C8C8C8',
    textTertiary: '#9E9E9E',
    background: '#242424',
    backgroundElement: '#303030',
    backgroundSelected: '#3A3A3A',
    surface: '#2B2B2B',
    surfaceMuted: '#333333',
    surfaceStrong: '#404040',
    border: 'rgba(255,255,255,0.09)',
    overlay: 'rgba(0,0,0,0.24)',
    accent: '#F0B648',
    accentStrong: '#D69A27',
    calories: '#FF8A2A',
    carbs: '#A78BFA',
    protein: '#4ADE80',
    fat: '#FFD43B',
    water: '#38BDF8',
    danger: '#FF7A7A',
    success: '#4ADE80',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 12,
  four: 16,
  five: 20,
  six: 24,
  seven: 32,
  eight: 48,
} as const;

export const Radii = {
  sm: 14,
  md: 18,
  lg: 22,
  xl: 28,
  pill: 999,
} as const;

export const Metrics = {
  iconButton: 44,
  control: 48,
  dock: 56,
  rowMinHeight: 56,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
