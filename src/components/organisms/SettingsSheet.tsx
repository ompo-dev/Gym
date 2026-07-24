import Constants from "expo-constants";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { LoggedPressable } from '@/components/atoms/Logged';

import { AppIcon } from "@/components/atoms/AppIcon";
import { AppText } from "@/components/atoms/AppText";
import { SettingsRow } from "@/components/molecules/SettingsRow";
import { Metrics, Radii, Spacing } from "@/constants/theme";
import {
  canOpenAppModal,
  type AppModal,
  type AppModalAnchor,
} from "@/core/appModals";
import { enrich } from "@/core/enrich/client";
import {
  buildOnboardingPromptContext,
  defaultOnboardingProfile,
} from "@/core/onboarding";
import type { Domain, Entry } from "@/core/types";
import {
  SavedExerciseRepository,
  type SavedExercise,
} from "@/data/SavedExerciseRepository";
import {
  SavedMealRepository,
  type SavedMeal,
} from "@/data/SavedMealRepository";
import { SavedRoutineRepository } from "@/data/SavedRoutineRepository";
import { mergeFoodEdit } from "@/domains/food";
import { foodEditSchema, foodSchema, type FoodData } from "@/domains/schemas";
import { useColors } from "@/hooks/use-colors";
import { getLang, t } from "@/i18n";
import { useAppModalStore } from "@/store/useAppModalStore";
import { useAppStore, type ThemeMode } from "@/store/useAppStore";

