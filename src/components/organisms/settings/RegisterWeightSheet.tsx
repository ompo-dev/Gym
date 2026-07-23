import { useEffect, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { LoggedPressable } from '@/components/atoms/Logged';

import { AppIcon } from "@/components/atoms/AppIcon";
import { AppText } from "@/components/atoms/AppText";
import { copy } from "@/components/onboarding/onboardingContent";
import { PickerSheet } from "@/components/onboarding/onboardingControls";
import { formatDate } from "@/components/onboarding/onboardingUtils";
import { Metrics, Radii, Spacing } from "@/constants/theme";
import { canOpenAppModal } from "@/core/appModals";
import { todayISO } from "@/core/date";
import { defaultOnboardingProfile } from "@/core/onboarding";
import type { Domain } from "@/core/types";
import { useColors } from "@/hooks/use-colors";
import { getLang } from "@/i18n";
import { useAppModalStore } from "@/store/useAppModalStore";
import { useAppStore } from "@/store/useAppStore";

import { Chevron, formatWeight, PageSheet, TINT } from "./primitives";
import { settingsStyles } from "./styles";

export function RegisterWeightSheet({
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
        <LoggedPressable
          onPress={openWeightPicker}
          accessibilityRole="button"
          accessibilityLabel={`Peso: ${formatWeight(weightKg)}`}
          style={({ pressed }) => [
            styles.formRowCard,
            { backgroundColor: colors.backgroundElement },
            pressed && settingsStyles.pressed,
          ]}
        >
          <AppText variant="body">{formatWeight(weightKg)}</AppText>
          <Chevron />
        </LoggedPressable>
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
          <View style={settingsStyles.inlineAction}>
            <AppIcon name="camera" color={colors.textSecondary} size={22} />
            <AppText variant="body">Add Progress Photos</AppText>
          </View>
          <Chevron />
        </View>
      </View>

      <LoggedPressable
        onPress={save}
        accessibilityRole="button"
        accessibilityLabel="Save Weight"
        style={({ pressed }) => [
          settingsStyles.primaryAction,
          { backgroundColor: TINT.purple },
          pressed && settingsStyles.pressed,
        ]}
      >
        <AppText variant="heading" color="#FFFFFF">
          Save Weight
        </AppText>
      </LoggedPressable>
    </PageSheet>
  );
}

const styles = StyleSheet.create({
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
  formSection: {
    gap: Spacing.two,
  },
  formTextArea: {
    minHeight: 130,
    borderRadius: Radii.lg,
    padding: Spacing.four,
    fontSize: 17,
    textAlignVertical: "top",
  },
});
