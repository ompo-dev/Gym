import { BlurView } from 'expo-blur';
import type { SoftEdgeBlurProps } from './SoftEdgeBlur';

export function SoftEdgeBlur({ edge, tint }: SoftEdgeBlurProps) {
  const mask = `linear-gradient(to ${edge === 'top' ? 'bottom' : 'top'}, black 0%, rgba(0,0,0,0.85) 35%, rgba(0,0,0,0.3) 70%, transparent 100%)`;
  return <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', maskImage: mask, WebkitMaskImage: mask }}>
    <BlurView tint={tint} intensity={30} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} />
  </div>;
}
