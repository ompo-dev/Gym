import type { LucideProps } from 'lucide-react-native';
import {
  Apple,
  Asterisk,
  Beef,
  Bell,
  Bookmark,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Check,
  CircleDot,
  Clock3,
  Contrast,
  Crown,
  Droplet,
  Droplets,
  Dumbbell,
  Ellipsis,
  Flame,
  GlassWater,
  Globe,
  Heart,
  Info,
  Keyboard,
  Mic,
  Navigation,
  Pencil,
  Plus,
  Scale,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  SquareStack,
  Star,
  Target,
  Trash2,
  Utensils,
  Wheat,
  X,
} from 'lucide-react-native';

import { useColors } from '@/hooks/use-colors';

const icons = {
  apple: Apple,
  asterisk: Asterisk,
  beef: Beef,
  bell: Bell,
  bookmark: Bookmark,
  check: Check,
  chevronDown: ChevronDown,
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
  chevronUp: ChevronUp,
  circleDot: CircleDot,
  clock: Clock3,
  contrast: Contrast,
  crown: Crown,
  droplet: Droplet,
  droplets: Droplets,
  dumbbell: Dumbbell,
  ellipsis: Ellipsis,
  flame: Flame,
  glassWater: GlassWater,
  globe: Globe,
  heart: Heart,
  info: Info,
  keyboard: Keyboard,
  mic: Mic,
  navigation: Navigation,
  pencil: Pencil,
  plus: Plus,
  scale: Scale,
  settings: Settings2,
  sliders: SlidersHorizontal,
  sparkles: Sparkles,
  squareStack: SquareStack,
  star: Star,
  target: Target,
  trash: Trash2,
  utensils: Utensils,
  wheat: Wheat,
  x: X,
} as const;

export type AppIconName = keyof typeof icons;

interface AppIconProps extends Omit<LucideProps, 'color'> {
  name: AppIconName;
  color?: string;
}

export function AppIcon({
  name,
  color,
  size = 18,
  strokeWidth = 2.1,
  ...rest
}: AppIconProps) {
  const colors = useColors();
  const Icon = icons[name];
  return <Icon color={color ?? colors.text} size={size} strokeWidth={strokeWidth} {...rest} />;
}
