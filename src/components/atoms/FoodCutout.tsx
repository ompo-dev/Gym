import { useId } from 'react';
import Svg, { ClipPath, Defs, Image, Polygon } from 'react-native-svg';

import { cutoutGeometry } from '@/core/food/photo-cutouts';
import type { FoodPhotoCutout } from '@/core/types';

export function FoodCutout({ uri, imageWidth, imageHeight, cutout, width, height }: {
  uri: string;
  imageWidth: number;
  imageHeight: number;
  cutout: FoodPhotoCutout;
  width: number | string;
  height: number | string;
}) {
  const clipId = `food${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const geometry = cutoutGeometry(cutout, imageWidth, imageHeight);
  return (
    <Svg width={width} height={height} viewBox={geometry.viewBox} preserveAspectRatio="xMidYMid meet">
      <Defs><ClipPath id={clipId}><Polygon points={geometry.points} /></ClipPath></Defs>
      <Image href={{ uri }} width={imageWidth} height={imageHeight} clipPath={`url(#${clipId})`} />
    </Svg>
  );
}
