import { DayTemplate } from '@/components/templates/DayTemplate';
import { workoutConfig } from '@/domains/workout';

export default function WorkoutScreen() {
  return <DayTemplate config={workoutConfig} />;
}
