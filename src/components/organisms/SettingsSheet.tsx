import Slider from "@react-native-community/slider";
import Constants from "expo-constants";
import type { ReactNode, RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Switch,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";

import { AppIcon, type AppIconName } from "@/components/atoms/AppIcon";
import { AppText } from "@/components/atoms/AppText";
import { GlassSurface } from "@/components/atoms/GlassSurface";
import { MultiLineChart } from "@/components/molecules/MultiLineChart";
import { NativeSegmented } from "@/components/molecules/NativeSegmented";
import { ScatterLineChart } from "@/components/molecules/ScatterLineChart";
import { SettingsRow } from "@/components/molecules/SettingsRow";
import {
  activityOptions,
  BIAS_DOT_COLORS,
  biasMeta,
  copy,
  genderOptions,
} from "@/components/onboarding/onboardingContent";
import {
  DatePickerSheet,
  PickerSheet,
} from "@/components/onboarding/onboardingControls";
import {
  formatDate,
  type PickerKind,
} from "@/components/onboarding/onboardingUtils";
import { Metrics, Radii, Spacing } from "@/constants/theme";
import { canOpenAppModal, type AppModalAnchor } from "@/core/appModals";
import { addDays, todayISO } from "@/core/date";
import { enrich } from "@/core/enrich/client";
import type { ApiKeyMode } from "@/core/enrich/types";
import {
  buildOnboardingPromptContext,
  buildOnboardingSummary,
  defaultOnboardingProfile,
  type OnboardingBias,
  type OnboardingConsideration,
  type OnboardingMicronutrient,
  type OnboardingProfile,
} from "@/core/onboarding";
import type { Domain, Entry, EntryMediaAttachment } from "@/core/types";
import { EntryRepository } from "@/data/EntryRepository";
import {
  SavedExerciseRepository,
  type SavedExercise,
} from "@/data/SavedExerciseRepository";
import {
  SavedMealRepository,
  type SavedMeal,
} from "@/data/SavedMealRepository";
import {
  SavedRoutineRepository,
  type SavedRoutine,
} from "@/data/SavedRoutineRepository";
import {
  GROUP_COLORS,
  GROUP_ORDER,
  muscleById,
  MUSCLES,
  WEEKLY_SET_TARGET,
  type MuscleGroupId,
} from "@/domains/anatomy";
import { trimLeadingGaps } from "@/domains/chartScale";
import { formatWaterMl, mergeFoodEdit, sumFoodData } from "@/domains/food";
import { routineSummary } from "@/domains/routines";
import { foodEditSchema, foodSchema, type FoodData } from "@/domains/schemas";
import {
  formatWorkoutDistance,
  formatWorkoutDuration,
  formatWorkoutPace,
  inferWorkoutKind,
  WORKOUT_METRIC_COLORS,
} from "@/domains/workout";
import {
  buildMonitorReport,
  type CardioModality,
  type MonitorFocus,
  type MonitorPeriod,
} from "@/domains/workoutMonitor";
import { useColors } from "@/hooks/use-colors";
import { useFoodGoals } from "@/hooks/useFoodGoals";
import { getLang, t } from "@/i18n";
import { useAppModalStore } from "@/store/useAppModalStore";
import { useAppStore, type ThemeMode } from "@/store/useAppStore";

import { FoodEntryDetailSheet } from "./FoodEntryDetailSheet";
import { DraftStack } from "./FoodMediaDraftTray";
import { FoodNutritionEditSheet } from "./FoodNutritionEditSheet";
import { SheetFrame } from "./SheetFrame";

// Tints pulled from the reference screenshots (no theme token for these).
const TINT = {
  blue: "#2E9BFF",
  purple: "#8B5CF6",
  indigo: "#6366F1",
  magenta: "#E45AC0",
};
const OPTION_MENU_WIDTH = 250;
const OPTION_MENU_RADIUS = 26;
const UPGRADE_BG = "#FFC933";
const UPGRADE_FG = "#151312";
// ponytail: placeholder app logos — real brand marks are out of scope for the clone.
const CLUSTER = ["#D97757", "#F5F5F5", "#0B0B0B", "#6C5CE7", "#4285F4"];
// ponytail: static placeholder — the app has no account/auth concept yet.
const ACCOUNT_NAME = "Maicon Pereira Barbosa";
const ACCOUNT_EMAIL = "maiconpb85@gmail.com";
const BIAS_VALUES = [
  0, 1, 2, 3, 4,
] as const satisfies readonly OnboardingBias[];
const GOAL_TYPE_OPTIONS = [
  { value: "lose", label: { "pt-BR": "Perder peso", "en-US": "Lose weight" } },
  {
    value: "maintain",
    label: { "pt-BR": "Manter peso", "en-US": "Maintain weight" },
  },
  { value: "gain", label: { "pt-BR": "Ganhar peso", "en-US": "Gain weight" } },
] as const;

type GoalType = (typeof GOAL_TYPE_OPTIONS)[number]["value"];
type OptionMenuItem<T extends string> = {
  icon?: AppIconName;
  label: string;
  value: T;
};

const GOAL_CONSIDERATIONS: {
  value: OnboardingConsideration;
  label: string;
  icon: AppIconName;
}[] = [
  { value: "high-protein", label: "Alta proteína", icon: "beef" },
  { value: "low-carb", label: "Baixo carboidrato", icon: "wheat" },
  { value: "athlete", label: "Atleta", icon: "asterisk" },
  { value: "strength", label: "Treino de força", icon: "dumbbell" },
  { value: "endurance", label: "Treino de resistência", icon: "navigation" },
];

const MICRO_TARGETS = [
  {
    key: "sugar" as const,
    label: "Monitorar açúcar",
    icon: "squareStack" as const,
    color: TINT.blue,
    dailyLabel: "M\u00e1ximo di\u00e1rio",
    dailyUnit: "g",
  },
  {
    key: "fiber" as const,
    label: "Monitorar fibras",
    icon: "apple" as const,
    color: "#34C759",
    dailyLabel: "M\u00ednimo di\u00e1rio",
    dailyUnit: "g",
  },
  {
    key: "sodium" as const,
    label: "Monitorar sódio",
    icon: "asterisk" as const,
    color: "#FF922E",
    dailyLabel: "M\u00e1ximo di\u00e1rio",
    dailyUnit: "mg",
  },
];

function micronutrientTargetValue(
  profile: OnboardingProfile,
  key: OnboardingMicronutrient,
): string {
  if (key === "sugar") return String(profile.micronutrientTargets.sugarG);
  if (key === "fiber") return String(profile.micronutrientTargets.fiberG);
  return formatThousands(profile.micronutrientTargets.sodiumMg);
}

const noop = () => {};

function measureOptionAnchor(
  ref: RefObject<View | null>,
  onMeasure: (anchor: AppModalAnchor | null) => void,
) {
  if (!ref.current) {
    onMeasure(null);
    return;
  }
  ref.current.measureInWindow((x, y, width, height) => {
    onMeasure({ x, y, width, height });
  });
}

function formatWeight(kg: number): string {
  return `${kg.toFixed(1)} kg`;
}

function formatThousands(value: number): string {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  const colors = useColors();
  return (
    <View style={styles.section}>
      <AppText
        variant="caption"
        color={colors.textTertiary}
        style={styles.sectionLabel}
      >
        {label}
      </AppText>
      <View
        style={[styles.card, { backgroundColor: colors.backgroundElement }]}
      >
        {children}
      </View>
    </View>
  );
}

function Divider() {
  const colors = useColors();
  return <View style={[styles.divider, { backgroundColor: colors.border }]} />;
}

function Chevron() {
  const colors = useColors();
  return <AppIcon name="chevronRight" color={colors.textTertiary} size={18} />;
}

function ValueTrailing({ label }: { label: string }) {
  const colors = useColors();
  return (
    <View style={styles.value}>
      <AppText variant="secondary" color={colors.textSecondary}>
        {label}
      </AppText>
      <AppIcon name="chevronDown" color={colors.textTertiary} size={16} />
    </View>
  );
}

function OptionMenu<T extends string>({
  visible,
  anchor,
  selectedValue,
  options,
  onSelect,
  onClose,
}: {
  visible: boolean;
  anchor: AppModalAnchor | null;
  selectedValue: T;
  options: readonly OptionMenuItem<T>[];
  onSelect: (value: T) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const { width: windowWidth } = useWindowDimensions();
  if (!visible) return null;

  const menuHeight = options.length * 52 + Spacing.one * 2;
  const preferredRight = anchor
    ? Math.round(windowWidth - (anchor.x + anchor.width) + Spacing.two)
    : Spacing.six;
  const right = Math.max(
    Spacing.two,
    Math.min(windowWidth - OPTION_MENU_WIDTH - Spacing.two, preferredRight),
  );
  const menuPosition = {
    top: anchor
      ? Math.max(Spacing.two, Math.round(anchor.y + anchor.height - menuHeight))
      : Spacing.eight,
    right,
  };

  return (
    <View style={styles.optionMenuOverlay}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

      <GlassSurface glass="regular" style={[styles.optionMenu, menuPosition]}>
        {options.map((option) => {
          const selected = option.value === selectedValue;
          return (
            <Pressable
              key={option.value}
              onPress={() => onSelect(option.value)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={({ pressed }) => [
                styles.optionMenuRow,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.optionMenuCheckSlot}>
                {selected ? (
                  <AppIcon name="check" color={colors.text} size={26} />
                ) : null}
              </View>
              <AppText variant="body" style={styles.optionMenuText}>
                {option.label}
              </AppText>
            </Pressable>
          );
        })}
      </GlassSurface>
    </View>
  );
}

function Toggle({
  value,
  onValueChange,
}: {
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  const colors = useColors();
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      trackColor={{ true: colors.success, false: colors.backgroundSelected }}
      thumbColor="#FFFFFF"
      ios_backgroundColor={colors.backgroundSelected}
    />
  );
}

function savedMealToEntry(meal: SavedMeal): Entry {
  return {
    id: meal.id,
    date: "",
    domain: "food",
    text: meal.name,
    media: meal.media,
    status: "done",
    data: meal.data,
    error: null,
    createdAt: meal.createdAt,
  };
}

function mealImages(meal: SavedMeal): EntryMediaAttachment[] {
  return meal.media?.filter((item) => item.uri) ?? [];
}

function SavedMealMetric({
  icon,
  color,
  value,
}: {
  icon: AppIconName;
  color: string;
  value: string;
}) {
  const colors = useColors();
  return (
    <View style={styles.savedMealMetric}>
      <AppIcon name={icon} color={color} size={13} />
      <AppText
        variant="caption"
        color={colors.textSecondary}
        style={styles.savedMealMetricValue}
      >
        {value}
      </AppText>
    </View>
  );
}

function SavedMealSelectIcon({ selected }: { selected: boolean }) {
  const colors = useColors();
  return (
    <View
      style={[
        styles.savedMealSelectIcon,
        {
          borderColor: colors.carbs,
          backgroundColor: selected ? colors.carbs : "transparent",
        },
      ]}
    >
      <AppIcon
        name={selected ? "check" : "plus"}
        color={selected ? "#FFFFFF" : colors.carbs}
        size={18}
      />
    </View>
  );
}

function SavedMealRow({
  meal,
  onPress,
  selectable = false,
  selected = false,
}: {
  meal: SavedMeal;
  onPress: () => void;
  selectable?: boolean;
  selected?: boolean;
}) {
  const colors = useColors();
  const totals = sumFoodData(meal.data);
  const images = mealImages(meal);
  const metrics = [
    {
      key: "cal",
      icon: "flame" as const,
      color: colors.calories,
      value: `${Math.round(totals.calories)}`,
    },
    {
      key: "protein",
      icon: "beef" as const,
      color: colors.protein,
      value: `${Math.round(totals.protein)}g`,
    },
    {
      key: "carbs",
      icon: "wheat" as const,
      color: colors.carbs,
      value: `${Math.round(totals.carbs)}g`,
    },
    {
      key: "fat",
      icon: "droplet" as const,
      color: colors.fat,
      value: `${Math.round(totals.fat)}g`,
    },
    ...(totals.waterMl > 0
      ? [
          {
            key: "water",
            icon: "glassWater" as const,
            color: colors.water,
            value: formatWaterMl(totals.waterMl),
          },
        ]
      : []),
  ];

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={selectable ? { selected } : undefined}
      style={({ pressed }) => [pressed && styles.pressed]}
    >
      <View style={styles.savedMealRow}>
        {images.length > 0 ? (
          <View style={styles.savedMealImages}>
            <DraftStack drafts={images} size={44} overlap={-44} />
          </View>
        ) : null}

        <View style={styles.savedMealContent}>
          <AppText
            variant="body"
            numberOfLines={1}
            style={styles.savedMealName}
          >
            {meal.name}
          </AppText>
          <View style={styles.savedMealMetrics}>
            {metrics.map((metric, index) => (
              <View key={metric.key} style={styles.savedMealMetricChunk}>
                {index > 0 ? (
                  <AppText variant="caption" color={colors.textTertiary}>
                    {"\u00b7"}
                  </AppText>
                ) : null}
                <SavedMealMetric
                  icon={metric.icon}
                  color={metric.color}
                  value={metric.value}
                />
              </View>
            ))}
          </View>
        </View>

        {selectable ? <SavedMealSelectIcon selected={selected} /> : <Chevron />}
      </View>
    </Pressable>
  );
}

function SavedMealsContent({
  meals,
  onSelect,
  selectable = false,
  selectedIds = [],
}: {
  meals: SavedMeal[];
  onSelect: (meal: SavedMeal) => void;
  selectable?: boolean;
  selectedIds?: string[];
}) {
  const colors = useColors();

  if (meals.length === 0) {
    return (
      <View
        style={[
          styles.card,
          styles.emptySavedMeals,
          { backgroundColor: colors.backgroundElement },
        ]}
      >
        <AppText variant="body" color={colors.textSecondary}>
          {t("settings.meals.empty")}
        </AppText>
      </View>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
      {meals.map((meal, index) => (
        <View key={meal.id}>
          {index > 0 ? <Divider /> : null}
          <SavedMealRow
            meal={meal}
            onPress={() => onSelect(meal)}
            selectable={selectable}
            selected={selectedIds.includes(meal.id)}
          />
        </View>
      ))}
    </View>
  );
}

export function SavedMealsSheet({
  visible,
  onClose,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (meals: SavedMeal[]) => void;
}) {
  const colors = useColors();
  const [meals, setMeals] = useState<SavedMeal[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    if (!visible) {
      setSelectedIds([]);
      return;
    }
    void SavedMealRepository.all().then(setMeals);
  }, [visible]);

  const toggleMeal = (meal: SavedMeal) => {
    setSelectedIds((current) =>
      current.includes(meal.id)
        ? current.filter((id) => id !== meal.id)
        : [...current, meal.id],
    );
  };

  const confirmSelection = () => {
    const selectedMeals = meals.filter((meal) => selectedIds.includes(meal.id));
    if (selectedMeals.length === 0) return;
    onSelect(selectedMeals);
  };
  const hasSelection = selectedIds.length > 0;

  return (
    <SheetFrame
      visible={visible}
      title={t("settings.section.meals")}
      onClose={onClose}
      centerTitle
      hideDefaultClose={hasSelection}
      headerLeading={
        hasSelection ? (
          <Pressable
            onPress={onClose}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={t("common.close")}
          >
            <GlassSurface
              glass="regular"
              isInteractive
              style={styles.savedMealHeaderButton}
            >
              <AppIcon name="x" color={colors.textSecondary} size={18} />
            </GlassSurface>
          </Pressable>
        ) : null
      }
      headerTrailing={
        hasSelection ? (
          <Pressable
            onPress={confirmSelection}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={t("settings.done")}
            style={({ pressed }) => [
              styles.savedMealConfirm,
              { backgroundColor: colors.carbs },
              pressed && styles.pressed,
            ]}
          >
            <AppIcon name="check" color="#FFFFFF" size={18} />
          </Pressable>
        ) : null
      }
      size="full"
    >
      <SavedMealsContent
        meals={meals}
        onSelect={toggleMeal}
        selectable
        selectedIds={selectedIds}
      />
    </SheetFrame>
  );
}

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
    <View style={styles.savedMealRow}>
      <View style={styles.summaryIcon}>
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
      <View style={styles.savedMealContent}>
        <AppText variant="body" numberOfLines={1} style={styles.savedMealName}>
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
            styles.savedMealSelectIcon,
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
        <Pressable
          onPress={() => onDelete(workout)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t("settings.workout.deleteSaved")}
        >
          <AppIcon name="trash" color={colors.danger} size={18} />
        </Pressable>
      ) : (
        <Chevron />
      )}
    </View>
  );

  if (!onPress) return row;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={selectable ? { selected } : undefined}
      style={({ pressed }) => [pressed && styles.pressed]}
    >
      {row}
    </Pressable>
  );
}

