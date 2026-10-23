import { Platform, UIManager } from 'react-native';
import { ScrollEdgeBar } from 'react-native-scroll-edge-bar';
import { DayScrollFrame as Fallback, type DayScrollFrameProps } from './DayScrollFrameFallback';

// Keep existing OTA binaries usable until the native module is installed.
const nativeEdges = Number(Platform.Version) >= 26 && UIManager.hasViewManagerConfig('RNScrollEdgeBar');

export function DayScrollFrame({ header, footer, children }: DayScrollFrameProps) {
  if (!nativeEdges) return <Fallback header={header} footer={footer}>{children}</Fallback>;
  // safeAreaBar owns the system inset; another safe-area wrapper moves the header.
  return <ScrollEdgeBar style={{ flex: 1 }} prefersGlassEffect topEdgeEffectStyle="soft" bottomEdgeEffectStyle="soft">
    <ScrollEdgeBar.TopBar>{header}</ScrollEdgeBar.TopBar>
    {children({ top: 8, bottom: 16 })}
    <ScrollEdgeBar.BottomBar>{footer}</ScrollEdgeBar.BottomBar>
  </ScrollEdgeBar>;
}
