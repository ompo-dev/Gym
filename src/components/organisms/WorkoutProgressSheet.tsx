import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { AppIcon } from "@/components/atoms/AppIcon";
import { AppText } from "@/components/atoms/AppText";
import { GlassSurface } from "@/components/atoms/GlassSurface";
import { Radii, Spacing } from "@/constants/theme";
import type { Entry } from "@/core/types";
import { EntryRepository } from "@/data/EntryRepository";
import { WORKOUT_METRIC_COLORS } from "@/domains/workout";
import {
  buildProgressRows,
  type ProgressTone,
} from "@/domains/workoutProgress";
import { useColors } from "@/hooks/use-colors";
import { t } from "@/i18n";

interface WorkoutProgressSheetProps {
  date: string;
  entries: Entry[];
  visible: boolean;
}

export function WorkoutProgressSheet({
  date,
  entries,
  visible,
}: WorkoutProgressSheetProps) {
  const colors = useColors();
  const [history, setHistory] = useState<Entry[]>([]);

  useEffect(() => {
    if (!visible) return;
    void EntryRepository.findAll("workout").then(setHistory);
  }, [visible]);

  const toneColor: Record<ProgressTone, string> = useMemo(
    () => ({
      pr: colors.accent,
      first: WORKOUT_METRIC_COLORS.distance,
      up: WORKOUT_METRIC_COLORS.reps,
      flat: colors.textTertiary,
    }),
    [colors],
  );

  const rows = useMemo(
    () => buildProgressRows(entries, history, date),
    [date, entries, history],
  );

  if (!visible) return null;

  const wins = rows.filter((row) => row.tone === "pr").length;
  // Rows arrive sorted best-first, so the top one carries the panel and the
  // rest collapse to one line each. A flat list of equals reads as an
  // inventory; this reads as an answer to "did I progress today?".
  const [hero, ...rest] = rows;

  return (
    <GlassSurface glass="regular" style={styles.panel}>
      <View style={styles.header}>
        <View style={styles.headerLabel}>
          <AppText variant="heading">{t("workout.progress.title")}</AppText>
        </View>
        {wins ? (
          <View style={[styles.prBadge, { borderColor: colors.accent }]}>
            <AppText variant="caption" color={colors.accent}>
              {`${wins} PR${wins === 1 ? "" : "s"}`}
            </AppText>
          </View>
        ) : null}
      </View>

      {hero ? (
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <AppIcon name={hero.icon} color={toneColor[hero.tone]} size={16} />
            <AppText variant="secondary" color={colors.textSecondary} numberOfLines={1}>
              {hero.name}
            </AppText>
          </View>
          <View style={styles.heroValueRow}>
            <AppText variant="metric" numberOfLines={1}>
              {hero.headline}
            </AppText>
            {hero.deltaPct !== undefined ? (
              <AppText variant="label" color={toneColor[hero.tone]}>
                {`▲ ${hero.deltaPct}%`}
              </AppText>
            ) : null}
          </View>
          <AppText variant="caption" color={colors.textTertiary} numberOfLines={1}>
            {[hero.detail, hero.reference ? `${t("workout.progress.previous")} ${hero.reference}` : hero.badge]
              .filter(Boolean)
              .join("  ·  ")}
          </AppText>
        </View>
      ) : null}

      {rest.length ? (
        <ScrollView
          style={styles.progressScroll}
          contentContainerStyle={styles.progressList}
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
        >
          {rest.map((row) => (
            <View key={row.name} style={styles.progressRow}>
              <AppIcon name={row.icon} color={toneColor[row.tone]} size={14} />
              <AppText variant="body" numberOfLines={1} style={styles.progressName}>
                {row.name}
              </AppText>
              <AppText variant="label" numberOfLines={1}>
                {row.headline}
              </AppText>
              {row.deltaPct !== undefined ? (
                <AppText variant="caption" color={toneColor[row.tone]}>
                  {`▲${row.deltaPct}%`}
                </AppText>
              ) : null}
            </View>
          ))}
        </ScrollView>
      ) : null}

      {!hero ? (
        <AppText variant="body" color={colors.textSecondary} style={styles.empty}>
          {t("workout.progress.empty")}
        </AppText>
      ) : null}
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
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.three,
  },
  headerLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    flex: 1,
    minWidth: 0,
  },
  prBadge: {
    minHeight: 28,
    borderWidth: 1,
    borderRadius: Radii.pill,
    justifyContent: "center",
    paddingHorizontal: Spacing.three,
  },
  hero: {
    gap: Spacing.one,
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  heroValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: Spacing.two,
  },
  progressScroll: {
    // The goals panel on the diet side has fixed content, so it shrinks the
    // notes area by a constant amount. This one grows with the exercise count —
    // unbounded, it stole half the screen and made the notes list jump. Now the
    // hero carries the height and the remaining one-liners scroll in place.
    maxHeight: 132,
  },
  progressList: {
    gap: Spacing.two,
  },
  progressRow: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  progressName: {
    flex: 1,
    minWidth: 0,
  },
  empty: {
    textAlign: "center",
    paddingVertical: Spacing.three,
  },
});