import { FoodEntryDetailSheet } from "./FoodEntryDetailSheet";
import { FoodNutritionEditSheet } from "./FoodNutritionEditSheet";
import { ApiKeysSheet } from "./settings/ApiKeysSheet";
import { EstimationBiasSheet } from "./settings/EstimationBiasSheet";
import { HealthProfileSheet } from "./settings/HealthProfileSheet";
import { NutritionGoalsSheet } from "./settings/NutritionGoalsSheet";
import {
  Chevron,
  Divider,
  measureOptionAnchor,
  noop,
  OptionMenu,
  Section,
  TINT,
  Toggle,
  ValueTrailing,
  formatWeight,
  type OptionMenuItem,
} from "./settings/primitives";
import { RegisterWeightSheet } from "./settings/RegisterWeightSheet";
import { SavedExercisesContent } from "./settings/SavedExercisesSheet";
import {
  SavedMealsContent,
  savedMealToEntry,
} from "./settings/SavedMealsSheet";
import { PantrySheet } from "./settings/PantrySheet";
import { SavedRoutinesSheet } from "./settings/SavedRoutinesSheet";
import {
  AccountCard,
  CLUSTER,
  GoalsSummary,
  UPGRADE_BG,
  UPGRADE_FG,
} from "./settings/SettingsAccountCards";
import { settingsStyles } from "./settings/styles";
import { WeightControlSheet } from "./settings/WeightControlSheet";
import { WorkoutMonitorSheet } from "./settings/WorkoutMonitorSheet";
import { SheetFrame } from "./SheetFrame";

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
  const eraseAllData = useAppStore((s) => s.eraseAllData);
  const profile =
    useAppStore((s) => s.onboardingProfile) ?? defaultOnboardingProfile();
  const settingsStack = visible
    ? modalStack.filter(
        (modal) => modal.domain === domain && modal.id.startsWith("settings."),
      )
    : [];
  const activeSettingsId = settingsStack.at(-1)?.id ?? null;

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
  const rootVisible = activeSettingsId === "settings.root";
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

  const openPantry = () => {
    if (!canOpenAppModal("settings.root", "settings.pantry")) return;
    openAppModal({ id: "settings.pantry", domain });
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
  // Irreversible and unrecoverable — there is no server copy to restore from,
  // which is exactly why it asks first and names what goes.
  const handleEraseAllData = () => {
    Alert.alert(t("settings.eraseData"), t("settings.eraseData.confirm"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("settings.eraseData.confirmAction"),
        style: "destructive",
        onPress: () => {
          closeSettings();
          void eraseAllData();
        },
      },
    ]);
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

  const settingsBody = (
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
                icon="apple"
                iconColor={colors.protein}
                title={t("pantry.title")}
                trailing={<Chevron />}
                onPress={openPantry}
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
                    label={t("settings.device.autoTimezone")}
                  />
                }
              />
            </Section>

            <Section label={t("settings.section.subscription")}>
              <View style={styles.subRow}>
                <View style={settingsStyles.summaryIcon}>
                  <AppIcon name="crown" color={colors.textTertiary} size={20} />
                </View>
                <View style={styles.subText}>
                  <AppText variant="body" style={settingsStyles.bold}>
                    {t("settings.sub.none")}
                  </AppText>
                  <AppText variant="secondary" color={colors.textSecondary}>
                    {t("settings.sub.hint")}
                  </AppText>
                </View>
                <LoggedPressable
                  onPress={noop}
                  accessibilityRole="button"
                  accessibilityLabel={t("settings.sub.upgrade")}
                  style={({ pressed }) => [
                    styles.upgrade,
                    pressed && settingsStyles.pressed,
                  ]}
                >
                  <AppText variant="label" color={UPGRADE_FG}>
                    {t("settings.sub.upgrade")}
                  </AppText>
                </LoggedPressable>
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
                settingsStyles.card,
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
              <Divider />
              <SettingsRow
                icon="trash"
                iconColor={colors.danger}
                title={t("settings.eraseData")}
                trailing={<Chevron />}
                onPress={handleEraseAllData}
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

            <LoggedPressable
              onPress={handleSignOut}
              accessibilityRole="button"
              accessibilityLabel={t("settings.signOut")}
              style={({ pressed }) => [
                styles.signOut,
                { backgroundColor: colors.backgroundElement },
                pressed && settingsStyles.pressed,
              ]}
            >
              <AppText variant="body" color={colors.danger} style={settingsStyles.bold}>
                {t("settings.signOut")}
              </AppText>
            </LoggedPressable>

            <AppText
              variant="caption"
              color={colors.textTertiary}
              style={styles.version}
            >
              {`GymNotes ${Constants.expoConfig?.version ?? ""}`}
            </AppText>
          </>
  );

  /**
   * One sheet per settings modal on the stack, each rendered *inside* the one
   * below it — the fridge behaviour: opening a row slides a sheet over a parent
   * that stays put instead of swapping it out. RN only stacks Modals nested in
   * each other's view tree, hence `nested` (see `SheetFrame`).
   *
   * `null` = this entry draws no sheet of its own (a picker or menu the sheet
   * below already renders as an overlay); the stack above it belongs to that
   * same sheet.
   */
  const renderSettingsModal = (
    item: AppModal,
    nested: ReactNode,
  ): ReactNode | null => {
    switch (item.id) {
      case "settings.root":
        return (
          <SheetFrame
            visible
            title={t("settings.title")}
            onClose={() => closeAppModal("settings.root")}
            size="full"
            nested={nested}
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
            {settingsBody}
          </SheetFrame>
        );

      case "settings.savedMeals":
        return (
          <SheetFrame
            visible
            title={t("settings.meals.manage")}
            onClose={() => closeAppModal("settings.savedMeals")}
            centerTitle
            size="full"
            nested={nested}
          >
            <SavedMealsContent meals={savedMeals} onSelect={openSavedMealDetails} />
          </SheetFrame>
        );

      case "settings.nutritionGoals":
        return (
          <NutritionGoalsSheet
            visible
            domain={domain}
            onClose={closeNutritionGoals}
            onOpenHealth={openHealthFromNutrition}
            nested={nested}
          />
        );

      case "settings.healthProfile":
        return (
          <HealthProfileSheet
            visible
            domain={domain}
            onClose={closeHealthProfile}
            nested={nested}
          />
        );

      case "settings.weightControl":
        return (
          <WeightControlSheet
            visible
            onClose={closeWeightControl}
            onOpenRegisterWeight={openRegisterFromWeight}
            nested={nested}
          />
        );

      case "settings.registerWeight":
        return (
          <RegisterWeightSheet
            visible
            domain={domain}
            onClose={closeRegisterWeight}
          />
        );

      case "settings.estimationBias":
        return <EstimationBiasSheet visible onClose={closeEstimationBias} />;

      case "settings.workoutMonitor":
        return <WorkoutMonitorSheet visible onClose={closeWorkoutMonitor} />;

      case "settings.pantry":
        return (
          <PantrySheet
            visible
            onClose={() => closeAppModal("settings.pantry")}
          />
        );

      case "settings.apiKeys":
        return (
          <ApiKeysSheet
            visible
            onClose={() => closeAppModal("settings.apiKeys")}
          />
        );

      case "settings.routines":
        return (
          <SavedRoutinesSheet
            visible
            domain={routinesDomain}
            onClose={() => closeAppModal("settings.routines")}
          />
        );

      case "settings.savedExercises":
        return (
          <SheetFrame
            visible
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
        );

      case "settings.savedMealDetails":
        return (
          <FoodEntryDetailSheet
            visible={selectedSavedMealEntry !== null}
            entry={selectedSavedMealEntry}
            modalScope="savedMeal"
            modalDomain={domain}
            onClose={() => closeAppModal("settings.savedMealDetails")}
            onDelete={handleSavedMealDelete}
            onSaveMeal={handleSavedMealSaveMeal}
            onSaveNutrition={handleSavedMealSaveNutrition}
            onAiEdit={handleSavedMealAiEdit}
            initialMealSaved={selectedSavedMeal !== null}
            nested={nested}
          />
        );

      case "settings.savedMealNutritionEdit":
        return selectedSavedMealEntry?.data &&
          "items" in selectedSavedMealEntry.data ? (
          <FoodNutritionEditSheet
            visible
            text={selectedSavedMealEntry.text}
            data={selectedSavedMealEntry.data as FoodData}
            media={selectedSavedMealEntry.media}
            onClose={() => closeAppModal("settings.savedMealNutritionEdit")}
            onSave={(text, data) =>
              handleSavedMealSaveNutrition(selectedSavedMealEntry, text, data)
            }
          />
        ) : null;

      default:
        return null;
    }
  };

  return (
    <>
      {settingsStack.reduceRight<ReactNode>(
        (nested, item) => renderSettingsModal(item, nested) ?? nested,
        null,
      )}
    </>
  );
}


const styles = StyleSheet.create({
  cluster: {
    flexDirection: "row",
  },
  connectTop: {
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.four,
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
  upgrade: {
    backgroundColor: UPGRADE_BG,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: Radii.pill,
  },
  version: {
    textAlign: "center",
  },
});
