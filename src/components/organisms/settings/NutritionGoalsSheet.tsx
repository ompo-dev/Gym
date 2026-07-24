import { useEffect, useRef, useState, type ReactNode } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { LoggedPressable } from '@/components/atoms/Logged';

import { AppIcon, type AppIconName } from "@/components/atoms/AppIcon";
import { AppText } from "@/components/atoms/AppText";
import { SettingsRow } from "@/components/molecules/SettingsRow";
import { copy } from "@/components/onboarding/onboardingContent";
import {
  DatePickerSheet,
  PickerSheet,
} from "@/components/onboarding/onboardingControls";
import { formatDate } from "@/components/onboarding/onboardingUtils";
import { Metrics, Radii, Spacing } from "@/constants/theme";
import { canOpenAppModal, type AppModalAnchor } from "@/core/appModals";
import { addDays, todayISO } from "@/core/date";
import {
  buildOnboardingSummary,
  defaultOnboardingProfile,
  type OnboardingConsideration,
  type OnboardingMicronutrient,
  type OnboardingProfile,
} from "@/core/onboarding";
import type { Domain } from "@/core/types";
import { useColors } from "@/hooks/use-colors";
import { getLang } from "@/i18n";
import { useAppModalStore } from "@/store/useAppModalStore";
import { useAppStore } from "@/store/useAppStore";

import {
  GOAL_TYPE_OPTIONS,
  applyGoalType,
  goalTypeFor,
  goalTypeLabel,
  type GoalType,
} from "./goalProfile";
import {
  DisclosureValue,
  Divider,
  NumberUnit,
  OptionMenu,
  PageSheet,
  Section,
  TINT,
  Toggle,
  ValueTrailing,
  formatThousands,
  formatWeight,
  measureOptionAnchor,
  type OptionMenuItem,
} from "./primitives";
import { SavedMealMetric } from "./SavedMealsSheet";
import { settingsStyles } from "./styles";

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
    icon: "sugar" as const,
    dailyLabel: "Máximo diário",
    dailyUnit: "g",
  },
  {
    key: "fiber" as const,
    label: "Monitorar fibras",
    icon: "apple" as const,
    dailyLabel: "Mínimo diário",
    dailyUnit: "g",
  },
  {
    key: "sodium" as const,
    label: "Monitorar sódio",
    icon: "sodium" as const,
    dailyLabel: "Máximo diário",
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
    <LoggedPressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={option.label}
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.goalChip,
        {
          backgroundColor: selected
            ? colors.backgroundSelected
            : colors.surfaceMuted,
        },
        pressed && settingsStyles.pressed,
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
    </LoggedPressable>
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

export function NutritionGoalsSheet({
  visible,
  domain,
  onClose,
  onDismiss,
  onOpenHealth,
  nested,
}: {
  visible: boolean;
  domain: Domain;
  onClose: () => void;
  onDismiss?: () => void;
  onOpenHealth: () => void;
  /** Sheet stacked on top of this one — see `SheetFrame`'s `nested`. */
  nested?: ReactNode;
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
        nested={nested}
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
                style={settingsStyles.bold}
              >
                TDEE
              </AppText>
              <AppText variant="heading">{`${formatThousands(summary.tdee)} cal/dia`}</AppText>
            </View>
            <LoggedPressable
              onPress={onOpenHealth}
              accessibilityRole="button"
              accessibilityLabel="Editar perfil de saúde"
              style={({ pressed }) => [
                settingsStyles.inlineAction,
                pressed && settingsStyles.pressed,
              ]}
            >
              <AppText
                variant="body"
                color={TINT.purple}
                style={settingsStyles.bold}
              >
                Editar perfil
              </AppText>
              <AppIcon name="chevronRight" color={TINT.purple} size={18} />
            </LoggedPressable>
          </View>
        </Section>

        <Section label="Metas de peso">
          <View ref={goalTypeRowRef} collapsable={false}>
            <SettingsRow
              title="Tipo de meta"
              select={{
                value: goalTypeFor(draft),
                options: goalTypeOptions,
                onSelect: (value) => selectGoalType(value as GoalType),
              }}
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
                label="Definir data-alvo"
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
          style={[
            settingsStyles.card,
            { backgroundColor: colors.backgroundElement },
          ]}
        >
          <LoggedPressable
            onPress={() => setPrefsOpen((current) => !current)}
            accessibilityRole="button"
            accessibilityLabel="Preferências de estilo de vida e dieta"
            accessibilityState={{ expanded: prefsOpen }}
            style={({ pressed }) => [
              styles.preferencesHeader,
              pressed && settingsStyles.pressed,
            ]}
          >
            <AppIcon name="sparkles" color={TINT.purple} size={20} />
            <AppText variant="body" style={settingsStyles.flexText}>
              Preferências de estilo de vida e dieta
            </AppText>
            <AppIcon
              name={prefsOpen ? "chevronUp" : "chevronDown"}
              color={colors.textTertiary}
              size={18}
            />
          </LoggedPressable>
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
            icon="wheat"
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
                iconColor={colors[target.key]}
                title={target.label}
                trailing={
                  <Toggle
                    label={target.label}
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
          <LoggedPressable
            onPress={() => setHelpOpen((current) => !current)}
            accessibilityRole="button"
            accessibilityLabel="Não sabe quais valores colocar aqui?"
            accessibilityState={{ expanded: helpOpen }}
            style={({ pressed }) => [
              styles.microHelpHeader,
              pressed && settingsStyles.pressed,
            ]}
          >
            <AppText
              variant="secondary"
              color={colors.textSecondary}
              style={settingsStyles.flexText}
            >
              Não sabe quais valores colocar aqui?
            </AppText>
            <AppIcon
              name={helpOpen ? "chevronUp" : "chevronDown"}
              color={colors.textTertiary}
              size={18}
            />
          </LoggedPressable>
          {helpOpen ? (
            <View style={styles.microHelpBody}>
              <AppText variant="secondary" color={colors.textSecondary}>
                Para homens adultos como você, metas diárias típicas são:
              </AppText>
              <View style={styles.microHelpMetrics}>
                <SavedMealMetric
                  icon="squareStack"
                  color={colors.sugar}
                  value="Açúcar < 36g"
                />
                <SavedMealMetric
                  icon="apple"
                  color={colors.fiber}
                  value="Fibras 38g"
                />
                <SavedMealMetric
                  icon="asterisk"
                  color={colors.sodium}
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

const styles = StyleSheet.create({
  goalChip: {
    minHeight: 44,
    borderRadius: Radii.pill,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  goalChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.three,
  },
  microHelpBody: {
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  microHelpHeader: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  microHelpMetrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: Spacing.four,
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
  notesInput: {
    minHeight: 52,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  preferencesBody: {
    gap: Spacing.four,
    padding: Spacing.four,
  },
  preferencesHeader: {
    minHeight: Metrics.rowMinHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
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
});
