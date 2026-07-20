import { Pressable, StyleSheet, View } from "react-native";

import { AppIcon } from "@/components/atoms/AppIcon";
import { AppText } from "@/components/atoms/AppText";
import { SettingsRow } from "@/components/molecules/SettingsRow";
import { formatDate } from "@/components/onboarding/onboardingUtils";
import { Radii, Spacing } from "@/constants/theme";
import { todayISO } from "@/core/date";
import { defaultOnboardingProfile } from "@/core/onboarding";
import { useColors } from "@/hooks/use-colors";
import { getLang } from "@/i18n";
import { useAppStore } from "@/store/useAppStore";

import { SheetFrame } from "../SheetFrame";
import { Chevron, Divider, Section, TINT, formatWeight, noop } from "./primitives";
import { settingsStyles } from "./styles";

function WeightChart({ weightKg }: { weightKg: number }) {
  const colors = useColors();
  return (
    <View
      style={[
        settingsStyles.chartCard,
        { backgroundColor: colors.backgroundElement },
      ]}
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

export function WeightControlSheet({
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
          settingsStyles.primaryAction,
          styles.weightStickyButton,
          { backgroundColor: TINT.purple },
          pressed && settingsStyles.pressed,
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

const styles = StyleSheet.create({
  chartDot: {
    position: "absolute",
    top: 98,
    width: 12,
    height: 12,
    borderRadius: Radii.pill,
  },
  chartDotEnd: {
    right: 12,
  },
  chartDotStart: {
    left: 74,
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
  chartGoalLabel: {
    position: "absolute",
    left: 0,
    top: 94,
  },
  chartGrid: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  chartGridLine: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
  },
  chartLine: {
    position: "absolute",
    left: 78,
    right: 16,
    top: 102,
    height: 4,
    borderRadius: Radii.pill,
  },
  chartPlot: {
    height: 230,
    position: "relative",
  },
  chartTab: {
    minWidth: 56,
    height: 42,
    borderRadius: Radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
  chartTabs: {
    flexDirection: "row",
    gap: Spacing.two,
  },
  chartValueLabel: {
    position: "absolute",
    left: 36,
    top: 98,
  },
  chartVerticalGrid: {
    position: "absolute",
    top: 12,
    bottom: 22,
    width: StyleSheet.hairlineWidth,
  },
  chartYAxis: {
    width: 34,
    fontVariant: ["tabular-nums"],
  },
  weightHero: {
    alignItems: "center",
    gap: Spacing.two,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
  },
  weightHeroValue: {
    fontSize: 48,
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
});
