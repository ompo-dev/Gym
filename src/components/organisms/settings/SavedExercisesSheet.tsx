import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { LoggedPressable } from '@/components/atoms/Logged';

import { AppIcon } from "@/components/atoms/AppIcon";
import { AppText } from "@/components/atoms/AppText";
import { GlassSurface } from "@/components/atoms/GlassSurface";
import { NativeSegmented } from "@/components/molecules/NativeSegmented";
import { Spacing } from "@/constants/theme";
import {
  SavedExerciseRepository,
  type SavedExercise,
} from "@/data/SavedExerciseRepository";
import {
  SavedRoutineRepository,
  type SavedRoutine,
  type SavedWorkoutRoutine,
} from "@/data/SavedRoutineRepository";
import { useRepositoryData } from "@/hooks/useRepositoryData";
import { inferWorkoutKind, WORKOUT_METRIC_COLORS } from "@/domains/workout";
import { useColors } from "@/hooks/use-colors";
import { t } from "@/i18n";

import { SheetFrame } from "../SheetFrame";
import { Chevron, Divider } from "./primitives";
import { SavedRoutinesContent } from "./SavedRoutinesSheet";
import { savedListStyles, settingsStyles } from "./styles";

function SavedExerciseRow({
  workout,
  onDelete,
  onPress,
  selectable = false,
  selected = false,
}: {
  workout: SavedExercise;
  onDelete?: (workout: SavedExercise) => void;
  onPress?: () => void;
  selectable?: boolean;
  selected?: boolean;
}) {
  const colors = useColors();
  const savedKind = workout.exercises.some(
    (exercise) => inferWorkoutKind({ sets: [] }, exercise) === "cardio",
  )
    ? "cardio"
    : "strength";
  const row = (
    <View style={savedListStyles.savedMealRow}>
      <View style={settingsStyles.summaryIcon}>
        <AppIcon
          name={savedKind === "cardio" ? "navigation" : "dumbbell"}
          color={
            savedKind === "cardio"
              ? WORKOUT_METRIC_COLORS.distance
              : WORKOUT_METRIC_COLORS.sets
          }
          size={18}
        />
      </View>
      <View style={savedListStyles.savedMealContent}>
        <AppText
          variant="body"
          numberOfLines={1}
          style={savedListStyles.savedMealName}
        >
          {workout.name}
        </AppText>
        <AppText
          variant="caption"
          color={colors.textSecondary}
          numberOfLines={2}
        >
          {workout.exercises.join("  \u00b7  ")}
        </AppText>
      </View>
      {selectable ? (
        <View
          style={[
            savedListStyles.savedMealSelectIcon,
            {
              borderColor: colors.accent,
              backgroundColor: selected ? colors.accent : "transparent",
            },
          ]}
        >
          <AppIcon
            name={selected ? "check" : "plus"}
            color={selected ? "#FFFFFF" : colors.accent}
            size={18}
          />
        </View>
      ) : onDelete ? (
        <LoggedPressable
          onPress={() => onDelete(workout)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t("settings.workout.deleteSaved")}
        >
          <AppIcon name="trash" color={colors.danger} size={18} />
        </LoggedPressable>
      ) : (
        <Chevron />
      )}
    </View>
  );

  if (!onPress) return row;
  return (
    <LoggedPressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={workout.name}
      accessibilityState={selectable ? { selected } : undefined}
      style={({ pressed }) => [pressed && settingsStyles.pressed]}
    >
      {row}
    </LoggedPressable>
  );
}

export function SavedExercisesContent({
  workouts,
  onDelete,
  onSelect,
  selectable = false,
  selectedIds = [],
}: {
  workouts: SavedExercise[];
  onDelete?: (workout: SavedExercise) => void;
  onSelect?: (workout: SavedExercise) => void;
  selectable?: boolean;
  selectedIds?: string[];
}) {
  const colors = useColors();
  if (workouts.length === 0) {
    return (
      <View
        style={[
          settingsStyles.card,
          settingsStyles.emptySavedMeals,
          { backgroundColor: colors.backgroundElement },
        ]}
      >
        <AppText variant="body" color={colors.textSecondary}>
          {t("settings.workout.emptySaved")}
        </AppText>
      </View>
    );
  }

  return (
    <View
      style={[
        settingsStyles.card,
        { backgroundColor: colors.backgroundElement },
      ]}
    >
      {workouts.map((workout, index) => (
        <View key={workout.id}>
          {index > 0 ? <Divider /> : null}
          <SavedExerciseRow
            workout={workout}
            onDelete={onDelete}
            onPress={onSelect ? () => onSelect(workout) : undefined}
            selectable={selectable}
            selected={selectedIds.includes(workout.id)}
          />
        </View>
      ))}
    </View>
  );
}

