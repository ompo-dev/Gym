import { GlassView, type GlassStyle, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useColorScheme, View, type ViewProps } from 'react-native';

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
  const scheme = useColorScheme();

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

  const backgroundColor =
    scheme === 'dark' ? 'rgba(28,28,30,0.92)' : 'rgba(245,245,247,0.92)';
  return (
    <View style={[{ backgroundColor }, style]} {...rest}>
      {children}
    </View>
  );
}
