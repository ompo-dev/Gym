import { Redirect } from 'expo-router';

import { DayTemplate } from '@/components/templates/DayTemplate';
import { useScopeEnabled } from '@/core/dev/flags';
import { foodConfig } from '@/domains/food';

export default function DietScreen() {
  if (!useScopeEnabled('food')) return <Redirect href="/workout" />;
  return <DayTemplate config={foodConfig} />;
}
