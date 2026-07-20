import { StyleSheet, View } from "react-native";

import { AppIcon } from "@/components/atoms/AppIcon";
import { AppText } from "@/components/atoms/AppText";
import { Metrics, Spacing } from "@/constants/theme";
import { defaultOnboardingProfile } from "@/core/onboarding";
import { formatWaterMl } from "@/domains/food";
import { useColors } from "@/hooks/use-colors";
import { useFoodGoals } from "@/hooks/useFoodGoals";
import { t } from "@/i18n";
import { useAppStore } from "@/store/useAppStore";

import { Divider, formatThousands, formatWeight, TINT } from "./primitives";
import { settingsStyles } from "./styles";

const UPGRADE_BG = "#FFC933";
const UPGRADE_FG = "#151312";
// ponytail: placeholder app logos — real brand marks are out of scope for the clone.
const CLUSTER = ["#D97757", "#F5F5F5", "#0B0B0B", "#6C5CE7", "#4285F4"];
// ponytail: static placeholder — the app has no account/auth concept yet.
const ACCOUNT_NAME = "Maicon Pereira Barbosa";
const ACCOUNT_EMAIL = "maiconpb85@gmail.com";

export { CLUSTER, UPGRADE_BG, UPGRADE_FG };

export function AccountCard() {
  const colors = useColors();
  return (
    <View
      style={[settingsStyles.card, { backgroundColor: colors.backgroundElement }]}
    >
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

export function GoalsSummary() {
  const colors = useColors();
  const profile =
    useAppStore((s) => s.onboardingProfile) ?? defaultOnboardingProfile();
  const goals = useFoodGoals();

  return (
    <View style={styles.summary}>
      <View style={settingsStyles.summaryIcon}>
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

const styles = StyleSheet.create({
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
  macroLine: {
    flexDirection: "row",
    alignItems: "center",
  },
  summary: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  summaryText: {
    flex: 1,
    gap: Spacing.half,
  },
  weight: {
    fontSize: 19,
    fontWeight: "600",
  },
});
