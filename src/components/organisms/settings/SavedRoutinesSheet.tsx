import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { LoggedPressable } from '@/components/atoms/Logged';

import { AppIcon } from "@/components/atoms/AppIcon";
import { AppText } from "@/components/atoms/AppText";
import { Radii, Spacing } from "@/constants/theme";
import type { Domain } from "@/core/types";
import {
  SavedRoutineRepository,
  type SavedRoutine,
} from "@/data/SavedRoutineRepository";
import { routineSummary } from "@/domains/routines";
import { useColors } from "@/hooks/use-colors";
import { t } from "@/i18n";

import { Divider, PageSheet } from "./primitives";
import { savedListStyles, settingsStyles } from "./styles";

function SavedRoutineRow({
  routine,
  domain,
  accent,
  onDelete,
  onPress,
  selectable = false,
  selected = false,
}: {
  routine: SavedRoutine;
  domain: Domain;
  accent: string;
  onDelete?: (routine: SavedRoutine) => void;
  onPress?: () => void;
  selectable?: boolean;
  selected?: boolean;
}) {
  const colors = useColors();
  const row = (
    <View style={savedListStyles.savedMealRow}>
      <View style={settingsStyles.summaryIcon}>
        <AppIcon
          name={domain === "food" ? "utensils" : "dumbbell"}
          color={accent}
          size={18}
        />
      </View>
      <View style={savedListStyles.savedMealContent}>
        <View style={styles.routineTitleRow}>
          <AppText
            variant="body"
            numberOfLines={1}
            style={savedListStyles.savedMealName}
          >
            {routine.name}
          </AppText>
          {routine.weekday !== null ? (
            <View style={[styles.routineWeekday, { borderColor: colors.border }]}>
              <AppText variant="caption" color={colors.textSecondary}>
                {t(`weekday.long.${routine.weekday}` as "weekday.long.0")}
              </AppText>
            </View>
          ) : null}
        </View>
        <AppText
          variant="caption"
          color={colors.textSecondary}
          numberOfLines={2}
        >
          {routineSummary(routine)}
        </AppText>
      </View>
      {selectable ? (
        <View
          style={[
            savedListStyles.savedMealSelectIcon,
            { borderColor: accent, backgroundColor: selected ? accent : "transparent" },
          ]}
        >
          <AppIcon
            name={selected ? "check" : "plus"}
            color={selected ? "#FFFFFF" : accent}
            size={18}
          />
        </View>
      ) : onDelete ? (
        <LoggedPressable
          onPress={() => onDelete(routine)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t("routine.deleteSaved")}
        >
          <AppIcon name="trash" color={colors.danger} size={18} />
        </LoggedPressable>
      ) : null}
    </View>
  );

  if (!onPress) return row;
  return (
    <LoggedPressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={routine.name}
      accessibilityState={selectable ? { selected } : undefined}
      style={({ pressed }) => [pressed && settingsStyles.pressed]}
    >
      {row}
    </LoggedPressable>
  );
}

/**
 * The saved-day list, shared by the settings manager (delete mode) and the
 * day picker (select mode) — the same split saved meals and exercises already
 * use. `domain` only tints the icon/select colour; the rows are identical.
 */
export function SavedRoutinesContent({
  routines,
  domain,
  onDelete,
  onSelect,
  selectable = false,
  selectedIds = [],
}: {
  routines: SavedRoutine[];
  domain: Domain;
  onDelete?: (routine: SavedRoutine) => void;
  onSelect?: (routine: SavedRoutine) => void;
  selectable?: boolean;
  selectedIds?: string[];
}) {
  const colors = useColors();
  const accent = domain === "food" ? colors.carbs : colors.accent;

  if (routines.length === 0) {
    return (
      <View
        style={[
          settingsStyles.card,
          settingsStyles.emptySavedMeals,
          { backgroundColor: colors.backgroundElement },
        ]}
      >
        <AppText variant="body" color={colors.textSecondary}>
          {t("routine.emptySaved")}
        </AppText>
      </View>
    );
  }

  return (
    <View
      style={[settingsStyles.card, { backgroundColor: colors.backgroundElement }]}
    >
      {routines.map((routine, index) => (
        <View key={routine.id}>
          {index > 0 ? <Divider /> : null}
          <SavedRoutineRow
            routine={routine}
            domain={domain}
            accent={accent}
            onDelete={onDelete}
            onPress={onSelect ? () => onSelect(routine) : undefined}
            selectable={selectable}
            selected={selectedIds.includes(routine.id)}
          />
        </View>
      ))}
    </View>
  );
}

export function SavedRoutinesSheet({
  visible,
  domain,
  onClose,
}: {
  visible: boolean;
  domain: Domain;
  onClose: () => void;
}) {
  const [routines, setRoutines] = useState<SavedRoutine[]>([]);

  const load = useCallback(async () => {
    setRoutines(await SavedRoutineRepository.byDomain(domain));
  }, [domain]);

  useEffect(() => {
    if (visible) void load();
  }, [visible, load]);

  const remove = async (routine: SavedRoutine) => {
    await SavedRoutineRepository.delete(routine.id);
    await load();
  };

  return (
    <PageSheet
      visible={visible}
      title={
        domain === "food" ? t("routine.savedDiets") : t("routine.savedWorkouts")
      }
      onClose={onClose}
    >
      <SavedRoutinesContent
        routines={routines}
        domain={domain}
        onDelete={(routine) => void remove(routine)}
      />
    </PageSheet>
  );
}

const styles = StyleSheet.create({
  routineTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  routineWeekday: {
    minHeight: 22,
    borderWidth: 1,
    borderRadius: Radii.pill,
    justifyContent: "center",
    paddingHorizontal: Spacing.two,
  },
});
