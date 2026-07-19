import Slider from "@react-native-community/slider";
import Constants from "expo-constants";
import type { ReactNode, RefObject } from "react";
import { useEffect, useRef, useState } from "react";
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
import { SettingsRow } from "@/components/molecules/SettingsRow";
import {
  BIAS_DOT_COLORS,
  activityOptions,
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
  SavedMealRepository,
  type SavedMeal,
} from "@/data/SavedMealRepository";
import {
  SavedWorkoutRepository,
  type SavedWorkout,
} from "@/data/SavedWorkoutRepository";
import { formatWaterMl, mergeFoodEdit, sumFoodData } from "@/domains/food";
import { foodEditSchema, foodSchema, type FoodData, type WorkoutData } from "@/domains/schemas";
import {
  formatWorkoutDistance,
  formatWorkoutDuration,
  inferWorkoutKind,
  uniqueWorkoutExerciseNames,
  WORKOUT_METRIC_COLORS,
  workoutConfig,
} from "@/domains/workout";
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
      ? Math.max(
          Spacing.two,
          Math.round(anchor.y + anchor.height - menuHeight),
        )
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

interface WorkoutAggregate {
  name: string;
  sessions: number;
  sets: number;
  volumeKg: number;
  durationSeconds: number;
  distanceMeters: number;
  lastDate: string;
}

function isWorkoutData(data: Entry["data"]): data is WorkoutData {
  return Boolean(data && "sets" in data);
}

function aggregateWorkoutEntries(entries: Entry[]): WorkoutAggregate[] {
  const byExercise = new Map<string, WorkoutAggregate>();

  entries.forEach((entry) => {
    if (entry.status !== "done" || !isWorkoutData(entry.data)) return;
    const exercise = uniqueWorkoutExerciseNames([
      { text: entry.text, data: entry.data },
    ])[0];
    if (!exercise) return;

    const key = exercise.toLocaleLowerCase();
    const current =
      byExercise.get(key) ??
      {
        name: exercise,
        sessions: 0,
        sets: 0,
        volumeKg: 0,
        durationSeconds: 0,
        distanceMeters: 0,
        lastDate: entry.date,
      };
    const totals = workoutConfig.addToTotals(workoutConfig.emptyTotals, entry.data);
    byExercise.set(key, {
      ...current,
      sessions: current.sessions + 1,
      sets: current.sets + totals.sets,
      volumeKg: current.volumeKg + totals.volumeKg,
      durationSeconds: current.durationSeconds + totals.durationSeconds,
      distanceMeters: current.distanceMeters + totals.distanceMeters,
      lastDate: entry.date > current.lastDate ? entry.date : current.lastDate,
    });
  });

  return [...byExercise.values()].sort((a, b) => b.lastDate.localeCompare(a.lastDate));
}

function WorkoutMetricLine({ aggregate }: { aggregate: WorkoutAggregate }) {
  const colors = useColors();
  const metrics = [
    `${aggregate.sessions}x`,
    `${aggregate.sets} ${t("totals.sets")}`,
    aggregate.volumeKg > 0 ? `${Math.round(aggregate.volumeKg)} kg` : "",
    aggregate.durationSeconds > 0 ? formatWorkoutDuration(aggregate.durationSeconds) : "",
    aggregate.distanceMeters > 0 ? formatWorkoutDistance(aggregate.distanceMeters) : "",
  ].filter(Boolean);

  return (
    <SettingsRow
      icon="dumbbell"
      iconColor={colors.accent}
      title={aggregate.name}
      subtitle={metrics.join("  \u00b7  ")}
      trailing={
        <AppText variant="caption" color={colors.textTertiary}>
          {aggregate.lastDate}
        </AppText>
      }
    />
  );
}

