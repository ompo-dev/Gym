import { StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts } from '@/constants/theme';
import { useColors } from '@/hooks/use-colors';

type Variant = 'title' | 'body' | 'secondary' | 'label' | 'value';

interface AppTextProps extends TextProps {
  variant?: Variant;
  color?: string;
}

export function AppText({ variant = 'body', color, style, ...rest }: AppTextProps) {
  const colors = useColors();
  const fallback =
    variant === 'secondary' || variant === 'label' ? colors.textSecondary : colors.text;
  return <Text style={[styles[variant], { color: color ?? fallback }, style]} {...rest} />;
}

const styles = StyleSheet.create({
  title: { fontFamily: Fonts?.rounded, fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
  body: { fontSize: 17, fontWeight: '400' },
  secondary: { fontSize: 15, fontWeight: '400' },
  label: { fontSize: 13, fontWeight: '600' },
  value: { fontFamily: Fonts?.rounded, fontSize: 16, fontWeight: '700' },
});
