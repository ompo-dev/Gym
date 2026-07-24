import type { RefObject } from "react";
import { useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/atoms/AppText";
import { MultiLineChart } from "@/components/molecules/MultiLineChart";
import { NativeSegmented } from "@/components/molecules/NativeSegmented";
import { ScatterLineChart } from "@/components/molecules/ScatterLineChart";
import { SettingsRow } from "@/components/molecules/SettingsRow";
import { Radii, Spacing } from "@/constants/theme";
import type { AppModalAnchor } from "@/core/appModals";
import type { Entry } from "@/core/types";
import { EntryRepository } from "@/data/EntryRepository";
import { useRepositoryData } from "@/hooks/useRepositoryData";
import {
  GROUP_COLORS,
  GROUP_ORDER,
  muscleById,
  MUSCLES,
  WEEKLY_SET_TARGET,
  type MuscleGroupId,
} from "@/domains/anatomy";
import { trimLeadingGaps } from "@/domains/chartScale";
import {
  formatWorkoutDistance,
  formatWorkoutDuration,
  formatWorkoutPace,
  WORKOUT_METRIC_COLORS,
} from "@/domains/workout";
import {
  buildMonitorReport,
  type CardioModality,
  type MonitorFocus,
  type MonitorPeriod,
} from "@/domains/workoutMonitor";
import { useColors } from "@/hooks/use-colors";
import { t } from "@/i18n";
import { useAppStore } from "@/store/useAppStore";

import {
  Divider,
  measureOptionAnchor,
  OptionMenu,
  PageSheet,
  Section,
  type OptionMenuItem,
} from "./primitives";
import { settingsStyles } from "./styles";

// Modalities have no group colour of their own; a small fixed ramp keeps the
// lines distinguishable without inventing anatomy for a bike ride.
const CARDIO_LINE_COLORS = ["#BF5AF2", "#64D2FF", "#FF922E", "#34C759"];

const MONITOR_PERIODS: MonitorPeriod[] = [7, 15, 30];

function DeltaBadge({ value }: { value?: number }) {
  const colors = useColors();
  if (value === undefined || value === 0) return null;
  const up = value > 0;
  return (
    <AppText variant="label" color={up ? colors.success : colors.danger}>
      {`${up ? "▲" : "▼"} ${Math.abs(value)}%`}
    </AppText>
  );
}

/**
 * Labels are stored lowercase because several are used inside sentences
 * ("3 séries"); the summary card is the one place they stand alone, so it
 * capitalises at render instead of the dictionary carrying two variants.
 */
const capitalise = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);

function MonitorStat({
  label,
  value,
  delta,
  color,
}: {
  label: string;
  value: string;
  delta?: number;
  /** Metric colour, the same one the notes rows and totals dock use. */
  color?: string;
}) {
  const colors = useColors();
  return (
    <View style={styles.monitorStat}>
      <AppText variant="caption" color={colors.textTertiary} numberOfLines={1}>
        {capitalise(label)}
      </AppText>
      <AppText
        variant="heading"
        color={color}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </AppText>
      <DeltaBadge value={delta} />
    </View>
  );
}

