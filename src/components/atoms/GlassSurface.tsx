import { GlassView, type GlassStyle, isLiquidGlassAvailable } from 'expo-glass-effect';
import { View, type ViewProps } from 'react-native';

import { useColors } from '@/hooks/use-colors';

interface GlassSurfaceProps extends ViewProps {
  glass?: GlassStyle;
  tintColor?: string;
  isInteractive?: boolean;
}

/**
 * Liquid Glass surface with a graceful fallback. On iOS 26 it renders the real
 * system glass; anywhere else it falls back to a themed translucent panel.
 */
export function GlassSurface({
  glass = 'regular',
  tintColor,
  isInteractive,
  style,
  children,
  ...rest
}: GlassSurfaceProps) {
  const colors = useColors();

  if (isLiquidGlassAvailable()) {
    return (
      <GlassView
        glassEffectStyle={glass}
        tintColor={tintColor}
        isInteractive={isInteractive}
        style={style}
        {...rest}>
        {children}
      </GlassView>
    );
  }

  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
        },
        style,
      ]}
      {...rest}>
      {children}
    </View>
  );
}