function SavedExercisesContent({
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
          styles.card,
          styles.emptySavedMeals,
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
    <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
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
  const [workouts, setWorkouts] = useState<SavedExercise[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    if (!visible) {
      setSelectedIds([]);
      return;
    }
    void SavedExerciseRepository.all().then(setWorkouts);
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
          <Pressable
            onPress={onClose}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={t("common.close")}
          >
            <GlassSurface
              glass="regular"
              isInteractive
              style={styles.savedMealHeaderButton}
            >
              <AppIcon name="x" color={colors.textSecondary} size={18} />
            </GlassSurface>
          </Pressable>
        ) : null
      }
      headerTrailing={
        hasSelection ? (
          <Pressable
            onPress={confirmSelection}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={t("settings.done")}
            style={({ pressed }) => [
              styles.savedMealConfirm,
              { backgroundColor: colors.accent },
              pressed && styles.pressed,
            ]}
          >
            <AppIcon name="check" color="#FFFFFF" size={18} />
          </Pressable>
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

function SavedRoutinesSheet({
  visible,
  domain,
  onClose,
}: {
  visible: boolean;
  domain: Domain;
  onClose: () => void;
}) {
  const colors = useColors();
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
      {routines.length === 0 ? (
        <View
          style={[
            styles.card,
            styles.emptySavedMeals,
            { backgroundColor: colors.backgroundElement },
          ]}
        >
          <AppText variant="body" color={colors.textSecondary}>
            {t("routine.emptySaved")}
          </AppText>
        </View>
      ) : (
        <View
          style={[styles.card, { backgroundColor: colors.backgroundElement }]}
        >
          {routines.map((routine, index) => (
            <View key={routine.id}>
              {index > 0 ? <Divider /> : null}
              <View style={styles.savedMealRow}>
                <View style={styles.summaryIcon}>
                  <AppIcon
                    name={domain === "food" ? "utensils" : "dumbbell"}
                    color={domain === "food" ? colors.carbs : colors.accent}
                    size={18}
                  />
                </View>
                <View style={styles.savedMealContent}>
                  <View style={styles.routineTitleRow}>
                    <AppText
                      variant="body"
                      numberOfLines={1}
                      style={styles.savedMealName}
                    >
                      {routine.name}
                    </AppText>
                    {routine.weekday !== null ? (
                      <View
                        style={[
                          styles.routineWeekday,
                          { borderColor: colors.border },
                        ]}
                      >
                        <AppText variant="caption" color={colors.textSecondary}>
                          {t(
                            `weekday.long.${routine.weekday}` as "weekday.long.0",
                          )}
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
                <Pressable
                  onPress={() => void remove(routine)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={t("routine.deleteSaved")}
                >
                  <AppIcon name="trash" color={colors.danger} size={18} />
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      )}
    </PageSheet>
  );
}

function ApiKeyField({
  label,
  hint,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const colors = useColors();
  return (
    <View style={styles.apiKeyField}>
      <AppText variant="body">{label}</AppText>
      {hint ? (
        <AppText variant="caption" color={colors.textTertiary}>
          {hint}
        </AppText>
      ) : null}
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        // Not a password field, but the value is a credential — keep it out of
        // the keyboard's learned-words store and off the screen in plain sight.
        secureTextEntry
        style={[
          styles.apiKeyInput,
          { backgroundColor: colors.surfaceMuted, color: colors.text },
        ]}
      />
    </View>
  );
}

function ApiKeysSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const colors = useColors();
  const apiKeys = useAppStore((s) => s.apiKeys);
  const setApiKeys = useAppStore((s) => s.setApiKeys);
  const [draft, setDraft] = useState(apiKeys);

  useEffect(() => {
    if (visible) setDraft(apiKeys);
  }, [visible, apiKeys]);

  const modes: { value: ApiKeyMode; title: string; subtitle: string }[] = [
    {
      value: "managed",
      title: t("settings.api.managed"),
      subtitle: t("settings.api.managedHint"),
    },
    {
      value: "own",
      title: t("settings.api.own"),
      subtitle: t("settings.api.ownHint"),
    },
  ];

  const save = () => {
    void setApiKeys(draft);
    onClose();
  };

  return (
    <PageSheet
      visible={visible}
      title={t("settings.connect.api")}
      onClose={onClose}
      onSave={save}
      keyboardAwareScroll
    >
      <Section label={t("settings.api.mode")}>
        {modes.map((mode, index) => (
          <View key={mode.value}>
            {index > 0 ? <Divider /> : null}
            <SettingsRow
              title={mode.title}
              subtitle={mode.subtitle}
              trailing={
                draft.mode === mode.value ? (
                  <AppIcon name="check" color={colors.accent} size={18} />
                ) : undefined
              }
              onPress={() =>
                setDraft((current) => ({ ...current, mode: mode.value }))
              }
            />
          </View>
        ))}
      </Section>

      {draft.mode === "own" ? (
        <Section label={t("settings.api.keys")}>
          <ApiKeyField
            label={t("settings.api.chatKey")}
            hint={t("settings.api.chatKeyHint")}
            value={draft.chat}
            placeholder="sk-..."
            onChange={(chat) => setDraft((current) => ({ ...current, chat }))}
          />
          <Divider />
          <ApiKeyField
            label={t("settings.api.imageKey")}
            hint={t("settings.api.imageKeyHint")}
            value={draft.image}
            placeholder={t("settings.api.sameAsChat")}
            onChange={(image) => setDraft((current) => ({ ...current, image }))}
          />
        </Section>
      ) : null}
    </PageSheet>
  );
}

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
const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

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

function WorkoutMonitorSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const colors = useColors();
  const [entries, setEntries] = useState<Entry[]>([]);
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

  useEffect(() => {
    if (!visible) return;
    void EntryRepository.findAll("workout").then(setEntries);
  }, [visible]);

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
  const selectScope = (value: string) => {
    setFocus((current) => {
      if (openSelect === "group")
        return value ? { group: value as MuscleGroupId } : {};
      if (openSelect === "muscle") {
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
          onSelect={selectScope}
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
            styles.card,
            styles.emptySavedMeals,
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
              styles.card,
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
              <View style={styles.section}>
                {/* Cascading selects, same pattern as "Tipo de meta":
                      grupamento -> musculo daquele grupamento -> porcao daquele
                      musculo. Each one only appears once the one above it is
                      chosen, so the panorama narrows macro -> micro. */}
                <View
                  style={[
                    styles.card,
                    { backgroundColor: colors.backgroundElement },
                  ]}
                >
                  <View ref={groupRowRef} collapsable={false}>
                    <SettingsRow
                      title={t("monitor.levelGroup")}
                      trailing={
                        <ValueTrailing
                          label={
                            focus.group
                              ? t(`muscle.${focus.group}` as "muscle.legs")
                              : t("monitor.allScopes")
                          }
                        />
                      }
                      onPress={() => openScopeSelect("group", groupRowRef)}
                    />
                  </View>

                  {focus.group ? (
                    <>
                      <Divider />
                      <View ref={muscleRowRef} collapsable={false}>
                        <SettingsRow
                          title={t("monitor.levelMuscle")}
                          trailing={
                            <ValueTrailing
                              label={
                                focus.muscle
                                  ? t(
                                      `muscleName.${focus.muscle}` as "muscleName.quadriceps",
                                    )
                                  : t("monitor.allScopes")
                              }
                            />
                          }
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
                          trailing={
                            <ValueTrailing
                              label={focus.portion ?? t("monitor.allScopes")}
                            />
                          }
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
                      styles.card,
                      styles.chartCard,
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
                      styles.card,
                      styles.emptySavedMeals,
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
                <View style={styles.section}>
                  <AppText
                    variant="caption"
                    color={colors.textTertiary}
                    style={styles.sectionLabel}
                  >
                    {t("monitor.loadProgress")}
                  </AppText>
                  <View
                    style={[
                      styles.card,
                      styles.chartCard,
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
                      styles.card,
                      styles.chartCard,
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
                    styles.card,
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
                styles.card,
                styles.emptySavedMeals,
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

function AccountCard() {
  const colors = useColors();
  return (
    <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
      <View style={styles.accountRow}>
        <AppText variant="body" color={colors.textSecondary}>
          {t("settings.account.name")}
        </AppText>
        <AppText variant="body" numberOfLines={1} style={styles.accountValue}>
          {ACCOUNT_NAME}
        </AppText>
      </View>
      <Divider />
      <View style={styles.accountRow}>
        <AppText variant="body" color={colors.textSecondary}>
          {t("settings.account.email")}
        </AppText>
        <AppText variant="body" numberOfLines={1} style={styles.accountValue}>
          {ACCOUNT_EMAIL}
        </AppText>
      </View>
    </View>
  );
}

function GoalsSummary() {
  const colors = useColors();
  const profile =
    useAppStore((s) => s.onboardingProfile) ?? defaultOnboardingProfile();
  const goals = useFoodGoals();

  return (
    <View style={styles.summary}>
      <View style={styles.summaryIcon}>
        <AppIcon name="target" color={TINT.blue} size={20} />
      </View>
      <View style={styles.summaryText}>
        <AppText style={styles.weight}>
          {formatWeight(profile.goalWeightKg)}
        </AppText>
        <View style={styles.macroLine}>
          <AppIcon name="flame" color={colors.calories} size={13} />
          <AppText variant="secondary" color={colors.textSecondary}>
            {` ${formatThousands(goals.calories)} cal  •  `}
            <AppText variant="secondary" color={colors.protein}>
              {"P "}
            </AppText>
            {`${goals.protein}g  •  `}
            <AppText variant="secondary" color={colors.carbs}>
              {"C "}
            </AppText>
            {`${goals.carbs}g  •  `}
            <AppText variant="secondary" color={colors.fat}>
              {"F "}
            </AppText>
            {`${goals.fat}g  •  `}
            <AppText variant="secondary" color={colors.water}>
              {"H "}
            </AppText>
            {formatWaterMl(goals.waterMl)}
          </AppText>
        </View>
      </View>
    </View>
  );
}

function HeaderIconButton({
  icon,
  onPress,
  filled = false,
}: {
  icon: "x" | "check";
  onPress: () => void;
  filled?: boolean;
}) {
  const colors = useColors();
  const color = filled ? "#FFFFFF" : colors.textSecondary;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={icon === "x" ? t("common.close") : t("settings.done")}
      style={({ pressed }) => [pressed && styles.pressed]}
    >
      {filled ? (
        <View
          style={[styles.headerIconButton, { backgroundColor: colors.success }]}
        >
          <AppIcon name={icon} color={color} size={22} />
        </View>
      ) : (
        <GlassSurface
          glass="regular"
          isInteractive
          style={styles.headerIconButton}
        >
          <AppIcon name={icon} color={color} size={22} />
        </GlassSurface>
      )}
    </Pressable>
  );
}

function PageSheet({
  visible,
  title,
  onClose,
  onDismiss,
  onSave,
  children,
  overlay,
  contentBottomInset,
  keyboardAwareScroll,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  onDismiss?: () => void;
  onSave?: () => void;
  children: ReactNode;
  overlay?: ReactNode;
  contentBottomInset?: number;
  keyboardAwareScroll?: boolean;
}) {
  return (
    <SheetFrame
      visible={visible}
      title={title}
      onClose={onClose}
      onDismiss={onDismiss}
      centerTitle
      hideDefaultClose={Boolean(onSave)}
      keyboardAwareScroll={keyboardAwareScroll}
      contentBottomInset={contentBottomInset}
      overlay={overlay}
      headerLeading={
        onSave ? <HeaderIconButton icon="x" onPress={onClose} /> : null
      }
      headerTrailing={
        onSave ? (
          <HeaderIconButton icon="check" filled onPress={onSave} />
        ) : null
      }
      size="full"
    >
      {children}
    </SheetFrame>
  );
}

function NumberUnit({ value, unit }: { value: string | number; unit: string }) {
  const colors = useColors();
  return (
    <View style={styles.numberUnit}>
      <AppText variant="body" style={styles.metricValueText}>
        {value}
      </AppText>
      <AppText variant="body" color={colors.textTertiary}>
        {unit}
      </AppText>
    </View>
  );
}

function DisclosureValue({ value }: { value: string }) {
  const colors = useColors();
  return (
    <View style={styles.disclosureValue}>
      <AppText
        variant="secondary"
        color={colors.textSecondary}
        numberOfLines={2}
        style={styles.disclosureText}
      >
        {value}
      </AppText>
      <Chevron />
    </View>
  );
}

function clampPickerWeight(weightKg: number): number {
  return Math.min(180, Math.max(45, Math.round(weightKg * 2) / 2));
}

function goalTypeFor(profile: OnboardingProfile): GoalType {
  if (Math.abs(profile.goalWeightKg - profile.weightKg) < 0.25)
    return "maintain";
  return profile.goalWeightKg > profile.weightKg ? "gain" : "lose";
}

function goalTypeLabel(profile: OnboardingProfile): string {
  const lang = getLang();
  return (
    GOAL_TYPE_OPTIONS.find((option) => option.value === goalTypeFor(profile))
      ?.label[lang] ?? GOAL_TYPE_OPTIONS[1].label[lang]
  );
}

function applyGoalType(profile: OnboardingProfile, nextType: GoalType) {
  if (goalTypeFor(profile) === nextType) return profile;
  const delta = Math.max(Math.abs(profile.goalWeightKg - profile.weightKg), 5);
  const goalWeightKg =
    nextType === "maintain"
      ? profile.weightKg
      : profile.weightKg + (nextType === "gain" ? delta : -delta);
  return { ...profile, goalWeightKg: clampPickerWeight(goalWeightKg) };
}

function genderLabel(gender: OnboardingProfile["gender"]): string {
  const lang = getLang();
  return (
    genderOptions.find((option) => option.value === gender)?.label[lang] ??
    genderOptions[0].label[lang]
  );
}

function activityLabel(activity: OnboardingProfile["activity"]): string {
  const lang = getLang();
  return (
    activityOptions.find((option) => option.value === activity)?.label[lang] ??
    activityOptions[0].label[lang]
  );
}

function GoalChip({
  option,
  selected,
  onPress,
}: {
  option: (typeof GOAL_CONSIDERATIONS)[number];
  selected: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.goalChip,
        {
          backgroundColor: selected
            ? colors.backgroundSelected
            : colors.surfaceMuted,
        },
        pressed && styles.pressed,
      ]}
    >
      <AppIcon
        name={option.icon}
        color={selected ? colors.text : colors.textSecondary}
        size={16}
      />
      <AppText
        variant="label"
        color={selected ? colors.text : colors.textSecondary}
      >
        {option.label}
      </AppText>
    </Pressable>
  );
}

function TargetRow({
  icon,
  color,
  label,
  value,
  unit,
}: {
  icon: AppIconName;
  color: string;
  label: string;
  value: string | number;
  unit: string;
}) {
  return (
    <SettingsRow
      icon={icon}
      iconColor={color}
      title={label}
      trailing={<NumberUnit value={value} unit={unit} />}
    />
  );
}

function MicroTargetDailyRow({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit: string;
}) {
  const colors = useColors();
  return (
    <View style={styles.microTargetDailyRow}>
      <AppText variant="body" color={colors.textSecondary}>
        {label}
      </AppText>
      <NumberUnit value={value} unit={unit} />
    </View>
  );
}

function NutritionGoalsSheet({
  visible,
  domain,
  onClose,
  onDismiss,
  onOpenHealth,
}: {
  visible: boolean;
  domain: Domain;
  onClose: () => void;
  onDismiss?: () => void;
  onOpenHealth: () => void;
}) {
  const colors = useColors();
  const lang = getLang();
  const activeModal = useAppModalStore((s) => s.stack.at(-1));
  const openAppModal = useAppModalStore((s) => s.openAppModal);
  const closeAppModal = useAppModalStore((s) => s.closeAppModal);
  const storedProfile = useAppStore((s) => s.onboardingProfile);
  const updateProfile = useAppStore((s) => s.updateOnboardingProfile);
  const [draft, setDraft] = useState<OnboardingProfile>(
    () => storedProfile ?? defaultOnboardingProfile(),
  );
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const goalTypeRowRef = useRef<View>(null);
  const [goalTypeMenuOpen, setGoalTypeMenuOpen] = useState(false);
  const [goalTypeAnchor, setGoalTypeAnchor] = useState<AppModalAnchor | null>(
    null,
  );
  const [micros, setMicros] = useState<
    Record<OnboardingMicronutrient, boolean>
  >(() => draft.micronutrients);
  const [goalWeightPickerOpen, setGoalWeightPickerOpen] = useState(false);
  const [goalDatePickerOpen, setGoalDatePickerOpen] = useState(false);
  const goalWeightOpen =
    activeModal?.id === "settings.goalWeightPicker" || goalWeightPickerOpen;
  const goalDateOpen =
    activeModal?.id === "settings.goalDatePicker" || goalDatePickerOpen;
  const [goalDateDraft, setGoalDateDraft] = useState(
    () => draft.goalDate ?? addDays(todayISO(), 84),
  );

  useEffect(() => {
    if (!visible) return;
    const profile = storedProfile ?? defaultOnboardingProfile();
    setDraft(profile);
    setGoalDateDraft(profile.goalDate ?? addDays(todayISO(), 84));
    setMicros(profile.micronutrients);
  }, [storedProfile, visible]);

  useEffect(() => {
    if (!visible) {
      setGoalTypeMenuOpen(false);
      setGoalTypeAnchor(null);
      setGoalWeightPickerOpen(false);
      setGoalDatePickerOpen(false);
    }
  }, [visible]);

  const summary = buildOnboardingSummary(draft);
  const save = async () => {
    await updateProfile({
      ...draft,
      trackMicronutrients: Object.values(micros).some(Boolean),
      micronutrients: micros,
    });
    onClose();
  };
  const toggleConsideration = (value: OnboardingConsideration) => {
    setDraft((current) => {
      const selected = current.considerations.includes(value);
      return {
        ...current,
        considerations: selected
          ? current.considerations.filter((item) => item !== value)
          : [...current.considerations, value],
      };
    });
  };
  const openGoalWeightPicker = () => {
    if (
      !canOpenAppModal("settings.nutritionGoals", "settings.goalWeightPicker")
    )
      return;
    setGoalWeightPickerOpen(true);
    openAppModal({ id: "settings.goalWeightPicker", domain });
  };
  const toggleGoalDate = (enabled: boolean) => {
    const fallbackGoalDate = draft.goalDate ?? addDays(todayISO(), 84);
    setGoalDateDraft(fallbackGoalDate);
    setDraft((current) => {
      const goalDate = current.goalDate ?? fallbackGoalDate;
      return { ...current, goalDate: enabled ? goalDate : null };
    });
  };
  const openGoalDatePicker = () => {
    if (!draft.goalDate) return;
    if (!canOpenAppModal("settings.nutritionGoals", "settings.goalDatePicker"))
      return;
    setGoalDateDraft(draft.goalDate);
    setGoalDatePickerOpen(true);
    openAppModal({ id: "settings.goalDatePicker", domain });
  };
  const closeGoalDatePicker = () => {
    setGoalDatePickerOpen(false);
    closeAppModal("settings.goalDatePicker");
  };
  const saveGoalDate = () => {
    setDraft((current) => ({ ...current, goalDate: goalDateDraft }));
    closeGoalDatePicker();
  };
  const goalTypeOptions: OptionMenuItem<GoalType>[] = GOAL_TYPE_OPTIONS.map(
    (option) => ({
      value: option.value,
      label: option.label[lang],
    }),
  );
  const toggleGoalTypeMenu = () => {
    if (goalTypeMenuOpen) {
      setGoalTypeMenuOpen(false);
      return;
    }
    measureOptionAnchor(goalTypeRowRef, (anchor) => {
      setGoalTypeAnchor(anchor);
      setGoalTypeMenuOpen(true);
    });
  };
  const selectGoalType = (type: GoalType) => {
    setDraft((current) => applyGoalType(current, type));
    setGoalTypeMenuOpen(false);
  };

  return (
    <>
      <PageSheet
        visible={visible}
        title="Metas nutricionais"
        onClose={onClose}
        onDismiss={onDismiss}
        onSave={save}
        overlay={
          <>
            <OptionMenu
              visible={goalTypeMenuOpen}
              anchor={goalTypeAnchor}
              selectedValue={goalTypeFor(draft)}
              options={goalTypeOptions}
              onSelect={selectGoalType}
              onClose={() => setGoalTypeMenuOpen(false)}
            />
            <PickerSheet
              lang={lang}
              text={copy[lang]}
              picker={goalWeightOpen ? "goalWeight" : null}
              profile={draft}
              presentation="overlay"
              onClose={() => {
                setGoalWeightPickerOpen(false);
                closeAppModal("settings.goalWeightPicker");
              }}
              onPick={(kind, value) => {
                if (kind === "goalWeight" && typeof value === "number") {
                  setDraft((current) => ({ ...current, goalWeightKg: value }));
                }
                setGoalWeightPickerOpen(false);
                closeAppModal("settings.goalWeightPicker");
              }}
            />
            <DatePickerSheet
              visible={goalDateOpen}
              title="Data-alvo"
              lang={lang}
              buttonLabel={copy[lang].saveDate}
              value={goalDateDraft}
              minimumDate={new Date()}
              presentation="overlay"
              onChange={setGoalDateDraft}
              onClose={closeGoalDatePicker}
              onSave={saveGoalDate}
            />
          </>
        }
      >
        <Section label="Seu gasto diário">
          <View style={styles.tdeeRow}>
            <AppIcon name="flame" color={colors.calories} size={26} />
            <View style={styles.tdeeText}>
              <AppText
                variant="secondary"
                color={colors.textTertiary}
                style={styles.bold}
              >
                TDEE
              </AppText>
              <AppText variant="heading">{`${formatThousands(summary.tdee)} cal/dia`}</AppText>
            </View>
            <Pressable
              onPress={onOpenHealth}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.inlineAction,
                pressed && styles.pressed,
              ]}
            >
              <AppText variant="body" color={TINT.purple} style={styles.bold}>
                Editar perfil
              </AppText>
              <AppIcon name="chevronRight" color={TINT.purple} size={18} />
            </Pressable>
          </View>
        </Section>

        <Section label="Metas de peso">
          <View ref={goalTypeRowRef} collapsable={false}>
            <SettingsRow
              title="Tipo de meta"
              trailing={<ValueTrailing label={goalTypeLabel(draft)} />}
              onPress={toggleGoalTypeMenu}
            />
          </View>
          <Divider />
          <SettingsRow
            title="Peso-alvo"
            trailing={
              <DisclosureValue value={formatWeight(draft.goalWeightKg)} />
            }
            onPress={openGoalWeightPicker}
          />
          <Divider />
          <SettingsRow
            title="Definir data-alvo"
            trailing={
              <Toggle
                value={draft.goalDate !== null}
                onValueChange={toggleGoalDate}
              />
            }
          />
          {draft.goalDate ? (
            <>
              <Divider />
              <SettingsRow
                title="Data-alvo"
                trailing={
                  <DisclosureValue value={formatDate(draft.goalDate, lang)} />
                }
                onPress={openGoalDatePicker}
              />
            </>
          ) : null}
        </Section>

        <View
          style={[styles.card, { backgroundColor: colors.backgroundElement }]}
        >
          <Pressable
            onPress={() => setPrefsOpen((current) => !current)}
            accessibilityRole="button"
            accessibilityState={{ expanded: prefsOpen }}
            style={({ pressed }) => [
              styles.preferencesHeader,
              pressed && styles.pressed,
            ]}
          >
            <AppIcon name="sparkles" color={TINT.purple} size={20} />
            <AppText variant="body" style={styles.flexText}>
              Preferências de estilo de vida e dieta
            </AppText>
            <AppIcon
              name={prefsOpen ? "chevronUp" : "chevronDown"}
              color={colors.textTertiary}
              size={18}
            />
          </Pressable>
          {prefsOpen ? (
            <>
              <Divider />
              <View style={styles.preferencesBody}>
                <View style={styles.goalChips}>
                  {GOAL_CONSIDERATIONS.map((option) => (
                    <GoalChip
                      key={option.value}
                      option={option}
                      selected={draft.considerations.includes(option.value)}
                      onPress={() => toggleConsideration(option.value)}
                    />
                  ))}
                </View>
                <AppText variant="secondary" color={colors.textSecondary}>
                  Algo mais que GymNotes deve saber?
                </AppText>
                <TextInput
                  value={draft.notes}
                  onChangeText={(notes) =>
                    setDraft((current) => ({ ...current, notes }))
                  }
                  placeholder="ex.: casamento em março, recuperação de..."
                  placeholderTextColor={colors.textTertiary}
                  style={[
                    styles.notesInput,
                    {
                      backgroundColor: colors.surfaceMuted,
                      color: colors.text,
                    },
                  ]}
                />
              </View>
            </>
          ) : null}
        </View>

        <Section label="Metas nutricionais diárias">
          <TargetRow
            icon="flame"
            color={colors.calories}
            label="Meta diária de calorias"
            value={summary.calories}
            unit="cal"
          />
          <Divider />
          <TargetRow
            icon="beef"
            color={colors.fat}
            label="Meta de proteína"
            value={summary.protein}
            unit="g"
          />
          <Divider />
          <TargetRow
            icon="apple"
            color="#FF2D55"
            label="Meta de carboidratos"
            value={summary.carbs}
            unit="g"
          />
          <Divider />
          <TargetRow
            icon="droplet"
            color="#D946EF"
            label="Meta de gordura"
            value={summary.fat}
            unit="g"
          />
        </Section>

        <Section label="Micronutrientes">
          {MICRO_TARGETS.map((target, index) => (
            <View key={target.key}>
              {index > 0 ? <Divider /> : null}
              <SettingsRow
                icon={target.icon}
                iconColor={target.color}
                title={target.label}
                trailing={
                  <Toggle
                    value={Boolean(micros[target.key])}
                    onValueChange={(next) =>
                      setMicros((current) => ({
                        ...current,
                        [target.key]: next,
                      }))
                    }
                  />
                }
              />
              {micros[target.key] ? (
                <>
                  <Divider />
                  <MicroTargetDailyRow
                    label={target.dailyLabel}
                    value={micronutrientTargetValue(draft, target.key)}
                    unit={target.dailyUnit}
                  />
                </>
              ) : null}
            </View>
          ))}
          <Divider />
          <Pressable
            onPress={() => setHelpOpen((current) => !current)}
            accessibilityRole="button"
            accessibilityState={{ expanded: helpOpen }}
            style={({ pressed }) => [
              styles.microHelpHeader,
              pressed && styles.pressed,
            ]}
          >
            <AppText
              variant="secondary"
              color={colors.textSecondary}
              style={styles.flexText}
            >
              Não sabe quais valores colocar aqui?
            </AppText>
            <AppIcon
              name={helpOpen ? "chevronUp" : "chevronDown"}
              color={colors.textTertiary}
              size={18}
            />
          </Pressable>
          {helpOpen ? (
            <View style={styles.microHelpBody}>
              <AppText variant="secondary" color={colors.textSecondary}>
                Para homens adultos como você, metas diárias típicas são:
              </AppText>
              <View style={styles.microHelpMetrics}>
                <SavedMealMetric
                  icon="squareStack"
                  color={TINT.blue}
                  value="Açúcar < 36g"
                />
                <SavedMealMetric
                  icon="apple"
                  color="#34C759"
                  value="Fibras 38g"
                />
                <SavedMealMetric
                  icon="asterisk"
                  color="#FF922E"
                  value="Sódio < 2,300mg"
                />
              </View>
            </View>
          ) : null}
        </Section>
      </PageSheet>
    </>
  );
}

function HealthProfileSheet({
  visible,
  domain,
  onClose,
  onDismiss,
}: {
  visible: boolean;
  domain: Domain;
  onClose: () => void;
  onDismiss?: () => void;
}) {
  const colors = useColors();
  const lang = getLang();
  const activeModal = useAppModalStore((s) => s.stack.at(-1));
  const openAppModal = useAppModalStore((s) => s.openAppModal);
  const closeAppModal = useAppModalStore((s) => s.closeAppModal);
  const storedProfile = useAppStore((s) => s.onboardingProfile);
  const updateProfile = useAppStore((s) => s.updateOnboardingProfile);
  const [draft, setDraft] = useState<OnboardingProfile>(
    () => storedProfile ?? defaultOnboardingProfile(),
  );
  const [birthDateDraft, setBirthDateDraft] = useState(draft.birthDate);
  const genderRowRef = useRef<View>(null);
  const activityRowRef = useRef<View>(null);
  const [profileOptionMenu, setProfileOptionMenu] = useState<
    "gender" | "activity" | null
  >(null);
  const [profileOptionAnchor, setProfileOptionAnchor] =
    useState<AppModalAnchor | null>(null);
  const birthDateOpen = activeModal?.id === "settings.birthDatePicker";
  const profilePicker =
    activeModal?.id === "settings.healthProfilePicker"
      ? activeModal.kind
      : null;

  useEffect(() => {
    if (!visible) return;
    const profile = storedProfile ?? defaultOnboardingProfile();
    setDraft(profile);
    setBirthDateDraft(profile.birthDate);
  }, [storedProfile, visible]);

  useEffect(() => {
    if (!visible) {
      setProfileOptionMenu(null);
      setProfileOptionAnchor(null);
    }
  }, [visible]);

  const summary = buildOnboardingSummary(draft);
  const save = async () => {
    await updateProfile(draft);
    onClose();
  };
  const openBirthDatePicker = () => {
    if (!canOpenAppModal("settings.healthProfile", "settings.birthDatePicker"))
      return;
    setBirthDateDraft(draft.birthDate);
    openAppModal({ id: "settings.birthDatePicker", domain });
  };
  const saveBirthDate = () => {
    setDraft((current) => ({ ...current, birthDate: birthDateDraft }));
    closeAppModal("settings.birthDatePicker");
  };
  const openProfilePicker = (
    kind: Extract<PickerKind, "height" | "weight">,
  ) => {
    if (
      !canOpenAppModal("settings.healthProfile", "settings.healthProfilePicker")
    )
      return;
    openAppModal({ id: "settings.healthProfilePicker", domain, kind });
  };
  const genderMenuOptions: OptionMenuItem<OnboardingProfile["gender"]>[] =
    genderOptions.map((option) => ({
      value: option.value,
      label: option.label[lang],
    }));
  const activityMenuOptions: OptionMenuItem<OnboardingProfile["activity"]>[] =
    activityOptions.map((option) => ({
      value: option.value,
      label: option.label[lang],
    }));
  const toggleProfileOptionMenu = (
    menu: "gender" | "activity",
    ref: RefObject<View | null>,
  ) => {
    if (profileOptionMenu === menu) {
      setProfileOptionMenu(null);
      return;
    }
    measureOptionAnchor(ref, (anchor) => {
      setProfileOptionAnchor(anchor);
      setProfileOptionMenu(menu);
    });
  };
  const selectGender = (gender: OnboardingProfile["gender"]) => {
    setDraft((current) => ({ ...current, gender }));
    setProfileOptionMenu(null);
  };
  const selectActivity = (activity: OnboardingProfile["activity"]) => {
    setDraft((current) => ({ ...current, activity }));
    setProfileOptionMenu(null);
  };
  return (
    <PageSheet
      visible={visible}
      title="Perfil de saúde"
      onClose={onClose}
      onDismiss={onDismiss}
      onSave={save}
      overlay={
        <>
          <OptionMenu
            visible={profileOptionMenu === "gender"}
            anchor={profileOptionAnchor}
            selectedValue={draft.gender}
            options={genderMenuOptions}
            onSelect={selectGender}
            onClose={() => setProfileOptionMenu(null)}
          />
          <OptionMenu
            visible={profileOptionMenu === "activity"}
            anchor={profileOptionAnchor}
            selectedValue={draft.activity}
            options={activityMenuOptions}
            onSelect={selectActivity}
            onClose={() => setProfileOptionMenu(null)}
          />
          <PickerSheet
            lang={lang}
            text={copy[lang]}
            picker={profilePicker}
            profile={draft}
            presentation="overlay"
            onClose={() => closeAppModal("settings.healthProfilePicker")}
            onPick={(kind, value) => {
              if (kind === "height" && typeof value === "number") {
                setDraft((current) => ({ ...current, heightCm: value }));
              }
              if (kind === "weight" && typeof value === "number") {
                setDraft((current) => ({ ...current, weightKg: value }));
              }
              closeAppModal("settings.healthProfilePicker");
            }}
          />
          <DatePickerSheet
            visible={birthDateOpen}
            title={
              lang === "pt-BR" ? "Sua data de nascimento" : "Your birth date"
            }
            lang={lang}
            buttonLabel={copy[lang].saveDate}
            value={birthDateDraft}
            maximumDate={new Date()}
            presentation="overlay"
            onChange={setBirthDateDraft}
            onClose={() => closeAppModal("settings.birthDatePicker")}
            onSave={saveBirthDate}
          />
        </>
      }
    >
      <Section label="Informações básicas">
        <SettingsRow
          title="Data de nascimento"
          trailing={
            <DisclosureValue
              value={`${formatDate(draft.birthDate, lang)}\n(idade: ${summary.age})`}
            />
          }
          onPress={openBirthDatePicker}
        />
        <Divider />
        <View ref={genderRowRef} collapsable={false}>
          <SettingsRow
            title="Gênero"
            trailing={<ValueTrailing label={genderLabel(draft.gender)} />}
            onPress={() => toggleProfileOptionMenu("gender", genderRowRef)}
          />
        </View>
        <Divider />
        <SettingsRow
          title="Altura"
          trailing={<DisclosureValue value={`${draft.heightCm} cm`} />}
          onPress={() => openProfilePicker("height")}
        />
        <Divider />
        <SettingsRow
          title="Peso atual"
          trailing={<DisclosureValue value={formatWeight(draft.weightKg)} />}
          onPress={() => openProfilePicker("weight")}
        />
      </Section>

      <Section label="Atividade">
        <View ref={activityRowRef} collapsable={false}>
          <SettingsRow
            title="Nível de atividade"
            trailing={<ValueTrailing label={activityLabel(draft.activity)} />}
            onPress={() => toggleProfileOptionMenu("activity", activityRowRef)}
          />
        </View>
      </Section>

      <Section label="Gasto diário estimado">
        <View style={styles.healthTdeeCard}>
          <View style={styles.healthTdeeTop}>
            <View>
              <AppText
                variant="secondary"
                color={colors.textSecondary}
                style={styles.bold}
              >
                Seu TDEE
              </AppText>
              <AppText variant="metric">{`${formatThousands(summary.tdee)} cal/dia`}</AppText>
            </View>
            <AppIcon
              name="flame"
              color={colors.calories}
              size={56}
              strokeWidth={2.6}
            />
          </View>
          <Divider />
          <View style={styles.healthTdeeBottom}>
            <View>
              <AppText variant="caption" color={colors.textSecondary}>
                Taxa metabólica basal
              </AppText>
              <AppText variant="heading">{`${formatThousands(summary.bmr)} cal`}</AppText>
            </View>
            <AppText
              variant="caption"
              color={colors.textTertiary}
              style={styles.healthTdeeHint}
            >
              O que você gasta em repouso
            </AppText>
          </View>
        </View>
      </Section>
    </PageSheet>
  );
}

function WeightChart({ weightKg }: { weightKg: number }) {
  const colors = useColors();
  return (
    <View
      style={[styles.chartCard, { backgroundColor: colors.backgroundElement }]}
    >
      <View style={styles.chartTabs}>
        {["30d", "90d", "1y", "All"].map((label) => (
          <View
            key={label}
            style={[
              styles.chartTab,
              {
                backgroundColor:
                  label === "90d" ? TINT.purple : colors.surfaceMuted,
              },
            ]}
          >
            <AppText
              variant="label"
              color={label === "90d" ? "#FFFFFF" : colors.textSecondary}
            >
              {label}
            </AppText>
          </View>
        ))}
      </View>
      <View style={styles.chartPlot}>
        {[72, 71, 70, 69, 68].map((label, index) => (
          <View
            key={label}
            style={[styles.chartGridLine, { top: 10 + index * 43 }]}
          >
            <AppText
              variant="caption"
              color={colors.textTertiary}
              style={styles.chartYAxis}
            >
              {label}
            </AppText>
            <View
              style={[styles.chartGrid, { backgroundColor: colors.border }]}
            />
          </View>
        ))}
        {[0, 1, 2, 3].map((line) => (
          <View
            key={line}
            style={[
              styles.chartVerticalGrid,
              { left: 124 + line * 76, backgroundColor: colors.border },
            ]}
          />
        ))}
        <AppText
          variant="caption"
          color={colors.success}
          style={styles.chartGoalLabel}
        >
          Meta
        </AppText>
        <View style={[styles.chartGoalDash, { borderColor: colors.success }]} />
        <View style={[styles.chartLine, { backgroundColor: TINT.purple }]} />
        <View
          style={[
            styles.chartDot,
            styles.chartDotStart,
            { backgroundColor: TINT.purple },
          ]}
        />
        <View
          style={[
            styles.chartDot,
            styles.chartDotEnd,
            { backgroundColor: TINT.purple },
          ]}
        />
        <AppText
          variant="caption"
          color={colors.textTertiary}
          style={styles.chartValueLabel}
        >
          {weightKg.toFixed(0)}
        </AppText>
      </View>
    </View>
  );
}

function EstimationBiasSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const colors = useColors();
  const lang = getLang();
  const profile =
    useAppStore((s) => s.onboardingProfile) ?? defaultOnboardingProfile();
  const updateProfile = useAppStore((s) => s.updateOnboardingProfile);
  const [bias, setBias] = useState<OnboardingBias>(profile.estimationBias);
  const meta = biasMeta[bias];

  useEffect(() => {
    if (visible) setBias(profile.estimationBias);
  }, [profile.estimationBias, visible]);

  const changeBias = (nextBias: OnboardingBias) => {
    if (nextBias === bias) return;
    setBias(nextBias);
    void updateProfile({ estimationBias: nextBias });
  };

  return (
    <PageSheet
      visible={visible}
      title={t("settings.bias.title")}
      onClose={onClose}
    >
      <View style={styles.biasIntro}>
        <AppText variant="body" color={colors.textSecondary}>
          {t("settings.bias.body")}
        </AppText>
      </View>

      <View
        style={[styles.biasCard, { backgroundColor: colors.backgroundElement }]}
      >
        <View
          style={[styles.biasDot, { backgroundColor: BIAS_DOT_COLORS[bias] }]}
        />
        <View style={styles.biasCopy}>
          <AppText variant="heading">{meta.title[lang]}</AppText>
          <AppText variant="body" color={colors.textSecondary}>
            {meta.body[lang]}
          </AppText>
        </View>
      </View>

      <Section label={t("settings.bias.adjust")}>
        <Slider
          style={styles.biasSlider}
          minimumValue={0}
          maximumValue={4}
          step={1}
          value={bias}
          onValueChange={(next) =>
            changeBias(Math.round(next) as OnboardingBias)
          }
          minimumTrackTintColor={colors.textSecondary}
          maximumTrackTintColor={colors.backgroundSelected}
          thumbTintColor={colors.text}
        />
        <View style={styles.biasLabels}>
          {BIAS_VALUES.map((item) => (
            <Pressable
              key={item}
              onPress={() => changeBias(item)}
              accessibilityRole="button"
              accessibilityState={{ selected: item === bias }}
              style={styles.biasLabelItem}
            >
              <View
                style={[
                  styles.biasLabelDot,
                  { backgroundColor: BIAS_DOT_COLORS[item] },
                  item === bias && styles.biasLabelDotActive,
                ]}
              />
              <AppText
                variant="caption"
                color={item === bias ? colors.text : colors.textTertiary}
                style={styles.biasLabelText}
              >
                {biasMeta[item].title[lang]}
              </AppText>
            </Pressable>
          ))}
        </View>
      </Section>

      <Section label={t("settings.bias.example")}>
        <View style={styles.biasExample}>
          <AppText style={styles.biasExampleIcon}>🍔</AppText>
          <AppText variant="body" style={styles.flexText}>
            {meta.example[lang]}
          </AppText>
        </View>
      </Section>
    </PageSheet>
  );
}

function WeightControlSheet({
  visible,
  onClose,
  onDismiss,
  onOpenRegisterWeight,
}: {
  visible: boolean;
  onClose: () => void;
  onDismiss?: () => void;
  onOpenRegisterWeight: () => void;
}) {
  const colors = useColors();
  const lang = getLang();
  const profile =
    useAppStore((s) => s.onboardingProfile) ?? defaultOnboardingProfile();
  const updatedLabel = formatDate(todayISO(), lang);

  const registerButton = (
    <View pointerEvents="box-none" style={styles.weightSticky}>
      <Pressable
        onPress={onOpenRegisterWeight}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.primaryAction,
          styles.weightStickyButton,
          { backgroundColor: TINT.purple },
          pressed && styles.pressed,
        ]}
      >
        <AppIcon name="plus" color="#FFFFFF" size={24} />
        <AppText variant="heading" color="#FFFFFF">
          Registrar peso
        </AppText>
      </Pressable>
    </View>
  );

  return (
    <SheetFrame
      visible={visible}
      title="Controle de peso"
      onClose={onClose}
      onDismiss={onDismiss}
      centerTitle
      contentBottomInset={112}
      overlay={registerButton}
      size="full"
    >
      <View style={styles.weightHero}>
        <AppText variant="metric" style={styles.weightHeroValue}>
          {formatWeight(profile.weightKg)}
        </AppText>
        <AppText variant="secondary" color={colors.textSecondary}>
          {`Last updated ${updatedLabel}`}
        </AppText>
      </View>

      <AppText variant="heading" color={colors.textSecondary}>
        History
      </AppText>
      <WeightChart weightKg={profile.weightKg} />

      <Section label="Statistics">
        <SettingsRow
          title="30-Day Change"
          trailing={
            <AppText variant="body" color={colors.textTertiary}>
              --
            </AppText>
          }
        />
        <Divider />
        <SettingsRow
          title="90-Day Change"
          trailing={
            <AppText variant="body" color={colors.textTertiary}>
              --
            </AppText>
          }
        />
        <Divider />
        <SettingsRow
          title="Lowest"
          trailing={
            <AppText variant="body" color={colors.success}>
              {formatWeight(profile.weightKg)}
            </AppText>
          }
        />
        <Divider />
        <SettingsRow
          title="Highest"
          trailing={
            <AppText variant="body" color={colors.calories}>
              {formatWeight(profile.weightKg)}
            </AppText>
          }
        />
      </Section>

      <Section label="Meta">
        <SettingsRow
          icon="target"
          iconColor={TINT.blue}
          title={`Target: ${formatWeight(profile.goalWeightKg)}`}
          subtitle={`${(profile.goalWeightKg - profile.weightKg).toFixed(1)} kg to go`}
        />
      </Section>

      <Section label="All Entries">
        {[0, 1].map((item) => (
          <View key={item}>
            {item > 0 ? <Divider /> : null}
            <SettingsRow
              title={formatDate(todayISO(), lang)}
              subtitle={formatWeight(profile.weightKg)}
              trailing={<Chevron />}
              onPress={noop}
            />
          </View>
        ))}
      </Section>
    </SheetFrame>
  );
}

function RegisterWeightSheet({
  visible,
  domain,
  onClose,
}: {
  visible: boolean;
  domain: Domain;
  onClose: () => void;
}) {
  const colors = useColors();
  const lang = getLang();
  const activeModal = useAppModalStore((s) => s.stack.at(-1));
  const openAppModal = useAppModalStore((s) => s.openAppModal);
  const closeAppModal = useAppModalStore((s) => s.closeAppModal);
  const profile =
    useAppStore((s) => s.onboardingProfile) ?? defaultOnboardingProfile();
  const updateProfile = useAppStore((s) => s.updateOnboardingProfile);
  const [weightKg, setWeightKg] = useState(profile.weightKg);
  const [notes, setNotes] = useState("");
  const weightPickerOpen = activeModal?.id === "settings.registerWeightPicker";

  useEffect(() => {
    if (!visible) return;
    setWeightKg(profile.weightKg);
    setNotes("");
  }, [profile.weightKg, visible]);

  const save = async () => {
    await updateProfile({ weightKg });
    onClose();
  };
  const openWeightPicker = () => {
    if (
      !canOpenAppModal(
        "settings.registerWeight",
        "settings.registerWeightPicker",
      )
    )
      return;
    openAppModal({ id: "settings.registerWeightPicker", domain });
  };

  return (
    <PageSheet
      visible={visible}
      title="Registrar peso"
      onClose={onClose}
      contentBottomInset={Spacing.eight}
      keyboardAwareScroll
      overlay={
        <PickerSheet
          lang={lang}
          text={copy[lang]}
          picker={weightPickerOpen ? "weight" : null}
          profile={{ ...profile, weightKg }}
          presentation="overlay"
          onClose={() => closeAppModal("settings.registerWeightPicker")}
          onPick={(kind, value) => {
            if (kind === "weight" && typeof value === "number") {
              setWeightKg(value);
            }
            closeAppModal("settings.registerWeightPicker");
          }}
        />
      }
    >
      <View style={styles.formSection}>
        <AppText
          variant="secondary"
          color={colors.textSecondary}
          style={styles.formLabel}
        >
          Peso
        </AppText>
        <Pressable
          onPress={openWeightPicker}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.formRowCard,
            { backgroundColor: colors.backgroundElement },
            pressed && styles.pressed,
          ]}
        >
          <AppText variant="body">{formatWeight(weightKg)}</AppText>
          <Chevron />
        </Pressable>
      </View>

      <View style={styles.formSection}>
        <AppText
          variant="secondary"
          color={colors.textSecondary}
          style={styles.formLabel}
        >
          Date
        </AppText>
        <View
          style={[
            styles.formRowCard,
            { backgroundColor: colors.backgroundElement },
          ]}
        >
          <AppText variant="body">
            {formatDate(todayISO(), lang).replace(".", "")}
          </AppText>
          <Chevron />
        </View>
      </View>

      <View style={styles.formSection}>
        <AppText
          variant="secondary"
          color={colors.textSecondary}
          style={styles.formLabel}
        >
          Notes (optional)
        </AppText>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          multiline
          placeholder="e.g., morning weigh-in, after workout..."
          placeholderTextColor={colors.textTertiary}
          style={[
            styles.formTextArea,
            { backgroundColor: colors.backgroundElement, color: colors.text },
          ]}
        />
      </View>

      <View style={styles.formSection}>
        <AppText
          variant="secondary"
          color={colors.textSecondary}
          style={styles.formLabel}
        >
          Progress Photos (optional)
        </AppText>
        <View
          style={[
            styles.formRowCard,
            { backgroundColor: colors.backgroundElement },
          ]}
        >
          <View style={styles.inlineAction}>
            <AppIcon name="camera" color={colors.textSecondary} size={22} />
            <AppText variant="body">Add Progress Photos</AppText>
          </View>
          <Chevron />
        </View>
      </View>

      <Pressable
        onPress={save}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.primaryAction,
          { backgroundColor: TINT.purple },
          pressed && styles.pressed,
        ]}
      >
        <AppText variant="heading" color="#FFFFFF">
          Save Weight
        </AppText>
      </Pressable>
    </PageSheet>
  );
}

interface SettingsSheetProps {
  visible: boolean;
  domain: Domain;
}

export function SettingsSheet({ visible, domain }: SettingsSheetProps) {
  const colors = useColors();
  useAppStore((s) => s.lang); // re-render strings when language changes
  const modalStack = useAppModalStore((s) => s.stack);
  const openAppModal = useAppModalStore((s) => s.openAppModal);
  const closeAppModal = useAppModalStore((s) => s.closeAppModal);
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const signOut = useAppStore((s) => s.signOut);
  const profile =
    useAppStore((s) => s.onboardingProfile) ?? defaultOnboardingProfile();
  const settingsStack = visible
    ? modalStack.filter(
        (modal) => modal.domain === domain && modal.id.startsWith("settings."),
      )
    : [];
  const activeSettingsId = settingsStack.at(-1)?.id ?? null;
  const hasSettingsModal = (id: string) =>
    settingsStack.some((modal) => modal.id === id);

  const [autoTimezone, setAutoTimezone] = useState(true);
  const [savedMealsCount, setSavedMealsCount] = useState(0);
  const [savedMeals, setSavedMeals] = useState<SavedMeal[]>([]);
  const [savedExercisesCount, setSavedExercisesCount] = useState(0);
  const [savedExercises, setSavedWorkouts] = useState<SavedExercise[]>([]);
  const themeRowRef = useRef<View>(null);
  const [settingsOptionMenu, setSettingsOptionMenu] = useState<"theme" | null>(
    null,
  );
  const [settingsOptionAnchor, setSettingsOptionAnchor] =
    useState<AppModalAnchor | null>(null);
  const showSavedMeals = hasSettingsModal("settings.savedMeals");
  const savedMealDetailModal = [...settingsStack]
    .reverse()
    .find(
      (modal) =>
        modal.id === "settings.savedMealDetails" ||
        modal.id === "settings.savedMealActionMenu" ||
        modal.id === "settings.savedMealAiEdit" ||
        modal.id === "settings.savedMealNutritionEdit",
    );
  const selectedSavedMeal =
    savedMealDetailModal && "mealId" in savedMealDetailModal
      ? (savedMeals.find((meal) => meal.id === savedMealDetailModal.mealId) ??
        null)
      : null;
  const selectedSavedMealEntry = selectedSavedMeal
    ? savedMealToEntry(selectedSavedMeal)
    : null;
  const savedMealDetailVisible =
    selectedSavedMeal !== null &&
    (activeSettingsId === "settings.savedMealDetails" ||
      activeSettingsId === "settings.savedMealActionMenu" ||
      activeSettingsId === "settings.savedMealAiEdit");
  const savedMealNutritionEditVisible =
    selectedSavedMeal !== null &&
    activeSettingsId === "settings.savedMealNutritionEdit";
  const rootVisible =
    activeSettingsId === "settings.root" ||
    activeSettingsId === "settings.savedMeals";
  const nutritionGoalsVisible =
    activeSettingsId === "settings.nutritionGoals" ||
    activeSettingsId === "settings.goalWeightPicker" ||
    activeSettingsId === "settings.goalDatePicker";
  const healthProfileVisible =
    activeSettingsId === "settings.healthProfile" ||
    activeSettingsId === "settings.birthDatePicker" ||
    activeSettingsId === "settings.healthProfilePicker";
  const weightControlVisible = activeSettingsId === "settings.weightControl";
  const registerWeightVisible =
    activeSettingsId === "settings.registerWeight" ||
    activeSettingsId === "settings.registerWeightPicker";
  const estimationBiasVisible = activeSettingsId === "settings.estimationBias";
  const workoutMonitorVisible = activeSettingsId === "settings.workoutMonitor";
  const savedExercisesVisible = activeSettingsId === "settings.savedExercises";
  const apiKeysVisible = activeSettingsId === "settings.apiKeys";
  const routinesVisible = activeSettingsId === "settings.routines";
  const [routineCounts, setRoutineCounts] = useState({ food: 0, workout: 0 });
  // Which domain's routines the sheet shows. Separate from the modal's `domain`,
  // which is the routing key the stack filters on — Settings shows both
  // sections regardless of the tab it was opened from.
  const [routinesDomain, setRoutinesDomain] = useState<Domain>(domain);

  const openRoutines = (target: Domain) => {
    if (!canOpenAppModal("settings.root", "settings.routines")) return;
    setRoutinesDomain(target);
    openAppModal({ id: "settings.routines", domain });
  };
  const apiKeys = useAppStore((s) => s.apiKeys);
  const apiKeysLabel =
    apiKeys.mode === "own"
      ? t("settings.api.usingOwn")
      : t("settings.api.usingManaged");

  useEffect(() => {
    if (!visible) return;
    void SavedMealRepository.count().then(setSavedMealsCount);
    void SavedExerciseRepository.count().then(setSavedExercisesCount);
    void Promise.all([
      SavedRoutineRepository.count("food"),
      SavedRoutineRepository.count("workout"),
    ]).then(([food, workout]) => setRoutineCounts({ food, workout }));
  }, [visible]);

  useEffect(() => {
    if (!rootVisible) {
      setSettingsOptionMenu(null);
      setSettingsOptionAnchor(null);
    }
  }, [rootVisible]);

  const loadSavedMeals = async () => {
    const meals = await SavedMealRepository.all();
    setSavedMeals(meals);
    setSavedMealsCount(meals.length);
  };

  const loadSavedExercises = async () => {
    const workouts = await SavedExerciseRepository.all();
    setSavedWorkouts(workouts);
    setSavedExercisesCount(workouts.length);
  };

  const openSavedMeals = () => {
    if (!canOpenAppModal("settings.root", "settings.savedMeals")) return;
    openAppModal({ id: "settings.savedMeals", domain });
    void loadSavedMeals();
  };

  const openWorkoutMonitor = () => {
    if (!canOpenAppModal("settings.root", "settings.workoutMonitor")) return;
    openAppModal({ id: "settings.workoutMonitor", domain });
  };

  const openSavedExercises = () => {
    if (!canOpenAppModal("settings.root", "settings.savedExercises")) return;
    openAppModal({ id: "settings.savedExercises", domain });
    void loadSavedExercises();
  };

  const openApiKeys = () => {
    if (!canOpenAppModal("settings.root", "settings.apiKeys")) return;
    openAppModal({ id: "settings.apiKeys", domain });
  };

  const closeSettings = () => {
    if (activeSettingsId) closeAppModal(activeSettingsId);
  };

  const openAfterSettingsDismiss = (
    sheet: "nutrition" | "health" | "weight",
  ) => {
    if (sheet === "nutrition") {
      if (!canOpenAppModal("settings.root", "settings.nutritionGoals")) return;
      openAppModal({ id: "settings.nutritionGoals", domain });
    } else if (sheet === "health") {
      if (!canOpenAppModal("settings.root", "settings.healthProfile")) return;
      openAppModal({ id: "settings.healthProfile", domain });
    } else {
      if (!canOpenAppModal("settings.root", "settings.weightControl")) return;
      openAppModal({ id: "settings.weightControl", domain });
    }
  };

  const openHealthFromNutrition = () => {
    if (!canOpenAppModal("settings.nutritionGoals", "settings.healthProfile"))
      return;
    openAppModal({ id: "settings.healthProfile", domain });
  };

  const openRegisterFromWeight = () => {
    if (!canOpenAppModal("settings.weightControl", "settings.registerWeight"))
      return;
    openAppModal({ id: "settings.registerWeight", domain });
  };

  const openEstimationBias = () => {
    if (!canOpenAppModal("settings.root", "settings.estimationBias")) return;
    openAppModal({ id: "settings.estimationBias", domain });
  };

  const closeNutritionGoals = () => {
    closeAppModal("settings.nutritionGoals");
  };

  const closeHealthProfile = () => {
    closeAppModal("settings.healthProfile");
  };

  const closeWeightControl = () => {
    closeAppModal("settings.weightControl");
  };

  const closeRegisterWeight = () => {
    closeAppModal("settings.registerWeight");
  };

  const closeEstimationBias = () => {
    closeAppModal("settings.estimationBias");
  };

  const closeWorkoutMonitor = () => {
    closeAppModal("settings.workoutMonitor");
  };

  const closeSavedExercises = () => {
    closeAppModal("settings.savedExercises");
  };

  const deleteSavedExercise = async (workout: SavedExercise) => {
    await SavedExerciseRepository.delete(workout.id);
    await loadSavedExercises();
  };

  const openSavedMealDetails = (meal: SavedMeal) => {
    if (!canOpenAppModal("settings.savedMeals", "settings.savedMealDetails"))
      return;
    openAppModal({ id: "settings.savedMealDetails", domain, mealId: meal.id });
  };

  const closeSavedMealDetails = () => {
    closeAppModal("settings.savedMealDetails");
  };

  const updateSavedMealState = (meal: SavedMeal) => {
    setSavedMeals((current) =>
      current.map((item) => (item.id === meal.id ? meal : item)),
    );
  };

  const handleSavedMealSaveMeal = async (entry: Entry) => {
    if (!entry.data || !("items" in entry.data)) return;
    await SavedMealRepository.save(
      entry.text,
      entry.data as FoodData,
      entry.media,
    );
    void loadSavedMeals();
  };

  const handleSavedMealDelete = (entry: Entry) => {
    void (async () => {
      await SavedMealRepository.delete(entry.id);
      closeAppModal();
      closeSavedMealDetails();
      await loadSavedMeals();
    })();
  };

  const handleSavedMealSaveNutrition = async (
    entry: Entry,
    text: string,
    data: FoodData,
  ) => {
    const meal = await SavedMealRepository.update(
      entry.id,
      text,
      data,
      entry.media,
    );
    updateSavedMealState(meal);
  };

  const handleSavedMealAiEdit = async (entry: Entry, instruction: string) => {
    if (!entry.data || !("items" in entry.data)) return;
    const locale = getLang();
    const currentFood = foodSchema.parse(entry.data);
    const response = await enrich({
      domain: "food",
      intent: "foodEdit",
      currentFood,
      locale,
      userContext: buildOnboardingPromptContext(
        useAppStore.getState().onboardingProfile,
        locale,
      ),
      text: instruction,
    });
    if (!response.ok) throw new Error(response.error);
    const parsed = foodEditSchema.safeParse(response.data);
    if (!parsed.success) throw new Error("Invalid AI edit response");
    await handleSavedMealSaveNutrition(
      entry,
      parsed.data.description ?? entry.text,
      mergeFoodEdit(currentFood, parsed.data, instruction),
    );
  };

  // Close the sheet, then drop the onboarding flag → RootLayout shows onboarding.
  const handleSignOut = () => {
    closeSettings();
    void signOut();
  };
  const themeOptions: OptionMenuItem<ThemeMode>[] = [
    { value: "system", label: t("theme.system") },
    { value: "light", label: t("theme.light") },
    { value: "dark", label: t("theme.dark") },
  ];
  const toggleThemeMenu = () => {
    if (settingsOptionMenu === "theme") {
      setSettingsOptionMenu(null);
      return;
    }
    measureOptionAnchor(themeRowRef, (anchor) => {
      setSettingsOptionAnchor(anchor);
      setSettingsOptionMenu("theme");
    });
  };
  const selectTheme = (nextTheme: ThemeMode) => {
    void setTheme(nextTheme);
    setSettingsOptionMenu(null);
  };

  return (
    <>
      <SheetFrame
        visible={rootVisible}
        title={
          showSavedMeals ? t("settings.meals.manage") : t("settings.title")
        }
        onClose={closeSettings}
        size="full"
        overlay={
          <OptionMenu
            visible={settingsOptionMenu === "theme"}
            anchor={settingsOptionAnchor}
            selectedValue={theme}
            options={themeOptions}
            onSelect={selectTheme}
            onClose={() => setSettingsOptionMenu(null)}
          />
        }
      >
        {showSavedMeals ? (
          <SavedMealsContent
            meals={savedMeals}
            onSelect={openSavedMealDetails}
          />
        ) : (
          <>
            <AccountCard />

            <Section label={t("settings.section.goals")}>
              <GoalsSummary />
              <Divider />
              <SettingsRow
                title={t("settings.goals.manage")}
                trailing={<Chevron />}
                onPress={() => openAfterSettingsDismiss("nutrition")}
              />
            </Section>

            <Section label={t("settings.section.health")}>
              <SettingsRow
                icon="asterisk"
                iconColor={colors.danger}
                title={`${formatWeight(profile.weightKg)} ${t("settings.health.currentSuffix")}`}
                subtitle={t(`activity.${profile.activity}`)}
                trailing={<Chevron />}
                onPress={noop}
              />
              <Divider />
              <SettingsRow
                title={t("settings.health.manage")}
                trailing={<Chevron />}
                onPress={() => openAfterSettingsDismiss("health")}
              />
            </Section>

            <Section label={t("settings.section.weight")}>
              <SettingsRow
                icon="scale"
                iconColor={TINT.purple}
                title={formatWeight(profile.weightKg)}
                subtitle={t("settings.weight.hint")}
                trailing={<Chevron />}
                onPress={() => openAfterSettingsDismiss("weight")}
              />
            </Section>

            {/* Both sections always: Settings is one screen for the whole app,
                so which tab opened it should not hide half the saved data. */}
            <Section label={t("settings.section.workout")}>
              <SettingsRow
                icon="dumbbell"
                iconColor={colors.accent}
                title={t("settings.workout.monitor")}
                subtitle={t("settings.workout.monitorHint")}
                trailing={<Chevron />}
                onPress={openWorkoutMonitor}
              />
              <Divider />
              <SettingsRow
                icon="bookmark"
                iconColor={colors.water}
                title={t("settings.workout.saved")}
                subtitle={`${savedExercisesCount} ${t("settings.workout.savedCount")}`}
                trailing={<Chevron />}
                onPress={openSavedExercises}
              />
              <Divider />
              <SettingsRow
                icon="calendar"
                iconColor={colors.protein}
                title={t("routine.savedWorkouts")}
                subtitle={`${routineCounts.workout} ${t("routine.savedCount")}`}
                trailing={<Chevron />}
                onPress={() => openRoutines("workout")}
              />
            </Section>

            <Section label={t("settings.section.meals")}>
              <SettingsRow
                icon="utensils"
                iconColor={colors.carbs}
                title={t("settings.meals.manage")}
                subtitle={`${savedMealsCount} ${t("settings.meals.saved")}`}
                trailing={<Chevron />}
                onPress={openSavedMeals}
              />
              <Divider />
              <SettingsRow
                icon="calendar"
                iconColor={colors.protein}
                title={t("routine.savedDiets")}
                subtitle={`${routineCounts.food} ${t("routine.savedCount")}`}
                trailing={<Chevron />}
                onPress={() => openRoutines("food")}
              />
            </Section>

            <Section label={t("settings.section.prefs")}>
              <SettingsRow
                icon="flame"
                iconColor={colors.calories}
                title={t("settings.prefs.bias")}
                subtitle={t(`bias.${profile.estimationBias}`)}
                trailing={<Chevron />}
                onPress={openEstimationBias}
              />
            </Section>

            <Section label={t("settings.section.device")}>
              <View ref={themeRowRef} collapsable={false}>
                <SettingsRow
                  icon="contrast"
                  iconColor={TINT.indigo}
                  title={t("settings.device.appearance")}
                  trailing={<ValueTrailing label={t(`theme.${theme}`)} />}
                  onPress={toggleThemeMenu}
                />
              </View>
              <Divider />
              <SettingsRow
                icon="globe"
                iconColor={TINT.magenta}
                title={t("settings.device.autoTimezone")}
                trailing={
                  <Toggle
                    value={autoTimezone}
                    onValueChange={setAutoTimezone}
                  />
                }
              />
            </Section>

            <Section label={t("settings.section.subscription")}>
              <View style={styles.subRow}>
                <View style={styles.summaryIcon}>
                  <AppIcon name="crown" color={colors.textTertiary} size={20} />
                </View>
                <View style={styles.subText}>
                  <AppText variant="body" style={styles.bold}>
                    {t("settings.sub.none")}
                  </AppText>
                  <AppText variant="secondary" color={colors.textSecondary}>
                    {t("settings.sub.hint")}
                  </AppText>
                </View>
                <Pressable
                  onPress={noop}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.upgrade,
                    pressed && styles.pressed,
                  ]}
                >
                  <AppText variant="label" color={UPGRADE_FG}>
                    {t("settings.sub.upgrade")}
                  </AppText>
                </Pressable>
              </View>
            </Section>

            <Section label={t("settings.section.connect")}>
              <View style={styles.connectTop}>
                <View style={styles.cluster}>
                  {CLUSTER.map((c, i) => (
                    <View
                      key={c}
                      style={[
                        styles.logo,
                        {
                          backgroundColor: c,
                          borderColor: colors.backgroundElement,
                        },
                        i > 0 && styles.logoOverlap,
                      ]}
                    />
                  ))}
                </View>
                <AppText variant="secondary" color={colors.textSecondary}>
                  {t("settings.connect.desc")}
                </AppText>
              </View>
              <Divider />
              <SettingsRow
                title={t("settings.connect.instructions")}
                trailing={<Chevron />}
                onPress={noop}
              />
              <Divider />
              <SettingsRow
                title={t("settings.connect.api")}
                trailing={<ValueTrailing label={apiKeysLabel} />}
                onPress={openApiKeys}
              />
            </Section>

            <View
              style={[
                styles.card,
                { backgroundColor: colors.backgroundElement },
              ]}
            >
              <SettingsRow
                icon="star"
                iconColor={TINT.blue}
                title={t("settings.feedback")}
                trailing={<Chevron />}
                onPress={noop}
              />
            </View>

            <Section label={t("settings.section.legal")}>
              <SettingsRow
                title={t("settings.legal.terms")}
                trailing={<Chevron />}
                onPress={noop}
              />
              <Divider />
              <SettingsRow
                title={t("settings.legal.privacy")}
                trailing={<Chevron />}
                onPress={noop}
              />
            </Section>

            <Pressable
              onPress={handleSignOut}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.signOut,
                { backgroundColor: colors.backgroundElement },
                pressed && styles.pressed,
              ]}
            >
              <AppText variant="body" color={colors.danger} style={styles.bold}>
                {t("settings.signOut")}
              </AppText>
            </Pressable>

            <AppText
              variant="caption"
              color={colors.textTertiary}
              style={styles.version}
            >
              {`GymNotes ${Constants.expoConfig?.version ?? ""}`}
            </AppText>
          </>
        )}
      </SheetFrame>

      <NutritionGoalsSheet
        visible={nutritionGoalsVisible}
        domain={domain}
        onClose={closeNutritionGoals}
        onOpenHealth={openHealthFromNutrition}
      />

      <HealthProfileSheet
        visible={healthProfileVisible}
        domain={domain}
        onClose={closeHealthProfile}
      />

      <WeightControlSheet
        visible={weightControlVisible}
        onClose={closeWeightControl}
        onOpenRegisterWeight={openRegisterFromWeight}
      />

      <RegisterWeightSheet
        visible={registerWeightVisible}
        domain={domain}
        onClose={closeRegisterWeight}
      />

      <EstimationBiasSheet
        visible={estimationBiasVisible}
        onClose={closeEstimationBias}
      />

      <WorkoutMonitorSheet
        visible={workoutMonitorVisible}
        onClose={closeWorkoutMonitor}
      />

      <ApiKeysSheet
        visible={apiKeysVisible}
        onClose={() => closeAppModal("settings.apiKeys")}
      />

      <SavedRoutinesSheet
        visible={routinesVisible}
        domain={routinesDomain}
        onClose={() => closeAppModal("settings.routines")}
      />

      <SheetFrame
        visible={savedExercisesVisible}
        title={t("settings.workout.saved")}
        onClose={closeSavedExercises}
        centerTitle
        size="full"
      >
        <SavedExercisesContent
          workouts={savedExercises}
          onDelete={deleteSavedExercise}
        />
      </SheetFrame>

      <FoodEntryDetailSheet
        visible={savedMealDetailVisible}
        entry={selectedSavedMealEntry}
        modalScope="savedMeal"
        modalDomain={domain}
        onClose={() => closeAppModal()}
        onDelete={handleSavedMealDelete}
        onSaveMeal={handleSavedMealSaveMeal}
        onSaveNutrition={handleSavedMealSaveNutrition}
        onAiEdit={handleSavedMealAiEdit}
        initialMealSaved={selectedSavedMeal !== null}
      />

      {selectedSavedMealEntry?.data &&
      "items" in selectedSavedMealEntry.data ? (
        <FoodNutritionEditSheet
          visible={savedMealNutritionEditVisible}
          text={selectedSavedMealEntry.text}
          data={selectedSavedMealEntry.data as FoodData}
          media={selectedSavedMealEntry.media}
          onClose={() => closeAppModal("settings.savedMealNutritionEdit")}
          onSave={(text, data) =>
            handleSavedMealSaveNutrition(selectedSavedMealEntry, text, data)
          }
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.two,
  },
  sectionLabel: {
    fontSize: 14,
    marginLeft: Spacing.four,
  },
  card: {
    borderRadius: Radii.lg,
    overflow: "hidden",
  },
  optionMenuOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    elevation: 20,
  },
  optionMenu: {
    position: "absolute",
    width: OPTION_MENU_WIDTH,
    borderRadius: OPTION_MENU_RADIUS,
    paddingVertical: Spacing.one,
    overflow: "hidden",
  },
  optionMenuRow: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.four,
    paddingHorizontal: Spacing.five,
  },
  optionMenuCheckSlot: {
    width: 26,
    alignItems: "center",
  },
  optionMenuText: {
    flex: 1,
    fontSize: 19,
    lineHeight: 24,
  },
  emptySavedMeals: {
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.five,
  },
  savedMealRow: {
    minHeight: Metrics.rowMinHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  savedMealImages: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  savedMealSelectIcon: {
    width: 30,
    height: 30,
    borderRadius: Radii.pill,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  savedMealConfirm: {
    width: Metrics.iconButton,
    height: Metrics.iconButton,
    borderRadius: Radii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  savedMealHeaderButton: {
    width: Metrics.iconButton,
    height: Metrics.iconButton,
    borderRadius: Radii.pill,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  savedMealContent: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.one,
  },
  savedMealName: {
    flex: 1,
    minWidth: 0,
  },
  savedMealMetrics: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: Spacing.one,
  },
  savedMealMetricChunk: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.one,
  },
  savedMealMetric: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.half,
  },
  savedMealMetricValue: {
    lineHeight: 16,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: Spacing.four,
  },
  value: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.one,
  },
  accountRow: {
    minHeight: Metrics.rowMinHeight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  accountValue: {
    flexShrink: 1,
    textAlign: "right",
  },
  summary: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  summaryIcon: {
    width: 26,
    alignItems: "center",
  },
  summaryText: {
    flex: 1,
    gap: Spacing.half,
  },
  weight: {
    fontSize: 19,
    fontWeight: "600",
  },
  macroLine: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerIconButton: {
    width: Metrics.iconButton,
    height: Metrics.iconButton,
    borderRadius: Radii.pill,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  flexText: {
    flex: 1,
    minWidth: 0,
  },
  numberUnit: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: Spacing.two,
  },
  metricValueText: {
    fontVariant: ["tabular-nums"],
  },
  disclosureValue: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: Spacing.one,
    maxWidth: 220,
  },
  disclosureText: {
    textAlign: "right",
  },
  tdeeRow: {
    minHeight: 86,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.four,
  },
  tdeeText: {
    flex: 1,
    minWidth: 0,
  },
  inlineAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  preferencesHeader: {
    minHeight: Metrics.rowMinHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  preferencesBody: {
    gap: Spacing.four,
    padding: Spacing.four,
  },
  goalChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.three,
  },
  goalChip: {
    minHeight: 44,
    borderRadius: Radii.pill,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  notesInput: {
    minHeight: 52,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  biasIntro: {
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  biasCard: {
    minHeight: 122,
    borderRadius: Radii.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.four,
    padding: Spacing.five,
  },
  biasDot: {
    width: 30,
    height: 30,
    borderRadius: Radii.pill,
  },
  biasCopy: {
    flex: 1,
    gap: Spacing.two,
  },
  biasSlider: {
    height: 58,
    marginHorizontal: Spacing.four,
    marginTop: Spacing.two,
  },
  biasLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  biasLabelItem: {
    flex: 1,
    alignItems: "center",
    gap: Spacing.one,
  },
  biasLabelDot: {
    width: 10,
    height: 10,
    borderRadius: Radii.pill,
    opacity: 0.7,
  },
  biasLabelDotActive: {
    width: 12,
    height: 12,
    opacity: 1,
  },
  biasLabelText: {
    textAlign: "center",
  },
  biasExample: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  biasExampleIcon: {
    fontSize: 28,
  },
  microHelpHeader: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  microTargetDailyRow: {
    minHeight: Metrics.rowMinHeight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.three,
    paddingLeft: Spacing.four + 26 + Spacing.three,
    paddingRight: Spacing.four,
  },
  microHelpBody: {
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  microHelpMetrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: Spacing.four,
  },
  primaryAction: {
    minHeight: 58,
    borderRadius: Radii.pill,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  healthTdeeCard: {
    padding: Spacing.four,
    gap: Spacing.four,
  },
  healthTdeeTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.four,
  },
  healthTdeeBottom: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: Spacing.four,
  },
  healthTdeeHint: {
    flex: 1,
    textAlign: "right",
  },
  weightHero: {
    alignItems: "center",
    gap: Spacing.two,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
  },
  scaleBadge: {
    width: 58,
    height: 58,
    borderRadius: Radii.md,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.two,
  },
  weightHeroValue: {
    fontSize: 48,
  },
  chartCard: {
    borderRadius: Radii.lg,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.three,
    gap: Spacing.two,
    overflow: "hidden",
  },
  chartTabs: {
    flexDirection: "row",
    gap: Spacing.two,
  },
  chartTab: {
    minWidth: 56,
    height: 42,
    borderRadius: Radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
  chartPlot: {
    height: 230,
    position: "relative",
  },
  chartGridLine: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
  },
  chartYAxis: {
    width: 34,
    fontVariant: ["tabular-nums"],
  },
  chartGrid: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  chartVerticalGrid: {
    position: "absolute",
    top: 12,
    bottom: 22,
    width: StyleSheet.hairlineWidth,
  },
  chartGoalLabel: {
    position: "absolute",
    left: 0,
    top: 94,
  },
  chartGoalDash: {
    position: "absolute",
    left: 48,
    right: 0,
    top: 102,
    borderTopWidth: 2,
    borderStyle: "dashed",
    opacity: 0.65,
  },
  chartLine: {
    position: "absolute",
    left: 78,
    right: 16,
    top: 102,
    height: 4,
    borderRadius: Radii.pill,
  },
  chartDot: {
    position: "absolute",
    top: 98,
    width: 12,
    height: 12,
    borderRadius: Radii.pill,
  },
  chartDotStart: {
    left: 74,
  },
  chartDotEnd: {
    right: 12,
  },
  chartValueLabel: {
    position: "absolute",
    left: 36,
    top: 98,
  },
  weightSticky: {
    position: "absolute",
    left: Spacing.four,
    right: Spacing.four,
    bottom: Spacing.five,
  },
  weightStickyButton: {
    shadowColor: TINT.purple,
    shadowOpacity: 0.55,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  formSection: {
    gap: Spacing.two,
  },
  formLabel: {
    marginLeft: Spacing.one,
    fontSize: 15,
    fontWeight: "700",
  },
  formRowCard: {
    minHeight: Metrics.rowMinHeight + 8,
    borderRadius: Radii.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  formTextArea: {
    minHeight: 130,
    borderRadius: Radii.lg,
    padding: Spacing.four,
    fontSize: 17,
    textAlignVertical: "top",
  },
  subRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.four,
  },
  subText: {
    flex: 1,
    gap: Spacing.half,
  },
  bold: {
    fontWeight: "700",
  },
  upgrade: {
    backgroundColor: UPGRADE_BG,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: Radii.pill,
  },
  pressed: {
    opacity: 0.6,
  },
  monitorControls: {
    gap: Spacing.two,
  },
  periodRow: {
    flexDirection: "row",
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  periodPill: {
    flex: 1,
    height: 36,
    borderWidth: 1,
    borderRadius: Radii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  monitorStatsCard: {
    flexDirection: "row",
    paddingVertical: Spacing.four,
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
  },
  monitorStat: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    gap: Spacing.one,
  },
  monitorNote: {
    paddingTop: Spacing.one,
  },
  muscleList: {
    gap: Spacing.five,
    padding: Spacing.four,
  },
  muscleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
  },
  muscleRowName: {
    flex: 1,
    minWidth: 0,
  },
  muscleName: {
    width: 96,
  },
  muscleTrack: {
    flex: 1,
    height: 10,
    borderRadius: Radii.pill,
    overflow: "hidden",
  },
  muscleFill: {
    height: "100%",
    borderRadius: Radii.pill,
  },
  muscleSynergist: {
    position: "absolute",
    top: 0,
    bottom: 0,
    borderWidth: 1,
    borderRadius: Radii.pill,
    opacity: 0.55,
  },
  muscleGroupBlock: {
    gap: Spacing.two,
  },
  muscleGroupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    paddingBottom: Spacing.one,
  },
  muscleGroupName: {
    flex: 1,
    minWidth: 0,
  },
  muscleBand: {
    position: "absolute",
    top: 0,
    bottom: 0,
    opacity: 0.9,
  },
  muscleValue: {
    width: 62,
    textAlign: "right",
  },
  muscleDot: {
    width: 10,
    height: 10,
    borderRadius: Radii.pill,
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
  exerciseRight: {
    alignItems: "flex-end",
    gap: Spacing.one,
  },
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
  apiKeyField: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  apiKeyInput: {
    minHeight: 44,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  connectTop: {
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.four,
  },
  cluster: {
    flexDirection: "row",
  },
  logo: {
    width: 36,
    height: 36,
    borderRadius: Radii.pill,
    borderWidth: 2,
  },
  logoOverlap: {
    marginLeft: -8,
  },
  signOut: {
    minHeight: Metrics.rowMinHeight,
    borderRadius: Radii.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  version: {
    textAlign: "center",
  },
});
