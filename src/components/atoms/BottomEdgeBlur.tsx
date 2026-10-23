import { SoftEdgeBlur, type SoftEdgeBlurProps } from './SoftEdgeBlur';

export function BottomEdgeBlur(props: Omit<SoftEdgeBlurProps, 'edge'>) {
  return <SoftEdgeBlur {...props} edge="bottom" />;
}