type WorkoutSavedTab = "workouts" | "exercises";

export function SavedExercisesSheet({
  visible,
  onClose,
  onSelect,
  onSelectWorkoutRoutines,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (workouts: SavedExercise[]) => void;
  onSelectWorkoutRoutines: (routines: SavedWorkoutRoutine[]) => void;
}) {
  const colors = useColors();
  const [tab, setTab] = useState<WorkoutSavedTab>("workouts");
  const exercises = useRepositoryData<SavedExercise[]>(
    () => SavedExerciseRepository.all(),
    [],
    [visible],
    visible,
  );
  const routines = useRepositoryData<SavedRoutine[]>(
    () => SavedRoutineRepository.byDomain("workout"),
    [],
    [visible],
    visible,
  );
  const [selectedExerciseIds, setSelectedExerciseIds] = useState<string[]>([]);
  const [selectedRoutineIds, setSelectedRoutineIds] = useState<string[]>([]);

  // Selection and active tab are UI state — they reset when the picker closes.
  useEffect(() => {
    if (!visible) {
      setSelectedExerciseIds([]);
      setSelectedRoutineIds([]);
      setTab("workouts");
    }
  }, [visible]);

  const toggleExercise = (workout: SavedExercise) => {
    setSelectedExerciseIds((current) =>
      current.includes(workout.id)
        ? current.filter((id) => id !== workout.id)
        : [...current, workout.id],
    );
  };
  const toggleRoutine = (routine: SavedRoutine) => {
    setSelectedRoutineIds((current) =>
      current.includes(routine.id)
        ? current.filter((id) => id !== routine.id)
        : [...current, routine.id],
    );
  };

  // Applies the active tab's selection only: whole saved workouts or loose
  // saved exercises.
  const confirmSelection = () => {
    if (tab === "exercises") {
      const selected = exercises.filter((workout) =>
        selectedExerciseIds.includes(workout.id),
      );
      if (selected.length === 0) return;
      onSelect(selected);
      return;
    }
    const selected = routines.filter((routine) =>
      selectedRoutineIds.includes(routine.id),
    ) as SavedWorkoutRoutine[];
    if (selected.length === 0) return;
    onSelectWorkoutRoutines(selected);
  };
  const hasSelection =
    tab === "exercises"
      ? selectedExerciseIds.length > 0
      : selectedRoutineIds.length > 0;

  return (
    <SheetFrame
      visible={visible}
      title={t("saved.title")}
      onClose={onClose}
      centerTitle
      hideDefaultClose={hasSelection}
      headerLeading={
        hasSelection ? (
          <LoggedPressable
            onPress={onClose}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={t("common.close")}
          >
            <GlassSurface
              glass="regular"
              isInteractive
              style={savedListStyles.savedMealHeaderButton}
            >
              <AppIcon name="x" color={colors.textSecondary} size={18} />
            </GlassSurface>
          </LoggedPressable>
        ) : null
      }
      headerTrailing={
        hasSelection ? (
          <LoggedPressable
            onPress={confirmSelection}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={t("settings.done")}
            style={({ pressed }) => [
              savedListStyles.savedMealConfirm,
              { backgroundColor: colors.accent },
              pressed && settingsStyles.pressed,
            ]}
          >
            <AppIcon name="check" color="#FFFFFF" size={18} />
          </LoggedPressable>
        ) : null
      }
      size="full"
    >
      <View style={styles.savedTabs}>
        <NativeSegmented
          options={[
            { value: "workouts", label: t("saved.tab.workouts") },
            { value: "exercises", label: t("saved.tab.exercises") },
          ]}
          value={tab}
          onChange={setTab}
          accessibilityLabel={t("saved.title")}
        />
      </View>
      {tab === "exercises" ? (
        <SavedExercisesContent
          workouts={exercises}
          onSelect={toggleExercise}
          selectable
          selectedIds={selectedExerciseIds}
        />
      ) : (
        <SavedRoutinesContent
          routines={routines}
          domain="workout"
          onSelect={toggleRoutine}
          selectable
          selectedIds={selectedRoutineIds}
        />
      )}
    </SheetFrame>
  );
}

const styles = StyleSheet.create({
  savedTabs: {
    marginBottom: Spacing.four,
  },
});