function CardioModalityRow({
  modality,
  color,
}: {
  modality: CardioModality;
  color: string;
}) {
  const colors = useColors();
  // Each metric in its own colour, same as the notes rows and the dock: a
  // joined grey string made distance, time and pace read as one blob.
  const parts = [
    modality.distanceMeters > 0
      ? {
          key: "dist",
          text: formatWorkoutDistance(modality.distanceMeters),
          color: WORKOUT_METRIC_COLORS.distance,
        }
      : null,
    modality.durationSeconds > 0
      ? {
          key: "time",
          text: formatWorkoutDuration(modality.durationSeconds),
          color: WORKOUT_METRIC_COLORS.duration,
        }
      : null,
    modality.avgPaceSecondsPerKm !== null
      ? {
          key: "pace",
          text: formatWorkoutPace(modality.avgPaceSecondsPerKm),
          color: WORKOUT_METRIC_COLORS.reps,
        }
      : null,
  ].flatMap((part) => (part ? [part] : []));

  return (
    <View style={styles.exerciseRow}>
      <View style={[styles.muscleDot, { backgroundColor: color }]} />
      <View style={styles.exerciseText}>
        <AppText variant="body" numberOfLines={1}>
          {modality.name}
        </AppText>
        <View style={styles.modalityMetrics}>
          <AppText variant="caption" color={colors.textTertiary}>
            {`${modality.sessions}×`}
          </AppText>
          {parts.map((part) => (
            <View key={part.key} style={styles.modalityMetrics}>
              <AppText variant="caption" color={colors.textTertiary}>
                {"·"}
              </AppText>
              <AppText variant="caption" color={part.color} numberOfLines={1}>
                {part.text}
              </AppText>
            </View>
          ))}
        </View>
      </View>
      <View style={styles.exerciseRight}>
        {modality.bestPaceSecondsPerKm !== null ? (
          <AppText variant="label" color={colors.success}>
            {formatWorkoutPace(modality.bestPaceSecondsPerKm)}
          </AppText>
        ) : null}
        <AppText
          variant="caption"
          color={colors.textTertiary}
          numberOfLines={1}
        >
          {modality.longestDistanceMeters > 0
            ? `${t("monitor.longest")} ${formatWorkoutDistance(modality.longestDistanceMeters)}`
            : `${t("monitor.longest")} ${formatWorkoutDuration(modality.longestDurationSeconds)}`}
        </AppText>
      </View>
    </View>
  );
}

