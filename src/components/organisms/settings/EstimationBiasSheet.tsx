import Slider from "@react-native-community/slider";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/components/atoms/AppText";
import {
  BIAS_DOT_COLORS,
  biasMeta,
} from "@/components/onboarding/onboardingContent";
import { Radii, Spacing } from "@/constants/theme";
import {
  defaultOnboardingProfile,
  type OnboardingBias,
} from "@/core/onboarding";
import { useColors } from "@/hooks/use-colors";
import { getLang, t } from "@/i18n";
import { useAppStore } from "@/store/useAppStore";

import { PageSheet, Section } from "./primitives";
import { settingsStyles } from "./styles";

const BIAS_VALUES = [
  0, 1, 2, 3, 4,
] as const satisfies readonly OnboardingBias[];

export function EstimationBiasSheet({
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
          <AppText variant="body" style={settingsStyles.flexText}>
            {meta.example[lang]}
          </AppText>
        </View>
      </Section>
    </PageSheet>
  );
}

const styles = StyleSheet.create({
  biasCard: {
    minHeight: 122,
    borderRadius: Radii.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.four,
    padding: Spacing.five,
  },
  biasCopy: {
    flex: 1,
    gap: Spacing.two,
  },
  biasDot: {
    width: 30,
    height: 30,
    borderRadius: Radii.pill,
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
  biasIntro: {
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
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
  biasLabelItem: {
    flex: 1,
    alignItems: "center",
    gap: Spacing.one,
  },
  biasLabelText: {
    textAlign: "center",
  },
  biasLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  biasSlider: {
    height: 58,
    marginHorizontal: Spacing.four,
    marginTop: Spacing.two,
  },
});
