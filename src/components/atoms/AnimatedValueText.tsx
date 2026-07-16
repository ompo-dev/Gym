import { useEffect, useRef } from 'react';
import type { TextProps } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { AppText } from '@/components/atoms/AppText';

interface AnimatedValueTextProps extends TextProps {
  value: string;
  variant?: React.ComponentProps<typeof AppText>['variant'];
  color?: string;
}

export function AnimatedValueText({
  value,
  variant = 'value',
  color,
  style,
  ...rest
}: AnimatedValueTextProps) {
  const opacity = useSharedValue(1);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const previousValue = useRef<number | null>(readNumericValue(value));

  useEffect(() => {
    const currentValue = readNumericValue(value);
    const direction =
      currentValue !== null && previousValue.current !== null && currentValue < previousValue.current
        ? -1
        : 1;

    opacity.value = 0.62;
    translateY.value = direction * 7;
    scale.value = 0.985;

    opacity.value = withTiming(1, {
      duration: 180,
      easing: Easing.out(Easing.quad),
    });
    translateY.value = withTiming(0, {
      duration: 260,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
    });
    scale.value = withTiming(1, {
      duration: 260,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
    });

    previousValue.current = currentValue;
  }, [opacity, scale, translateY, value]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <AppText variant={variant} color={color} style={style} {...rest}>
        {value}
      </AppText>
    </Animated.View>
  );
}

function readNumericValue(value: string): number | null {
  const match = value.match(/-?\d+(?:[.,]\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0].replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}
