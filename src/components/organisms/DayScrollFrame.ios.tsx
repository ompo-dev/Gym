import { Platform, UIManager, View } from 'react-native';
import { ScrollEdgeBar } from 'react-native-scroll-edge-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DayScrollFrame as Fallback, type DayScrollFrameProps } from './DayScrollFrameFallback';

// Keep existing OTA binaries usable until the native module is installed.
const nativeEdges = Number(Platform.Version) >= 26 && UIManager.hasViewManagerConfig('RNScrollEdgeBar');

export function DayScrollFrame({ header, footer, children }: DayScrollFrameProps) {
  const safe = useSafeAreaInsets();
  if (!nativeEdges) return <Fallback header={header} footer={footer}>{children}</Fallback>;
  return <View style={{ flex: 1, paddingTop: safe.top }}>
    <ScrollEdgeBar style={{ flex: 1 }} topEdgeEffectStyle="soft" bottomEdgeEffectStyle="soft">
      <ScrollEdgeBar.TopBar>{header}</ScrollEdgeBar.TopBar>
      {children({ top: 8, bottom: 16 })}
      <ScrollEdgeBar.BottomBar>{footer}</ScrollEdgeBar.BottomBar>
    </ScrollEdgeBar>
  </View>;
}
