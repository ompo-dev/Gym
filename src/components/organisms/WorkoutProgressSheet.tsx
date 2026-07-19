import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppIcon, type AppIconName } from '@/components/atoms/AppIcon';
import { AppText } from '@/components/atoms/AppText';
import { GlassSurface } from '@/components/atoms/GlassSurface';
import { Radii, Spacing } from '@/constants/theme';
import type { Entry } from '@/core/types';
import { EntryRepository } from '@/data/EntryRepository';
import type { WorkoutData } from '@/domains/schemas';
import {
  formatWorkoutDistance,
  formatWorkoutDuration,
  formatWorkoutPace,
  type WorkoutTotals,
  uniqueWorkoutExerciseNames,
  WORKOUT_METRIC_COLORS,
  workoutConfig,
} from '@/domains/workout';
import { useColors } from '@/hooks/use-colors';
import { t } from '@/i18n';

interface WorkoutProgressSheetProps {
  date: string;
  entries: Entry[];
  totals: WorkoutTotals;
  visible: boolean;
}

interface ExerciseProgress {
  name: string;
  metric: string;
  value: string;
  previous?: string;
  color: string;
  icon: AppIconName;
}

interface ExerciseBests {
  volumeKg: number;
  distanceMeters: number;
  durationSeconds: number;
  paceSecondsPerKm: number | null;
}

function isWorkoutData(data: Entry['data']): data is WorkoutData {
  return Boolean(data && 'sets' in data);
}

function entryExercise(entry: Entry): string | null {
  if (!isWorkoutData(entry.data)) return null;
  return uniqueWorkoutExerciseNames([{ text: entry.text, data: entry.data }])[0] ?? null;
}

function entryTotals(data: WorkoutData): WorkoutTotals {
  return workoutConfig.addToTotals(workoutConfig.emptyTotals, data);
}

function combineTotals(left: WorkoutTotals, right: WorkoutTotals): WorkoutTotals {
  return {
    sets: left.sets + right.sets,
    volumeKg: left.volumeKg + right.volumeKg,
    durationSeconds: left.durationSeconds + right.durationSeconds,
    distanceMeters: left.distanceMeters + right.distanceMeters,
  };
}

function paceFromTotals(totals: WorkoutTotals): number | null {
  if (!totals.durationSeconds || !totals.distanceMeters) return null;
  const kilometers = totals.distanceMeters / 1000;
  return kilometers > 0 ? totals.durationSeconds / kilometers : null;
}

function emptyBests(): ExerciseBests {
  return {
    volumeKg: 0,
    distanceMeters: 0,
    durationSeconds: 0,
    paceSecondsPerKm: null,
  };
}

function buildPreviousBests(entries: Entry[], date: string): Map<string, ExerciseBests> {
  const bests = new Map<string, ExerciseBests>();

  entries.forEach((entry) => {
    if (entry.date >= date || entry.status !== 'done' || !isWorkoutData(entry.data)) return;
    const exercise = entryExercise(entry);
    if (!exercise) return;

    const key = exercise.toLocaleLowerCase();
    const current = bests.get(key) ?? emptyBests();
    const totals = entryTotals(entry.data);
    const pace = paceFromTotals(totals);

    bests.set(key, {
      volumeKg: Math.max(current.volumeKg, totals.volumeKg),
      distanceMeters: Math.max(current.distanceMeters, totals.distanceMeters),
      durationSeconds: Math.max(current.durationSeconds, totals.durationSeconds),
      paceSecondsPerKm:
        pace === null
          ? current.paceSecondsPerKm
          : current.paceSecondsPerKm === null
            ? pace
            : Math.min(current.paceSecondsPerKm, pace),
    });
  });

  return bests;
}

function buildTodayTotals(entries: Entry[]): Map<string, { name: string; totals: WorkoutTotals }> {
  const today = new Map<string, { name: string; totals: WorkoutTotals }>();

  entries.forEach((entry) => {
    if (entry.status !== 'done' || !isWorkoutData(entry.data)) return;
    const exercise = entryExercise(entry);
    if (!exercise) return;

    const key = exercise.toLocaleLowerCase();
    const current = today.get(key);
    const totals = entryTotals(entry.data);
    today.set(key, {
      name: current?.name ?? exercise,
      totals: current ? combineTotals(current.totals, totals) : totals,
    });
  });

  return today;
}

function progressItems(
  today: Map<string, { name: string; totals: WorkoutTotals }>,
  previous: Map<string, ExerciseBests>,
  colors: ReturnType<typeof useColors>,
): ExerciseProgress[] {
  return [...today.entries()].flatMap(([key, item]) => {
    const best = previous.get(key) ?? emptyBests();
    const pace = paceFromTotals(item.totals);
    const items: ExerciseProgress[] = [];

    if (item.totals.volumeKg > best.volumeKg && item.totals.volumeKg > 0) {
      items.push({
        name: item.name,
        metric: best.volumeKg > 0 ? t('workout.progress.volume') : t('workout.progress.first'),
        value: `${Math.round(item.totals.volumeKg)} kg`,
        previous: best.volumeKg > 0 ? `${Math.round(best.volumeKg)} kg` : undefined,
        color: WORKOUT_METRIC_COLORS.volume,
        icon: 'dumbbell',
      });
    }

    if (item.totals.distanceMeters > best.distanceMeters && item.totals.distanceMeters > 0) {
      items.push({
        name: item.name,
        metric:
          best.distanceMeters > 0
            ? t('workout.progress.distance')
            : t('workout.progress.first'),
        value: formatWorkoutDistance(item.totals.distanceMeters),
        previous:
          best.distanceMeters > 0 ? formatWorkoutDistance(best.distanceMeters) : undefined,
        color: WORKOUT_METRIC_COLORS.distance,
        icon: 'navigation',
      });
    }

    if (item.totals.durationSeconds > best.durationSeconds && item.totals.durationSeconds > 0) {
      items.push({
        name: item.name,
        metric:
          best.durationSeconds > 0 ? t('workout.progress.duration') : t('workout.progress.first'),
        value: formatWorkoutDuration(item.totals.durationSeconds),
        previous:
          best.durationSeconds > 0 ? formatWorkoutDuration(best.durationSeconds) : undefined,
        color: WORKOUT_METRIC_COLORS.duration,
        icon: 'clock',
      });
    }

    if (pace !== null && best.paceSecondsPerKm !== null && pace < best.paceSecondsPerKm) {
      items.push({
        name: item.name,
        metric: t('workout.progress.pace'),
        value: formatWorkoutPace(pace),
        previous: formatWorkoutPace(best.paceSecondsPerKm),
        color: colors.success,
        icon: 'zap',
      });
    }

    return items;
  });
}

