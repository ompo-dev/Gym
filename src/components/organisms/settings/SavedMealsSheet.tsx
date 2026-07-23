import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { AppIcon, type AppIconName } from "@/components/atoms/AppIcon";
import { AppText } from "@/components/atoms/AppText";
import { GlassSurface } from "@/components/atoms/GlassSurface";
import { Spacing } from "@/constants/theme";
import type { Entry, EntryMediaAttachment } from "@/core/types";
import {
  SavedMealRepository,
  type SavedMeal,
} from "@/data/SavedMealRepository";
import { formatWaterMl, sumFoodData } from "@/domains/food";
import { useColors } from "@/hooks/use-colors";
import { t } from "@/i18n";

import { DraftStack } from "../FoodMediaDraftTray";
import { SheetFrame } from "../SheetFrame";
import { Chevron, Divider } from "./primitives";
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
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
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
    </Pressable>
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
              style={savedListStyles.savedMealHeaderButton}
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
              savedListStyles.savedMealConfirm,
              { backgroundColor: colors.carbs },
              pressed && settingsStyles.pressed,
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

const styles = StyleSheet.create({
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
