import { Redirect } from 'expo-router';

import { DayTemplate } from '@/components/templates/DayTemplate';
import { useScopeEnabled } from '@/core/dev/flags';
import { workoutConfig } from '@/domains/workout';

export default function WorkoutScreen() {
  if (!useScopeEnabled('workout')) return <Redirect href="/" />;
  return <DayTemplate config={workoutConfig} />;
}