function SummaryMetric({
  icon,
  color,
  value,
  label,
}: {
  icon: AppIconName;
  color: string;
  value: string;
  label: string;
}) {
  const colors = useColors();
  return (
    <View style={styles.summaryMetric}>
      <AppIcon name={icon} color={color} size={16} />
      <AppText variant="label" numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </AppText>
      <AppText variant="caption" color={colors.textTertiary} numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
}

export function WorkoutProgressSheet({
  date,
  entries,
  totals,
  visible,
}: WorkoutProgressSheetProps) {
  const colors = useColors();
  const [history, setHistory] = useState<Entry[]>([]);

  useEffect(() => {
    if (!visible) return;
    void EntryRepository.findAll('workout').then(setHistory);
  }, [visible]);

  const items = useMemo(() => {
    const today = buildTodayTotals(entries);
    const previous = buildPreviousBests(history, date);
    return progressItems(today, previous, colors).slice(0, 6);
  }, [colors, date, entries, history]);

  if (!visible) return null;
  const prLabel = `${items.length} PR${items.length === 1 ? '' : 's'}`;

  return (
    <GlassSurface glass="regular" style={styles.panel}>
      <View style={styles.header}>
        <View style={styles.headerLabel}>
          <AppIcon name="trophy" color={colors.accent} size={18} />
          <AppText variant="heading">{t('workout.progress.title')}</AppText>
        </View>
        <View style={[styles.prBadge, { borderColor: colors.border }]}>
          <AppText variant="caption" color={colors.textSecondary}>
            {items.length ? prLabel : t('workout.progress.today')}
          </AppText>
        </View>
      </View>

      <View style={styles.summaryRow}>
        <SummaryMetric
          icon="squareStack"
          color={WORKOUT_METRIC_COLORS.sets}
          value={`${totals.sets}`}
          label={t('totals.sets')}
        />
        <SummaryMetric
          icon="dumbbell"
          color={WORKOUT_METRIC_COLORS.volume}
          value={`${Math.round(totals.volumeKg)} kg`}
          label={t('totals.vol')}
        />
        <SummaryMetric
          icon="clock"
          color={WORKOUT_METRIC_COLORS.duration}
          value={formatWorkoutDuration(totals.durationSeconds)}
          label={t('totals.time')}
        />
        <SummaryMetric
          icon="navigation"
          color={WORKOUT_METRIC_COLORS.distance}
          value={formatWorkoutDistance(totals.distanceMeters)}
          label={t('totals.dist')}
        />
      </View>

      <View style={styles.progressList}>
        {items.length > 0 ? (
          items.map((item, index) => (
            <View key={`${item.name}-${item.metric}-${index}`} style={styles.progressRow}>
              <View style={[styles.progressIcon, { backgroundColor: item.color }]}>
                <AppIcon name={item.icon} color="#FFFFFF" size={15} />
              </View>
              <View style={styles.progressText}>
                <View style={styles.progressTitleRow}>
                  <AppText variant="body" numberOfLines={1} style={styles.progressName}>
                    {item.name}
                  </AppText>
                  <View style={[styles.metricPill, { borderColor: item.color }]}>
                    <AppText variant="caption" color={item.color} numberOfLines={1}>
                      {item.metric}
                    </AppText>
                  </View>
                </View>
                <View style={styles.progressValueRow}>
                  {item.previous ? (
                    <>
                      <AppText variant="caption" color={colors.textTertiary} numberOfLines={1}>
                        {item.previous}
                      </AppText>
                      <AppText variant="caption" color={colors.textTertiary}>
                        {'->'}
                      </AppText>
                    </>
                  ) : null}
                  <AppText variant="label" color={item.color} numberOfLines={1}>
                    {item.value}
                  </AppText>
                </View>
              </View>
            </View>
          ))
        ) : (
          <AppText variant="body" color={colors.textSecondary} style={styles.empty}>
            {t('workout.progress.empty')}
          </AppText>
        )}
      </View>
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: Spacing.four,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.five,
    borderRadius: Radii.xl,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  headerLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flex: 1,
    minWidth: 0,
  },
  prBadge: {
    minHeight: 28,
    borderWidth: 1,
    borderRadius: Radii.pill,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  summaryMetric: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    gap: Spacing.one,
  },
  progressList: {
    gap: Spacing.three,
  },
  progressRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  progressIcon: {
    width: 30,
    height: 30,
    borderRadius: Radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressText: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.one,
  },
  progressTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  progressName: {
    flex: 1,
    minWidth: 0,
  },
  metricPill: {
    minHeight: 24,
    borderWidth: 1,
    borderRadius: Radii.pill,
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
  },
  progressValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  empty: {
    textAlign: 'center',
    paddingVertical: Spacing.three,
  },
});
