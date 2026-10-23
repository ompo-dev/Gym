import { Host, Mask, Rectangle } from '@expo/ui/swift-ui';
import { foregroundStyle } from '@expo/ui/swift-ui/modifiers';
import { StyleSheet } from 'react-native';

import type { SoftEdgeBlurProps } from './SoftEdgeBlur';

/** ExpoUI ships in existing IPAs; do not silently omit this edge when RNCMaskedView is absent. */
export function BottomEdgeBlur({ tint }: Omit<SoftEdgeBlurProps, 'edge'>) {
  return <Host pointerEvents="none" ignoreSafeArea="all" colorScheme={tint === 'light' ? 'light' : 'dark'} style={StyleSheet.absoluteFill}>
    <Mask>
      <Rectangle modifiers={[foregroundStyle({ type: 'material', material: 'ultraThin' })]} />
      <Mask.Content>
        <Rectangle modifiers={[foregroundStyle({ type: 'linearGradient',
          colors: ['rgba(0,0,0,0)', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0.85)', 'rgba(0,0,0,1)'],
          startPoint: { x: 0, y: 0 }, endPoint: { x: 0, y: 1 },
        })]} />
      </Mask.Content>
    </Mask>
  </Host>;
}
