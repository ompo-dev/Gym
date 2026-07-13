import { DayTemplate } from '@/components/templates/DayTemplate';
import { foodConfig } from '@/domains/food';

export default function DietScreen() {
  return <DayTemplate config={foodConfig} />;
}