export function WorkoutMonitorSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const colors = useColors();
  const entries = useRepositoryData<Entry[]>(
    () => EntryRepository.findAll("workout"),
    [],
    [visible],
    visible,
  );
  const [period, setPeriod] = useState<MonitorPeriod>(7);
  const [tab, setTab] = useState<"strength" | "cardio">("strength");
  const [focus, setFocus] = useState<MonitorFocus>({});
  const [openSelect, setOpenSelect] = useState<
    "group" | "muscle" | "portion" | null
  >(null);
  const [selectAnchor, setSelectAnchor] = useState<AppModalAnchor | null>(null);
  const groupRowRef = useRef<View>(null);
  const muscleRowRef = useRef<View>(null);
  const portionRowRef = useRef<View>(null);
  const today = useAppStore((s) => s.workout.date);

  const report = useMemo(
    () => buildMonitorReport(entries, today, period, focus),
    [entries, today, period, focus],
  );

  // Options cascade: each level only offers what lives under the level above.
  const groupOptions: OptionMenuItem<string>[] = [
    { value: "", label: t("monitor.allScopes") },
    ...GROUP_ORDER.filter((group) => group !== "cardio").map((group) => ({
      value: group,
      label: t(`muscle.${group}` as "muscle.legs"),
    })),
  ];

  const muscleOptions: OptionMenuItem<string>[] = focus.group
    ? [
        { value: "", label: t("monitor.allScopes") },
        ...MUSCLES.filter((muscle) => muscle.group === focus.group).map(
          (muscle) => ({
            value: muscle.id,
            label: t(`muscleName.${muscle.id}` as "muscleName.quadriceps"),
          }),
        ),
      ]
    : [];

  const portionOptions: OptionMenuItem<string>[] = focus.muscle
    ? (muscleById(focus.muscle)?.portions ?? []).length
      ? [
          { value: "", label: t("monitor.allScopes") },
          ...(muscleById(focus.muscle)?.portions ?? []).map((portion) => ({
            value: portion,
            label: portion,
          })),
        ]
      : []
    : [];

  const openScopeSelect = (
    which: "group" | "muscle" | "portion",
    ref: RefObject<View | null>,
  ) => {
    if (openSelect === which) {
      setOpenSelect(null);
      return;
    }
    measureOptionAnchor(ref, (anchor) => {
      setSelectAnchor(anchor);
      setOpenSelect(which);
    });
  };

  // Narrowing resets everything below it — a porcao from another muscle would
  // silently filter the chart to nothing.
  const selectScope = (which: "group" | "muscle" | "portion", value: string) => {
    setFocus((current) => {
      if (which === "group")
        return value ? { group: value as MuscleGroupId } : {};
      if (which === "muscle") {
        return value
          ? { group: current.group, muscle: value }
          : { group: current.group };
      }
      return value
        ? { ...current, portion: value }
        : { group: current.group, muscle: current.muscle };
    });
    setOpenSelect(null);
  };

  // A line is a grupamento, a musculo or a porcao depending on how far the
  // user has drilled; each one labels differently.
  const seriesLabel = (series: {
    key: string;
    kind: "group" | "muscle" | "portion";
  }) => {
    if (series.kind === "group")
      return t(`muscle.${series.key}` as "muscle.legs");
    if (series.kind === "muscle")
      return t(`muscleName.${series.key}` as "muscleName.quadriceps");
    return series.key;
  };
  // "18/07" for days and weeks, "07" for months — the axis has room for one
  // short token per point and nothing more.
  const bucketLabel = (bucketStart: string) =>
    `${bucketStart.slice(8)}/${bucketStart.slice(5, 7)}`;

  return (
    <PageSheet
      visible={visible}
      title={t("settings.workout.monitor")}
      onClose={onClose}
      overlay={
        <OptionMenu
          visible={openSelect !== null}
          anchor={selectAnchor}
          selectedValue={
            (openSelect === "group"
              ? focus.group
              : openSelect === "muscle"
                ? focus.muscle
                : focus.portion) ?? ""
          }
          options={
            openSelect === "group"
              ? groupOptions
              : openSelect === "muscle"
                ? muscleOptions
                : portionOptions
          }
          onSelect={(value) => {
            if (openSelect) selectScope(openSelect, value);
          }}
          onClose={() => setOpenSelect(null)}
        />
      }
    >
      {/* Native segmented control on iOS; the same API falls back to pills
          elsewhere, so nothing here branches on platform. */}
      <View style={styles.monitorControls}>
        <NativeSegmented
          options={[
            { value: "strength" as const, label: t("monitor.tabStrength") },
            { value: "cardio" as const, label: t("monitor.tabCardio") },
          ]}
          value={tab}
          onChange={setTab}
          accessibilityLabel={t("settings.workout.monitor")}
        />
        <NativeSegmented
          options={MONITOR_PERIODS.map((value) => ({
            value: String(value),
            label: t(`monitor.period${value}` as "monitor.period7"),
          }))}
          value={String(period)}
          onChange={(next) => setPeriod(Number(next) as MonitorPeriod)}
        />
      </View>

      {!report.hasData ? (
        <View
          style={[
            settingsStyles.card,
            settingsStyles.emptySavedMeals,
            { backgroundColor: colors.backgroundElement },
          ]}
        >
          <AppText variant="body" color={colors.textSecondary}>
            {t("settings.workout.emptyMonitor")}
          </AppText>
        </View>
      ) : (
        <>
          <View
            style={[
              settingsStyles.card,
              styles.monitorStatsCard,
              { backgroundColor: colors.backgroundElement },
            ]}
          >
            {/* The summary follows the tab — tonnage on the cardio tab was
                answering a question nobody asked there. */}
            {tab === "cardio" && report.cardio ? (
              <>
                <MonitorStat
                  label={t("monitor.streak")}
                  value={`${report.cardio.streak}`}
                />
                <MonitorStat
                  label={t("totals.dist")}
                  value={formatWorkoutDistance(report.cardio.distanceMeters)}
                  delta={report.cardio.distanceDeltaPct}
                  color={WORKOUT_METRIC_COLORS.distance}
                />
                <MonitorStat
                  label={t("totals.time")}
                  value={formatWorkoutDuration(report.cardio.durationSeconds)}
                  color={WORKOUT_METRIC_COLORS.duration}
                />
                <MonitorStat
                  label={t("monitor.avgPace")}
                  value={
                    report.cardio.avgPaceSecondsPerKm !== null
                      ? formatWorkoutPace(
                          report.cardio.avgPaceSecondsPerKm,
                        ).replace("/km", "")
                      : "—"
                  }
                  delta={report.cardio.paceDeltaPct}
                  color={WORKOUT_METRIC_COLORS.reps}
                />
              </>
            ) : (
              <>
                <MonitorStat
                  label={t("monitor.streak")}
                  value={`${report.streak}`}
                />
                <MonitorStat
                  label={t("totals.sets")}
                  value={`${report.totals.sets}`}
                  color={WORKOUT_METRIC_COLORS.sets}
                />
                <MonitorStat
                  label={t("monitor.load")}
                  value={`${Math.round(report.totals.volumeKg)} kg`}
                  delta={report.volumeDeltaPct}
                  color={WORKOUT_METRIC_COLORS.volume}
                />
              </>
            )}
          </View>

          {tab === "strength" ? (
            <>
              {/* Never gate the selects on the data: narrowing to a grupamento
                  with no work in the period would hide the very control needed
                  to widen again. */}
              <View style={settingsStyles.section}>
                {/* Cascading selects, same pattern as "Tipo de meta":
                      grupamento -> musculo daquele grupamento -> porcao daquele
                      musculo. Each one only appears once the one above it is
                      chosen, so the panorama narrows macro -> micro. */}
                <View
                  style={[
                    settingsStyles.card,
                    { backgroundColor: colors.backgroundElement },
                  ]}
                >
                  <View ref={groupRowRef} collapsable={false}>
                    <SettingsRow
                      title={t("monitor.levelGroup")}
                      select={{
                        value: focus.group ?? "",
                        options: groupOptions,
                        onSelect: (value) => selectScope("group", value),
                      }}
                      onPress={() => openScopeSelect("group", groupRowRef)}
                    />
                  </View>

                  {focus.group ? (
                    <>
                      <Divider />
                      <View ref={muscleRowRef} collapsable={false}>
                        <SettingsRow
                          title={t("monitor.levelMuscle")}
                          select={{
                            value: focus.muscle ?? "",
                            options: muscleOptions,
                            onSelect: (value) => selectScope("muscle", value),
                          }}
                          onPress={() =>
                            openScopeSelect("muscle", muscleRowRef)
                          }
                        />
                      </View>
                    </>
                  ) : null}

                  {portionOptions.length ? (
                    <>
                      <Divider />
                      <View ref={portionRowRef} collapsable={false}>
                        <SettingsRow
                          title={t("monitor.levelPortion")}
                          select={{
                            value: focus.portion ?? "",
                            options: portionOptions,
                            onSelect: (value) => selectScope("portion", value),
                          }}
                          onPress={() =>
                            openScopeSelect("portion", portionRowRef)
                          }
                        />
                      </View>
                    </>
                  ) : null}
                </View>

                {report.series.length ? (
                  <View
                    style={[
                      settingsStyles.card,
                      settingsStyles.chartCard,
                      { backgroundColor: colors.backgroundElement },
                    ]}
                  >
                    <MultiLineChart
                      labels={report.buckets.map(bucketLabel)}
                      lines={report.series.map((series) => ({
                        key: series.key,
                        label: seriesLabel(series),
                        color: GROUP_COLORS[series.group],
                        points: trimLeadingGaps(series.points),
                      }))}
                      formatValue={(value) =>
                        `${Math.round(value)} ${t("totals.sets")}`
                      }
                      // Sets are a count: a day with none is a real zero, not a
                      // reason to rescale the axis away from the origin.
                      zeroBased
                      xLabel={t("monitor.axisDate")}
                      yLabel={t("totals.sets")}
                      yLabelColor={WORKOUT_METRIC_COLORS.sets}
                      // The 8-12 prescription is weekly, so the band only means
                      // something when the buckets are weeks.
                      band={
                        report.granularity === "week"
                          ? {
                              min: WEEKLY_SET_TARGET.min,
                              max: WEEKLY_SET_TARGET.max,
                              label: `${WEEKLY_SET_TARGET.min}-${WEEKLY_SET_TARGET.max}/sem`,
                            }
                          : undefined
                      }
                    />
                  </View>
                ) : (
                  <View
                    style={[
                      settingsStyles.card,
                      settingsStyles.emptySavedMeals,
                      { backgroundColor: colors.backgroundElement },
                    ]}
                  >
                    <AppText variant="body" color={colors.textSecondary}>
                      {t("monitor.emptyScope")}
                    </AppText>
                  </View>
                )}
                {report.unclassifiedShare >= 0.15 ? (
                  <AppText
                    variant="caption"
                    color={colors.textTertiary}
                    style={styles.monitorNote}
                  >
                    {t("monitor.unclassified")}
                  </AppText>
                ) : null}
              </View>

              {report.exerciseSeries.length ? (
                <View style={settingsStyles.section}>
                  <AppText
                    variant="caption"
                    color={colors.textTertiary}
                    style={settingsStyles.sectionLabel}
                  >
                    {t("monitor.loadProgress")}
                  </AppText>
                  <View
                    style={[
                      settingsStyles.card,
                      settingsStyles.chartCard,
                      { backgroundColor: colors.backgroundElement },
                    ]}
                  >
                    {/* Sets against load: a point per training day, so a set
                        that got heavier and a set that got longer are visibly
                        different kinds of progress. */}
                    <ScatterLineChart
                      series={report.exerciseSeries
                        .slice(0, 6)
                        .map((series) => ({
                          key: series.name,
                          label: series.name,
                          color: GROUP_COLORS[series.group],
                          points: series.sets
                            .map((sets, i) => ({
                              x: sets,
                              y: series.loadKg[i],
                            }))
                            .filter((point) => point.x > 0 || point.y > 0),
                        }))}
                      xLabel={t("monitor.axisSets")}
                      yLabel={t("monitor.axisLoad")}
                      xLabelColor={WORKOUT_METRIC_COLORS.sets}
                      yLabelColor={WORKOUT_METRIC_COLORS.volume}
                      formatX={(value) => `${Math.round(value)}`}
                      formatY={(value) => `${Math.round(value)}`}
                    />
                  </View>
                </View>
              ) : null}
            </>
          ) : null}

          {tab === "cardio" && report.cardio ? (
            <>
              <Section label={t("monitor.cardio")}>
                {report.cardioSeries.length ? (
                  <View
                    style={[
                      settingsStyles.card,
                      settingsStyles.chartCard,
                      { backgroundColor: colors.backgroundElement },
                    ]}
                  >
                    {/* Pace over time. Lower is faster, so an improving athlete
                        produces a descending line — the axis is inverted in
                        meaning, not in drawing. Buckets without a complete
                        distance+time pair are gaps, never zeros. */}
                    <MultiLineChart
                      labels={report.buckets.map(bucketLabel)}
                      lines={report.cardioSeries.map((series, index) => ({
                        key: series.name,
                        label: series.name,
                        color:
                          CARDIO_LINE_COLORS[index % CARDIO_LINE_COLORS.length],
                        points: series.paceSecPerKm.map((pace) =>
                          pace > 0 ? pace : null,
                        ),
                      }))}
                      formatValue={(value) => formatWorkoutPace(value)}
                      formatTick={(value) =>
                        formatWorkoutPace(value).replace("/km", "")
                      }
                      scale="time"
                      yAxisWidth={40}
                      xLabel={t("monitor.axisDate")}
                      yLabel={t("monitor.avgPace")}
                      yLabelColor={WORKOUT_METRIC_COLORS.reps}
                      summary="average"
                    />
                  </View>
                ) : null}

                <View
                  style={[
                    settingsStyles.card,
                    { backgroundColor: colors.backgroundElement },
                  ]}
                >
                  {report.cardio.modalities.map((modality, index) => (
                    <View key={modality.name}>
                      {index > 0 ? <Divider /> : null}
                      <CardioModalityRow
                        modality={modality}
                        color={
                          CARDIO_LINE_COLORS[index % CARDIO_LINE_COLORS.length]
                        }
                      />
                    </View>
                  ))}
                </View>
              </Section>
            </>
          ) : null}

          {tab === "cardio" && !report.cardio ? (
            <View
              style={[
                settingsStyles.card,
                settingsStyles.emptySavedMeals,
                { backgroundColor: colors.backgroundElement },
              ]}
            >
              <AppText variant="body" color={colors.textSecondary}>
                {t("monitor.emptyCardio")}
              </AppText>
            </View>
          ) : null}
        </>
      )}
    </PageSheet>
  );
}

const styles = StyleSheet.create({
  exerciseRight: {
    alignItems: "flex-end",
    gap: Spacing.one,
  },
  exerciseRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    minHeight: 56,
  },
  exerciseText: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.one,
  },
  modalityMetrics: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.one,
  },
  monitorControls: {
    gap: Spacing.two,
  },
  monitorNote: {
    paddingTop: Spacing.one,
  },
  monitorStat: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    gap: Spacing.one,
  },
  monitorStatsCard: {
    flexDirection: "row",
    paddingVertical: Spacing.four,
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
  },
  muscleDot: {
    width: 10,
    height: 10,
    borderRadius: Radii.pill,
  },
});
