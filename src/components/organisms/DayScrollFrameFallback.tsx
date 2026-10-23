import { BlurTargetView } from 'expo-blur';
import { type ReactNode, useCallback, useRef, useState } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaFrame, useSafeAreaInsets } from 'react-native-safe-area-context';
import { SoftEdgeBlur } from '@/components/atoms/SoftEdgeBlur';
import { BottomEdgeBlur } from '@/components/atoms/BottomEdgeBlur';
import { useColors } from '@/hooks/use-colors';
import { log } from '@/core/log';

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
  const root = useRef<View>(null);
  const [measuredOrigin, setMeasuredOrigin] = useState<{ y: number; width: number; height: number } | null>(null);
  const originY = measuredOrigin?.width === window.width && measuredOrigin.height === window.height
    ? measuredOrigin.y : frame.y;
  const rootHeight = Math.max(0, window.height - originY);
  // Preserve the existing controls' scene edge. Only the background extends to the window edge.
  const bottomExtension = Platform.OS === 'ios' ? rootHeight - frame.height : 0;
  const measureWindowEdge = useCallback(() => {
    if (Platform.OS !== 'ios') return;
    root.current?.measureInWindow((_x, y, width, height) => {
      if (!width || !height || !Number.isFinite(y)) return;
      setMeasuredOrigin((previous) => previous?.y === y && previous.width === window.width && previous.height === window.height
        ? previous : { y, width: window.width, height: window.height });
      log.ui('day.bottomEdge.layout', { originY: y, measuredHeight: height, windowHeight: window.height,
        measuredBottom: y + height, edgeBottom: window.height, edgeHeight: bottomEdgeHeight, renderer: 'swiftui-material' });
    });
  }, [window.width, window.height, bottomEdgeHeight]);
  const colors = useColors();
  const target = useRef<View>(null);
  const [top, setTop] = useState(64);
  const [bottom, setBottom] = useState(safe.bottom + 100);
  const tint = colors.background === '#242424' ? 'systemMaterialDark' : 'light';
  return <View ref={root} collapsable={false} onLayout={measureWindowEdge} testID="day-scroll-frame"
    style={[styles.fill, Platform.OS === 'ios' && { flex: 0, height: rootHeight }]}>
    <BlurTargetView ref={target} style={styles.fill}>
      <View style={[styles.fill, { paddingLeft: safe.left, paddingRight: safe.right }]}>
        {children({ top: safe.top + top, bottom: bottom + Math.max(0, bottomExtension) })}
      </View>
    </BlurTargetView>
    <View testID="day-top-edge" pointerEvents="none" style={[styles.top, { height: safe.top + top + 24 }]}>
      <SoftEdgeBlur edge="top" blurTarget={target} tint={tint} />
    </View>
    {/* The screen edge belongs to the tabs, not the expanding totals panel. */}
    <View testID="day-bottom-edge" pointerEvents="none" style={[styles.bottom, { height: bottomEdgeHeight }]}>
      <BottomEdgeBlur blurTarget={target} tint={tint} />
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
