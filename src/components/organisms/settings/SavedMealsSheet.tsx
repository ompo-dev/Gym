import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { LoggedPressable } from '@/components/atoms/Logged';

import { AppIcon, type AppIconName } from "@/components/atoms/AppIcon";
import { AppText } from "@/components/atoms/AppText";
import { GlassSurface } from "@/components/atoms/GlassSurface";
import { Spacing } from "@/constants/theme";
import type { Entry, EntryMediaAttachment } from "@/core/types";
import {
  SavedMealRepository,
  type SavedMeal,
} from "@/data/SavedMealRepository";
import { useRepositoryData } from "@/hooks/useRepositoryData";
import { formatWaterMl, sumFoodData } from "@/domains/food";
import { useColors } from "@/hooks/use-colors";
import { t } from "@/i18n";
import { NativeSegmented } from "@/components/molecules/NativeSegmented";
import {
  SavedRoutineRepository,
  type SavedFoodRoutine,
  type SavedRoutine,
} from "@/data/SavedRoutineRepository";

import { DraftStack } from "../FoodMediaDraftTray";
import { SheetFrame } from "../SheetFrame";
import { Chevron, Divider } from "./primitives";
import { SavedRoutinesContent } from "./SavedRoutinesSheet";
import { savedListStyles, settingsStyles } from "./styles";

export function savedMealToEntry(meal: SavedMeal): Entry {
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

export function SavedMealMetric({
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

/** The metric strip under a row title. Exported so the pantry uses this one. */
export function SavedMealMetrics({ children }: { children: React.ReactNode }) {
  return <View style={styles.savedMealMetrics}>{children}</View>;
}

function SavedMealSelectIcon({ selected }: { selected: boolean }) {
  const colors = useColors();
  return (
    <View
      style={[
        savedListStyles.savedMealSelectIcon,
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
    <LoggedPressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={meal.name}
      accessibilityState={selectable ? { selected } : undefined}
      style={({ pressed }) => [pressed && settingsStyles.pressed]}
    >
      <View style={savedListStyles.savedMealRow}>
        {images.length > 0 ? (
          <View style={styles.savedMealImages}>
            <DraftStack drafts={images} size={44} overlap={-44} />
          </View>
        ) : null}

        <View style={savedListStyles.savedMealContent}>
          <AppText
            variant="body"
            numberOfLines={1}
            style={savedListStyles.savedMealName}
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
    </LoggedPressable>
  );
}

export function SavedMealsContent({
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
          settingsStyles.card,
          settingsStyles.emptySavedMeals,
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
    <View
      style={[
        settingsStyles.card,
        { backgroundColor: colors.backgroundElement },
      ]}
    >
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

type DietSavedTab = "meals" | "diets";

export function SavedMealsSheet({
  visible,
  onClose,
  onSelect,
  onSelectFoodRoutines,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (meals: SavedMeal[]) => void;
  onSelectFoodRoutines: (routines: SavedFoodRoutine[]) => void;
}) {
  const colors = useColors();
  const [tab, setTab] = useState<DietSavedTab>("meals");
  const meals = useRepositoryData<SavedMeal[]>(
    () => SavedMealRepository.all(),
    [],
    [visible],
    visible,
  );
  const routines = useRepositoryData<SavedRoutine[]>(
    () => SavedRoutineRepository.byDomain("food"),
    [],
    [visible],
    visible,
  );
  const [selectedMealIds, setSelectedMealIds] = useState<string[]>([]);
  const [selectedRoutineIds, setSelectedRoutineIds] = useState<string[]>([]);

  // Selection and active tab are UI state — they reset when the picker closes.
  useEffect(() => {
    if (!visible) {
      setSelectedMealIds([]);
      setSelectedRoutineIds([]);
      setTab("meals");
    }
  }, [visible]);

  const toggleMeal = (meal: SavedMeal) => {
    setSelectedMealIds((current) =>
      current.includes(meal.id)
        ? current.filter((id) => id !== meal.id)
        : [...current, meal.id],
    );
  };
  const toggleRoutine = (routine: SavedRoutine) => {
    setSelectedRoutineIds((current) =>
      current.includes(routine.id)
        ? current.filter((id) => id !== routine.id)
        : [...current, routine.id],
    );
  };

  // Applies the active tab's selection only — the segmented control decides
  // whether you are picking loose meals or whole saved diets.
  const confirmSelection = () => {
    if (tab === "meals") {
      const selected = meals.filter((meal) => selectedMealIds.includes(meal.id));
      if (selected.length === 0) return;
      onSelect(selected);
      return;
    }
    const selected = routines.filter((routine) =>
      selectedRoutineIds.includes(routine.id),
    ) as SavedFoodRoutine[];
    if (selected.length === 0) return;
    onSelectFoodRoutines(selected);
  };
  const hasSelection =
    tab === "meals" ? selectedMealIds.length > 0 : selectedRoutineIds.length > 0;

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
              { backgroundColor: colors.carbs },
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
            { value: "meals", label: t("saved.tab.meals") },
            { value: "diets", label: t("saved.tab.diets") },
          ]}
          value={tab}
          onChange={setTab}
          accessibilityLabel={t("saved.title")}
        />
      </View>
      {tab === "meals" ? (
        <SavedMealsContent
          meals={meals}
          onSelect={toggleMeal}
          selectable
          selectedIds={selectedMealIds}
        />
      ) : (
        <SavedRoutinesContent
          routines={routines}
          domain="food"
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
  savedMealImages: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  savedMealMetric: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.half,
  },
  savedMealMetricChunk: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.one,
  },
  savedMealMetricValue: {
    lineHeight: 16,
  },
  savedMealMetrics: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: Spacing.one,
  },
});
