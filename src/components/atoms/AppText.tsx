import { StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts } from '@/constants/theme';
import { useColors } from '@/hooks/use-colors';

type Variant = 'title' | 'heading' | 'body' | 'secondary' | 'caption' | 'label' | 'value' | 'metric';

interface AppTextProps extends TextProps {
  variant?: Variant;
  color?: string;
}

export function AppText({ variant = 'body', color, style, ...rest }: AppTextProps) {
  const colors = useColors();
  const fallback =
    variant === 'secondary' || variant === 'label' || variant === 'caption'
      ? colors.textSecondary
      : colors.text;
  return <Text style={[styles[variant], { color: color ?? fallback }, style]} {...rest} />;
}

const styles = StyleSheet.create({
  title: {
    fontFamily: Fonts?.rounded,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  heading: {
    fontFamily: Fonts?.rounded,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  body: { fontSize: 18, fontWeight: '400', lineHeight: 25 },
  secondary: { fontSize: 15, fontWeight: '400', lineHeight: 21 },
  caption: { fontSize: 12, fontWeight: '600', lineHeight: 16, letterSpacing: 0.2 },
  label: { fontSize: 13, fontWeight: '700', lineHeight: 17, letterSpacing: 0.2 },
  value: {
    fontFamily: Fonts?.rounded,
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  metric: {
    fontFamily: Fonts?.rounded,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.7,
    fontVariant: ['tabular-nums'],
  },
});
