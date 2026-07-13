import { type WorkoutData, workoutSchema } from '@/domains/schemas';
import type { DomainConfig } from '@/domains/types';
import { t } from '@/i18n';

export interface WorkoutTotals {
  sets: number;
  volumeKg: number;
}

const toKg = (weight: number, unit: 'kg' | 'lb'): number =>
  unit === 'lb' ? weight * 0.45359237 : weight;

/** Volume is computed here (weight × reps), never by the AI. */
export const workoutConfig: DomainConfig<WorkoutData, WorkoutTotals> = {
  id: 'workout',
  title: t('workout.title'),
  placeholder: t('workout.placeholder'),
  accent: '#FFB020',
  schema: workoutSchema,
  formatResult: (d) => {
    const body = d.sets.map((s) => `${s.weight} ${s.unit} × ${s.reps}`).join(', ');
    return d.exercise ? `${d.exercise}  ·  ${body}` : body;
  },
  emptyTotals: { sets: 0, volumeKg: 0 },
  addToTotals: (totals, d) => ({
    sets: totals.sets + d.sets.length,
    volumeKg:
      totals.volumeKg + d.sets.reduce((sum, s) => sum + toKg(s.weight, s.unit) * s.reps, 0),
  }),
  describeTotals: (t2) => [
    { key: 'sets', label: t('totals.sets'), value: `${t2.sets}` },
    { key: 'vol', label: t('totals.vol'), value: `${Math.round(t2.volumeKg)} kg` },
  ],
};
