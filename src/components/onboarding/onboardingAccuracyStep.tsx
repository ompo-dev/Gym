import { Cat, Dumbbell, Eye, Scale } from "lucide-react-native";
import { View } from "react-native";

import { AppText } from "@/components/atoms/AppText";
import { copy } from "./onboardingContent";
import { useOnboardingTheme } from "./onboardingTheme";

export function AccuracyStep({
  lang,
  text,
}: {
  lang: "pt-BR" | "en-US";
  text: (typeof copy)["pt-BR"];
}) {
  const { colors, styles } = useOnboardingTheme();

  const rows =
    lang === "pt-BR"
      ? [
          ["1 banana média", "100", "95"],
          ["2 ovos grandes", "100", "85"],
          ["1 xícara de arroz cozido", "100", "75"],
          ["1 abacate médio", "75", "10"],
        ]
      : [
          ["1 medium banana", "100", "95"],
          ["2 large eggs", "100", "85"],
          ["1 cup cooked rice", "100", "75"],
          ["1 medium avocado", "75", "10"],
        ];

  return (
    <View style={[styles.stepSection, styles.centeredStep]}>
      <View style={styles.accuracyLogos}>
        <View style={[styles.appTile, styles.appTileAmy]}>
          <Cat color={colors.accentSoft} size={34} strokeWidth={1.8} />
        </View>
        <AppText variant="heading" color={colors.textSecondary}>
          vs
        </AppText>
        <View style={styles.appTileStack}>
          <View style={[styles.appTileSmall, styles.appTileMfp]}>
            <Dumbbell color="#FFFFFF" size={26} strokeWidth={2.2} />
          </View>
          <View style={[styles.appTileSmall, styles.appTileLose]}>
            <Scale color="#FFFFFF" size={24} strokeWidth={2.2} />
          </View>
        </View>
      </View>

      <AppText variant="title" style={styles.centerTitle}>
        {text.accuracyTitle}
      </AppText>

      <View style={styles.accuracyCallout}>
        <View style={styles.calloutIcon}>
          <Eye color={colors.accentSoft} size={22} strokeWidth={2.2} />
        </View>
        <AppText variant="heading" style={styles.accuracyCalloutText}>
          {text.accuracyBody}
        </AppText>
        <View style={styles.calloutLink}>
          <AppText
            variant="body"
            color={colors.accentSoft}
            style={styles.calloutLinkText}
          >
            {lang === "pt-BR"
              ? "Leia mais sobre como isso é possível"
              : "Read more about how this is possible"}
          </AppText>
          <AppText variant="heading" color={colors.accentSoft}>
            ›
          </AppText>
        </View>
      </View>

      <View style={styles.dividerTitleRow}>
        <View style={styles.dividerLine} />
        <AppText variant="heading" style={styles.proofTitle}>
          {lang === "pt-BR"
            ? "Temos os dados para provar"
            : "We have the data to prove it"}
        </AppText>
        <View style={styles.dividerLine} />
      </View>

      <View style={styles.scoreRow}>
        <ScoreCard label="GymNotes" score="85" tone="good" />
        <ScoreCard label="MFP" score="62" tone="warm" />
      </View>

      <View style={styles.tableCard}>
        <View style={styles.tableHeader}>
          <AppText variant="caption" color={colors.textSecondary}>
            {lang === "pt-BR" ? "ENTRADA DE TESTE" : "TEST INPUT"}
          </AppText>
          <View style={styles.tableHeaderRight}>
            <AppText variant="caption" color={colors.textSecondary}>
              AMY
            </AppText>
            <AppText variant="caption" color={colors.textSecondary}>
              MFP
            </AppText>
          </View>
        </View>
        {rows.map(([label, gym, generic]) => (
          <View key={label} style={styles.tableRow}>
            <AppText variant="secondary" style={styles.tableLabel}>
              {label}
            </AppText>
            <View style={styles.tableHeaderRight}>
              <Badge tone={scoreTone(gym)} value={gym} />
              <Badge tone={scoreTone(generic)} value={generic} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function ScoreCard({
  label,
  score,
  tone,
}: {
  label: string;
  score: string;
  tone: "good" | "warm";
}) {
  const { colors, styles } = useOnboardingTheme();

  return (
    <View
      style={[
        styles.scoreCard,
        tone === "good" ? styles.scoreGood : styles.scoreWarm,
      ]}
    >
      <AppText variant="secondary" color={colors.textSecondary}>
        {label}
      </AppText>
      <View style={styles.scoreValueRow}>
        <AppText
          variant="metric"
          style={[
            styles.scoreNumber,
            tone === "good" ? styles.goodScore : styles.warmScore,
          ]}
        >
          {score}
        </AppText>
        <AppText variant="body" color={colors.textSecondary}>
          /100
        </AppText>
      </View>
    </View>
  );
}

function scoreTone(value: string): "good" | "neutral" | "bad" {
  const score = Number(value);
  if (score >= 85) return "good";
  if (score >= 70) return "neutral";
  return "bad";
}

function Badge({
  value,
  tone,
}: {
  value: string;
  tone: "good" | "neutral" | "bad";
}) {
  const { styles } = useOnboardingTheme();

  return (
    <View
      style={[
        styles.badge,
        tone === "good"
          ? styles.badgeGood
          : tone === "neutral"
            ? styles.badgeNeutral
            : styles.badgeBad,
      ]}
    >
      <AppText
        variant="caption"
        style={
          tone === "good"
            ? styles.goodScore
            : tone === "neutral"
              ? styles.neutralScore
              : styles.badScore
        }
      >
        {value}
      </AppText>
    </View>
  );
}
