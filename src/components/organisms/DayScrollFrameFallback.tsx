import { BlurTargetView } from 'expo-blur';
import { type ReactNode, useRef, useState } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaFrame, useSafeAreaInsets } from 'react-native-safe-area-context';
import { SoftEdgeBlur } from '@/components/atoms/SoftEdgeBlur';
import { useColors } from '@/hooks/use-colors';

export interface DayScrollFrameProps {
  header: ReactNode;
  footer: ReactNode;
  bottomEdgeHeight: number;
  children: (insets: { top: number; bottom: number }) => ReactNode;
}

/** Content scrolls behind the bars; padding keeps the first and last rows reachable. */
export function DayScrollFrame({ header, footer, bottomEdgeHeight, children }: DayScrollFrameProps) {
  const safe = useSafeAreaInsets();
  const frame = useSafeAreaFrame();
  const window = useWindowDimensions();
  const bottomExtension = Platform.OS === 'ios'
    ? Math.max(0, window.height - frame.y - frame.height)
    : 0;
  const colors = useColors();
  const target = useRef<View>(null);
  const [top, setTop] = useState(64);
  const [bottom, setBottom] = useState(safe.bottom + 100);
  const tint = colors.background === '#242424' ? 'systemMaterialDark' : 'light';
  return <View testID="day-scroll-frame" style={[styles.fill, Platform.OS === 'ios' && { flex: 0, height: frame.height + bottomExtension }]}>
    <BlurTargetView ref={target} style={styles.fill}>
      <View style={[styles.fill, { paddingLeft: safe.left, paddingRight: safe.right }]}>
        {children({ top: safe.top + top, bottom: bottom + bottomExtension })}
      </View>
    </BlurTargetView>
    <View pointerEvents="none" style={[styles.top, { height: safe.top + top + 24 }]}>
      <SoftEdgeBlur edge="top" blurTarget={target} tint={tint} />
    </View>
    {/* The screen edge belongs to the tabs, not the expanding totals panel. */}
    <View testID="day-bottom-edge" pointerEvents="none" style={[styles.bottom, { height: bottomEdgeHeight }]}>
      <SoftEdgeBlur edge="bottom" blurTarget={target} tint={tint} />
    </View>
    {/* Extend only the background beneath native tabs; keep the controls at their original scene edge. */}
    <SafeAreaView testID="day-scroll-controls" pointerEvents="box-none" style={[StyleSheet.absoluteFill, { bottom: bottomExtension }]} edges={['top', 'left', 'right']}>
      <View pointerEvents="box-none" style={styles.fill}>
        <View pointerEvents="box-none" style={styles.top}
          onLayout={({ nativeEvent }) => setTop(nativeEvent.layout.height)}>
          {header}
        </View>
        <View pointerEvents="box-none" style={styles.bottom} onLayout={({ nativeEvent }) => setBottom(nativeEvent.layout.height)}>
          {footer}
        </View>
      </View>
    </SafeAreaView>
  </View>;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  top: { position: 'absolute', top: 0, left: 0, right: 0 },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0 },
});