function SavedWorkoutRow({
  workout,
  onDelete,
  onPress,
  selectable = false,
  selected = false,
}: {
  workout: SavedWorkout;
  onDelete?: (workout: SavedWorkout) => void;
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
        <AppText variant="caption" color={colors.textSecondary} numberOfLines={2}>
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

function SavedWorkoutsContent({
  workouts,
  onDelete,
  onSelect,
  selectable = false,
  selectedIds = [],
}: {
  workouts: SavedWorkout[];
  onDelete?: (workout: SavedWorkout) => void;
  onSelect?: (workout: SavedWorkout) => void;
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
          <SavedWorkoutRow
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

export function SavedWorkoutsSheet({
  visible,
  onClose,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (workouts: SavedWorkout[]) => void;
}) {
  const colors = useColors();
  const [workouts, setWorkouts] = useState<SavedWorkout[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    if (!visible) {
      setSelectedIds([]);
      return;
    }
    void SavedWorkoutRepository.all().then(setWorkouts);
  }, [visible]);

  const toggleWorkout = (workout: SavedWorkout) => {
    setSelectedIds((current) =>
      current.includes(workout.id)
        ? current.filter((id) => id !== workout.id)
        : [...current, workout.id],
    );
  };

  const confirmSelection = () => {
    const selectedWorkouts = workouts.filter((workout) => selectedIds.includes(workout.id));
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
      <SavedWorkoutsContent
        workouts={workouts}
        onSelect={toggleWorkout}
        selectable
        selectedIds={selectedIds}
      />
    </SheetFrame>
  );
}

function WorkoutMonitorSheet({
  visible,
  onClose,
  onSaveDay,
}: {
  visible: boolean;
  onClose: () => void;
  onSaveDay: () => Promise<void>;
}) {
  const colors = useColors();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [saving, setSaving] = useState(false);
  const doneEntries = entries.filter((entry) => entry.status === "done" && isWorkoutData(entry.data));
  const aggregates = aggregateWorkoutEntries(entries);
  const days = new Set(doneEntries.map((entry) => entry.date)).size;
  const totals = doneEntries.reduce(
    (current, entry) =>
      isWorkoutData(entry.data) ? workoutConfig.addToTotals(current, entry.data) : current,
    workoutConfig.emptyTotals,
  );

  useEffect(() => {
    if (!visible) return;
    void EntryRepository.findAll("workout").then(setEntries);
  }, [visible]);

  const saveDay = async () => {
    setSaving(true);
    try {
      await onSaveDay();
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageSheet visible={visible} title={t("settings.workout.monitor")} onClose={onClose}>
      <Section label={t("settings.workout.summary")}>
        <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
          <SettingsRow title={t("settings.workout.days")} subtitle={`${days}`} />
          <Divider />
          <SettingsRow title={t("totals.sets")} subtitle={`${totals.sets}`} />
          <Divider />
          <SettingsRow title={t("totals.vol")} subtitle={`${Math.round(totals.volumeKg)} kg`} />
          {totals.durationSeconds > 0 ? (
            <>
              <Divider />
              <SettingsRow
                title={t("totals.time")}
                subtitle={formatWorkoutDuration(totals.durationSeconds)}
              />
            </>
          ) : null}
          {totals.distanceMeters > 0 ? (
            <>
              <Divider />
              <SettingsRow
                title={t("totals.dist")}
                subtitle={formatWorkoutDistance(totals.distanceMeters)}
              />
            </>
          ) : null}
        </View>
      </Section>

      <Pressable
        onPress={saveDay}
        disabled={saving}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.primaryAction,
          { backgroundColor: colors.accent },
          pressed && styles.pressed,
        ]}
      >
        <View style={styles.inlineAction}>
          <AppIcon name="bookmark" color="#FFFFFF" size={18} />
          <AppText variant="heading" color="#FFFFFF">
            {saving ? t("details.mealSaved") : t("settings.workout.saveToday")}
          </AppText>
        </View>
      </Pressable>

      <Section label={t("settings.workout.byExercise")}>
        {aggregates.length > 0 ? (
          <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
            {aggregates.map((aggregate, index) => (
              <View key={aggregate.name}>
                {index > 0 ? <Divider /> : null}
                <WorkoutMetricLine aggregate={aggregate} />
              </View>
            ))}
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
              {t("settings.workout.emptyMonitor")}
            </AppText>
          </View>
        )}
      </Section>
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
  const [micros, setMicros] = useState<Record<OnboardingMicronutrient, boolean>>(
    () => draft.micronutrients,
  );
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
  const openProfilePicker = (kind: Extract<PickerKind, "height" | "weight">) => {
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
        <View style={[styles.scaleBadge, { backgroundColor: TINT.purple }]}>
          <AppIcon name="scale" color="#111111" size={28} strokeWidth={2.8} />
        </View>
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
  const workoutDay = useAppStore((s) => s.workout);
  const lang = getLang();
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
  const [savedWorkoutsCount, setSavedWorkoutsCount] = useState(0);
  const [savedWorkouts, setSavedWorkouts] = useState<SavedWorkout[]>([]);
  const themeRowRef = useRef<View>(null);
  const [settingsOptionMenu, setSettingsOptionMenu] = useState<
    "theme" | null
  >(null);
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
  const savedWorkoutsVisible = activeSettingsId === "settings.savedWorkouts";

  useEffect(() => {
    if (!visible) return;
    void SavedMealRepository.count().then(setSavedMealsCount);
    void SavedWorkoutRepository.count().then(setSavedWorkoutsCount);
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

  const loadSavedWorkouts = async () => {
    const workouts = await SavedWorkoutRepository.all();
    setSavedWorkouts(workouts);
    setSavedWorkoutsCount(workouts.length);
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

  const openSavedWorkouts = () => {
    if (!canOpenAppModal("settings.root", "settings.savedWorkouts")) return;
    openAppModal({ id: "settings.savedWorkouts", domain });
    void loadSavedWorkouts();
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

  const closeSavedWorkouts = () => {
    closeAppModal("settings.savedWorkouts");
  };

  const saveWorkoutDay = async () => {
    const exercises = uniqueWorkoutExerciseNames(
      workoutDay.entries
        .filter((entry) => entry.status === "done" && isWorkoutData(entry.data))
        .map((entry) => ({
          text: entry.text,
          data: entry.data as WorkoutData,
        })),
      lang,
    );
    await SavedWorkoutRepository.save(
      "day",
      formatDate(workoutDay.date, lang).replace(".", ""),
      exercises,
      undefined,
      workoutDay.date,
    );
    await loadSavedWorkouts();
  };

  const deleteSavedWorkout = async (workout: SavedWorkout) => {
    await SavedWorkoutRepository.delete(workout.id);
    await loadSavedWorkouts();
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

            {domain === "workout" ? (
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
                  subtitle={`${savedWorkoutsCount} ${t("settings.workout.savedCount")}`}
                  trailing={<Chevron />}
                  onPress={openSavedWorkouts}
                />
              </Section>
            ) : (
              <Section label={t("settings.section.meals")}>
                <SettingsRow
                  icon="utensils"
                  iconColor={colors.carbs}
                  title={t("settings.meals.manage")}
                  subtitle={`${savedMealsCount} ${t("settings.meals.saved")}`}
                  trailing={<Chevron />}
                  onPress={openSavedMeals}
                />
              </Section>
            )}

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
                trailing={
                  <ValueTrailing label={t("settings.connect.apiKeys")} />
                }
                onPress={noop}
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
        onSaveDay={saveWorkoutDay}
      />

      <SheetFrame
        visible={savedWorkoutsVisible}
        title={t("settings.workout.saved")}
        onClose={closeSavedWorkouts}
        centerTitle
        size="full"
      >
        <SavedWorkoutsContent
          workouts={savedWorkouts}
          onDelete={deleteSavedWorkout}
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
    padding: Spacing.four,
    gap: Spacing.three,
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
