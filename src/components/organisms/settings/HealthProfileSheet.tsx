import type { ReactNode, RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, useColorScheme, View } from "react-native";

import { AppIcon } from "@/components/atoms/AppIcon";
import { AppText } from "@/components/atoms/AppText";
import { SettingsRow } from "@/components/molecules/SettingsRow";
import {
  activityOptions,
  copy,
  genderOptions,
} from "@/components/onboarding/onboardingContent";
import {
  DatePickerSheet,
  PickerSheet,
} from "@/components/onboarding/onboardingControls";
import {
  formatDate,
  formatISODate,
  isoToDate,
  type PickerKind,
} from "@/components/onboarding/onboardingUtils";
import {
  IOS_NATIVE_ENABLED,
  SwiftButton,
  SwiftDatePicker,
  SwiftForm,
  SwiftHost,
  SwiftPicker,
  SwiftSection,
  SwiftText,
  swiftPickerStyle,
  swiftTag,
} from "@/components/onboarding/onboardingNative";
import { Spacing } from "@/constants/theme";
import { canOpenAppModal, type AppModalAnchor } from "@/core/appModals";
import {
  buildOnboardingSummary,
  defaultOnboardingProfile,
  type OnboardingProfile,
} from "@/core/onboarding";
import type { Domain } from "@/core/types";
import { useColors } from "@/hooks/use-colors";
import { getLang } from "@/i18n";
import { useAppModalStore } from "@/store/useAppModalStore";
import { useAppStore } from "@/store/useAppStore";

import { activityLabel, genderLabel } from "./goalProfile";
import {
  Divider,
  DisclosureValue,
  formatThousands,
  formatWeight,
  measureOptionAnchor,
  OptionMenu,
  PageSheet,
  Section,
  ValueTrailing,
  type OptionMenuItem,
} from "./primitives";
import { settingsStyles } from "./styles";

export function HealthProfileSheet({
  visible,
  domain,
  onClose,
  onDismiss,
  nested,
}: {
  visible: boolean;
  domain: Domain;
  onClose: () => void;
  onDismiss?: () => void;
  /** Sheet stacked on top of this one — see `SheetFrame`'s `nested`. */
  nested?: ReactNode;
}) {
  const colors = useColors();
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
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
  if (IOS_NATIVE_ENABLED) {
    // Native SwiftUI Form. Birth date / gender / activity are fully inline
    // native; height & weight keep the range-wheel overlay (itself a native
    // SwiftUI BottomSheet on iOS) opened from a Form button.
    return (
      <PageSheet
        visible={visible}
        title="Perfil de saúde"
        onClose={onClose}
        onDismiss={onDismiss}
        onSave={save}
        nested={nested}
        scroll={false}
        overlay={
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
        }
      >
        <SwiftHost style={styles.nativeFormHost} colorScheme={scheme}>
          <SwiftForm>
            <SwiftSection title="Informações básicas">
              <SwiftDatePicker
                title="Data de nascimento"
                selection={isoToDate(draft.birthDate)}
                displayedComponents={["date"]}
                range={{ end: new Date() }}
                onDateChange={(date: Date) =>
                  setDraft((current) => ({ ...current, birthDate: formatISODate(date) }))
                }
              />
              <SwiftPicker
                label="Gênero"
                selection={draft.gender}
                onSelectionChange={(value: string) =>
                  selectGender(value as OnboardingProfile["gender"])
                }
                modifiers={[swiftPickerStyle("menu")]}
              >
                {genderMenuOptions.map((option) => (
                  <SwiftText key={option.value} modifiers={[swiftTag(option.value)]}>
                    {option.label}
                  </SwiftText>
                ))}
              </SwiftPicker>
              <SwiftButton
                label={`Altura — ${draft.heightCm} cm`}
                onPress={() => openProfilePicker("height")}
              />
              <SwiftButton
                label={`Peso atual — ${formatWeight(draft.weightKg)}`}
                onPress={() => openProfilePicker("weight")}
              />
            </SwiftSection>

            <SwiftSection title="Atividade">
              <SwiftPicker
                label="Nível de atividade"
                selection={draft.activity}
                onSelectionChange={(value: string) =>
                  selectActivity(value as OnboardingProfile["activity"])
                }
                modifiers={[swiftPickerStyle("menu")]}
              >
                {activityMenuOptions.map((option) => (
                  <SwiftText key={option.value} modifiers={[swiftTag(option.value)]}>
                    {option.label}
                  </SwiftText>
                ))}
              </SwiftPicker>
            </SwiftSection>

            <SwiftSection title="Gasto diário estimado">
              <SwiftText>{`Seu TDEE: ${formatThousands(summary.tdee)} cal/dia`}</SwiftText>
              <SwiftText>{`Taxa metabólica basal: ${formatThousands(summary.bmr)} cal`}</SwiftText>
            </SwiftSection>
          </SwiftForm>
        </SwiftHost>
      </PageSheet>
    );
  }

  return (
    <PageSheet
      visible={visible}
      title="Perfil de saúde"
      onClose={onClose}
      onDismiss={onDismiss}
      onSave={save}
      nested={nested}
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
                style={settingsStyles.bold}
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

const styles = StyleSheet.create({
  nativeFormHost: {
    flex: 1,
  },
  healthTdeeBottom: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: Spacing.four,
  },
  healthTdeeCard: {
    padding: Spacing.four,
    gap: Spacing.four,
  },
  healthTdeeHint: {
    flex: 1,
    textAlign: "right",
  },
  healthTdeeTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.four,
  },
});
