import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

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

export function SavedRoutinesSheet({
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
            settingsStyles.card,
            settingsStyles.emptySavedMeals,
            { backgroundColor: colors.backgroundElement },
          ]}
        >
          <AppText variant="body" color={colors.textSecondary}>
            {t("routine.emptySaved")}
          </AppText>
        </View>
      ) : (
        <View
          style={[
            settingsStyles.card,
            { backgroundColor: colors.backgroundElement },
          ]}
        >
          {routines.map((routine, index) => (
            <View key={routine.id}>
              {index > 0 ? <Divider /> : null}
              <View style={savedListStyles.savedMealRow}>
                <View style={settingsStyles.summaryIcon}>
                  <AppIcon
                    name={domain === "food" ? "utensils" : "dumbbell"}
                    color={domain === "food" ? colors.carbs : colors.accent}
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
