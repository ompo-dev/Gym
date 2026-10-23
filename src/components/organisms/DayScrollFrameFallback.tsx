import { BlurTargetView } from 'expo-blur';
import { type ReactNode, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { SoftEdgeBlur } from '@/components/atoms/SoftEdgeBlur';
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
  const [top, setTop] = useState(64);
  const [bottom, setBottom] = useState(safe.bottom + 100);
  const tint = colors.background === '#242424' ? 'systemMaterialDark' : 'light';
  return <SafeAreaView style={styles.fill} edges={['top', 'left', 'right']}>
    <View style={styles.fill}>
      <BlurTargetView ref={target} style={styles.fill}>{children({ top, bottom })}</BlurTargetView>
      <View pointerEvents="none" style={[styles.top, { height: top + 24 }]}>
        <SoftEdgeBlur edge="top" blurTarget={target} tint={tint} />
      </View>
      <View pointerEvents="none" style={[styles.bottom, { height: bottom + 24 }]}>
        <SoftEdgeBlur edge="bottom" blurTarget={target} tint={tint} />
      </View>
      <View pointerEvents="box-none" style={styles.top}
        onLayout={({ nativeEvent }) => setTop(nativeEvent.layout.height)}>
        {header}
      </View>
      <View pointerEvents="box-none" style={styles.bottom} onLayout={({ nativeEvent }) => setBottom(nativeEvent.layout.height)}>
        {footer}
      </View>
    </View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  top: { position: 'absolute', top: 0, left: 0, right: 0 },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0 },
});
