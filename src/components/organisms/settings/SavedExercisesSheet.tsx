import { useEffect, useState } from "react";
import { View } from "react-native";
import { LoggedPressable } from '@/components/atoms/Logged';

import { AppIcon } from "@/components/atoms/AppIcon";
import { AppText } from "@/components/atoms/AppText";
import { GlassSurface } from "@/components/atoms/GlassSurface";
import {
  SavedExerciseRepository,
  type SavedExercise,
} from "@/data/SavedExerciseRepository";
import { useRepositoryData } from "@/hooks/useRepositoryData";
import { inferWorkoutKind, WORKOUT_METRIC_COLORS } from "@/domains/workout";
import { useColors } from "@/hooks/use-colors";
import { t } from "@/i18n";

import { SheetFrame } from "../SheetFrame";
import { Chevron, Divider } from "./primitives";
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

export function SavedExercisesSheet({
  visible,
  onClose,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (workouts: SavedExercise[]) => void;
}) {
  const colors = useColors();
  const workouts = useRepositoryData<SavedExercise[]>(
    () => SavedExerciseRepository.all(),
    [],
    [visible],
    visible,
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Selection is UI state, not repository data — it clears when the picker
  // closes, independent of the load above.
  useEffect(() => {
    if (!visible) setSelectedIds([]);
  }, [visible]);

  const toggleWorkout = (workout: SavedExercise) => {
    setSelectedIds((current) =>
      current.includes(workout.id)
        ? current.filter((id) => id !== workout.id)
        : [...current, workout.id],
    );
  };

  const confirmSelection = () => {
    const selectedWorkouts = workouts.filter((workout) =>
      selectedIds.includes(workout.id),
    );
    if (selectedWorkouts.length === 0) return;
    onSelect(selectedWorkouts);
  };
  const hasSelection = selectedIds.length > 0;

  return (
    <SheetFrame
      visible={visible}
      title={t("settings.workout.saved")}
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
      <SavedExercisesContent
        workouts={workouts}
        onSelect={toggleWorkout}
        selectable
        selectedIds={selectedIds}
      />
    </SheetFrame>
  );
}
