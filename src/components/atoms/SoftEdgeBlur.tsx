import MaskedView from '@react-native-masked-view/masked-view';
import { BlurView, type BlurViewProps } from 'expo-blur';
import { useId } from 'react';
import { StyleSheet, UIManager } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

export type SoftEdgeBlurProps = Pick<BlurViewProps, 'blurTarget' | 'tint'> & {
  edge: 'top' | 'bottom';
};

const supportsMask = UIManager.hasViewManagerConfig('RNCMaskedView');

/** Only the background is masked; bar controls stay above this layer. */
export function SoftEdgeBlur({ edge, blurTarget, tint }: SoftEdgeBlurProps) {
  const id = useId().replace(/:/g, '');
  if (!supportsMask) return null;
  return <MaskedView pointerEvents="none" style={StyleSheet.absoluteFill} maskElement={
    <Svg width="100%" height="100%">
      <Defs>
        <LinearGradient id={id} x1="0" y1={edge === 'top' ? '0%' : '100%'} x2="0" y2={edge === 'top' ? '100%' : '0%'}>
          <Stop offset="0" stopColor="black" stopOpacity={1} />
          <Stop offset="0.35" stopColor="black" stopOpacity={0.85} />
          <Stop offset="0.7" stopColor="black" stopOpacity={0.3} />
          <Stop offset="1" stopColor="black" stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  }>
    <BlurView blurTarget={blurTarget} blurMethod="dimezisBlurViewSdk31Plus" tint={tint} intensity={30} style={StyleSheet.absoluteFill} />
  </MaskedView>;
}
