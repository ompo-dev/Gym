import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Fonts } from '@/constants/theme';
import { useColors } from '@/hooks/use-colors';

interface ThinkingIndicatorProps {
  label?: string;
}

/** Pulsing "thinking" text driven on the UI thread by reanimated. */
export function ThinkingIndicator({ label = 'thinking' }: ThinkingIndicatorProps) {
  const colors = useColors();
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(1, { duration: 700, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.Text style={[styles.text, { color: colors.textSecondary }, animatedStyle]}>
      {label}
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  text: { fontFamily: Fonts?.rounded, fontSize: 15, fontWeight: '500' },
});
