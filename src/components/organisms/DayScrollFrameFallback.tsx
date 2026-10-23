import { BlurTargetView, BlurView } from 'expo-blur';
import { type ReactNode, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/use-colors';

export interface DayScrollFrameProps {
  header: ReactNode;
  footer: ReactNode;
  children: (insets: { top: number; bottom: number }) => ReactNode;
}

/** Content scrolls behind the bars; padding keeps the first and last rows reachable. */
export function DayScrollFrame({ header, footer, children }: DayScrollFrameProps) {
  const safe = useSafeAreaInsets();
  const colors = useColors();
  const target = useRef<View>(null);
  const [top, setTop] = useState(safe.top + 64);
  const [bottom, setBottom] = useState(safe.bottom + 100);
  return <View style={[styles.fill, { paddingLeft: safe.left, paddingRight: safe.right }]}>
    <BlurTargetView ref={target} style={styles.fill}>{children({ top, bottom })}</BlurTargetView>
    <View pointerEvents="box-none" style={[styles.top, { paddingTop: safe.top }]}
      onLayout={({ nativeEvent }) => setTop(nativeEvent.layout.height)}>
      <BlurView pointerEvents="none" blurTarget={target} blurMethod="dimezisBlurViewSdk31Plus" tint={colors.background === '#242424' ? 'systemMaterialDark' : 'light'} intensity={70} style={StyleSheet.absoluteFill} />
      {header}
    </View>
    <View pointerEvents="box-none" style={styles.bottom} onLayout={({ nativeEvent }) => setBottom(nativeEvent.layout.height)}>
      <BlurView pointerEvents="none" blurTarget={target} blurMethod="dimezisBlurViewSdk31Plus" tint={colors.background === '#242424' ? 'systemMaterialDark' : 'light'} intensity={65} style={StyleSheet.absoluteFill} />
      {footer}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  top: { position: 'absolute', top: 0, left: 0, right: 0, paddingBottom: 8 },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0 },
});
