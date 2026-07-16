import {
  Apple,
  Cat,
  ChartNoAxesColumn,
  CircleHelp,
  Droplet,
  Fish,
  Flame,
  FlaskConical,
  GlassWater,
  Sparkles,
} from "lucide-react-native";
import { type ReactNode } from "react";
import { Pressable, Switch, View } from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";

import { AppText } from "@/components/atoms/AppText";
import { Colors } from "@/constants/theme";
import {
  buildOnboardingSummary,
  type OnboardingProfile,
} from "@/core/onboarding";
import { formatWaterMl } from "@/domains/food";
import { copy } from "./onboardingContent";
import {
  IOS_NATIVE_ENABLED,
  SwiftHost,
  SwiftToggle,
  swiftLabelsHidden,
  swiftTint,
  swiftToggleStyle,
} from "./onboardingNative";
import { useOnboardingTheme } from "./onboardingTheme";
import { goalMonthLabels, valueY } from "./onboardingUtils";

function TitleBlock({ title }: { title: string }) {
  const { styles } = useOnboardingTheme();

  return (
    <View style={styles.titleBlock}>
      <AppText variant="title" style={styles.stepTitle}>
        {title}
      </AppText>
    </View>
  );
}

export function GoalsStep({
  lang,
  text,
  profile,
  summary,
  onToggleMicros,
}: {
  lang: "pt-BR" | "en-US";
  text: (typeof copy)["pt-BR"];
  profile: OnboardingProfile;
  summary: ReturnType<typeof buildOnboardingSummary>;
  onToggleMicros: (value: boolean) => void;
}) {
  const { colors, styles } = useOnboardingTheme();
  const foodColors = Colors[colors.scheme];

  const monthLabels = goalMonthLabels(profile.goalDate, lang);

  return (
    <View style={styles.stepSection}>
      <TitleBlock title={text.goalsTitle} />

      <View style={styles.summaryCard}>
        <View style={styles.summaryHeader}>
          <View>
            <AppText variant="secondary" color={colors.textSecondary}>
              {lang === "pt-BR" ? "Hoje" : "Today"}
            </AppText>
            <AppText variant="heading">
              {profile.weightKg.toFixed(1)} kg
            </AppText>
          </View>
          <View style={styles.summaryArrow}>
            <AppText variant="heading" color={colors.accentSoft}>
              {"\u2192"}
            </AppText>
          </View>
          <View>
            <AppText variant="secondary" color={colors.textSecondary}>
              {lang === "pt-BR" ? "Meta (3 meses)" : "Target (3 months)"}
            </AppText>
            <View style={styles.goalTargetRow}>
              <AppText variant="heading" color={colors.accentSoft}>
                {profile.goalWeightKg.toFixed(1)} kg
              </AppText>
              <AppText variant="secondary" color="#52FF91">
                ({(profile.goalWeightKg - profile.weightKg).toFixed(1)} kg)
              </AppText>
            </View>
          </View>
        </View>

        <GoalChart
          current={profile.weightKg}
          goal={profile.goalWeightKg}
          labels={monthLabels}
        />
      </View>

      <View style={styles.summaryCard}>
        <MetricRow
          icon={<Flame color={foodColors.calories} size={20} strokeWidth={2.4} />}
          label={lang === "pt-BR" ? "Calorias diárias" : "Daily calories"}
          value={`${summary.calories} cal`}
        />
        <MetricRow
          icon={<Fish color={foodColors.protein} size={20} strokeWidth={2.4} />}
          label={lang === "pt-BR" ? "Meta de proteína" : "Protein target"}
          value={`${summary.protein}g`}
        />
        <MetricRow
          icon={<Apple color={foodColors.carbs} size={20} strokeWidth={2.4} />}
          label={lang === "pt-BR" ? "Meta de carboidratos" : "Carb target"}
          value={`${summary.carbs}g`}
        />
        <MetricRow
          icon={<Droplet color={foodColors.fat} size={20} strokeWidth={2.4} />}
          label={lang === "pt-BR" ? "Meta de gordura" : "Fat target"}
          value={`${summary.fat}g`}
        />
        <MetricRow
          icon={<GlassWater color={foodColors.water} size={20} strokeWidth={2.4} />}
          label={lang === "pt-BR" ? "Meta de hidratacao" : "Hydration target"}
          value={formatWaterMl(summary.waterMl)}
        />
      </View>

      <Pressable style={styles.linkButton}>
        <Sparkles color={colors.accentSoft} size={18} strokeWidth={2} />
        <AppText variant="body" color={colors.accentSoft}>
          {text.personalize}
        </AppText>
      </Pressable>

      <View style={styles.switchCard}>
        <View style={styles.switchLabelWrap}>
          <FlaskConical color="#34D6FF" size={22} strokeWidth={2} />
          <View style={styles.switchTextWrap}>
            <AppText variant="body">{text.micros}</AppText>
            <AppText variant="secondary" color={colors.textSecondary}>
              {lang === "pt-BR"
                ? "Opcional, mas útil para vitaminas e minerais."
                : "Optional, but useful for vitamins and minerals."}
            </AppText>
          </View>
        </View>
        {IOS_NATIVE_ENABLED ? (
          <SwiftHost matchContents colorScheme={colors.scheme}>
            <SwiftToggle
              isOn={profile.trackMicronutrients}
              onIsOnChange={onToggleMicros}
              label=""
              modifiers={[
                swiftLabelsHidden(),
                swiftToggleStyle("switch"),
                swiftTint(colors.accent),
              ]}
            />
          </SwiftHost>
        ) : (
          <Switch
            value={profile.trackMicronutrients}
            onValueChange={onToggleMicros}
            trackColor={{ false: colors.segmented, true: colors.accent }}
            thumbColor={colors.primaryText}
          />
        )}
      </View>

      <AppText variant="body" color={colors.textSecondary}>
        {text.metabolism}
      </AppText>

      <View style={styles.metabolismBlock}>
        <View style={styles.metabolismIconBlock}>
          <ChartNoAxesColumn color="#33A9FF" size={24} strokeWidth={2.2} />
        </View>
        <View style={styles.metabolismStats}>
          <View style={styles.metabolismStat}>
            <View style={styles.statLabelRow}>
              <AppText variant="label" color="#33A9FF">
                BMR
              </AppText>
              <CircleHelp color="#225D88" size={12} strokeWidth={2.2} />
            </View>
            <AppText variant="heading" style={styles.compactHeading}>
              {summary.bmr.toLocaleString(lang)} cal
            </AppText>
            <AppText variant="caption" color={colors.textSecondary}>
              {lang === "pt-BR" ? "Calorias em repouso" : "Resting energy"}
            </AppText>
          </View>
          <View style={styles.metabolismStat}>
            <View style={styles.statLabelRow}>
              <AppText variant="label" color="#33A9FF">
                TDEE
              </AppText>
              <CircleHelp color="#225D88" size={12} strokeWidth={2.2} />
            </View>
            <AppText variant="heading" style={styles.compactHeading}>
              {summary.tdee.toLocaleString(lang)} cal
            </AppText>
            <AppText variant="caption" color={colors.textSecondary}>
              {lang === "pt-BR" ? "Gasto diário total" : "Daily expenditure"}
            </AppText>
          </View>
        </View>
      </View>

      <View style={styles.reasoningCard}>
        <View style={styles.reasoningTitleRow}>
          <Cat color={colors.textSecondary} size={24} strokeWidth={1.8} />
          <AppText variant="heading">
            {lang === "pt-BR" ? "Raciocínio do GymNotes" : "GymNotes reasoning"}
          </AppText>
        </View>
        <AppText
          variant="body"
          color={colors.textSecondary}
          style={styles.reasoningText}
        >
          {lang === "pt-BR"
            ? `Com base no seu perfil, estimamos cerca de ${summary.tdee.toLocaleString(lang)} calorias para manter o peso. Como sua meta é ${profile.goalWeightKg.toFixed(1)} kg, sugerimos ${summary.calories.toLocaleString(lang)} calorias por dia, com proteína alta para preservar massa magra.`
            : `Based on your profile, we estimate about ${summary.tdee.toLocaleString(lang)} calories to maintain your weight. Since your target is ${profile.goalWeightKg.toFixed(1)} kg, we suggest ${summary.calories.toLocaleString(lang)} calories per day with higher protein to protect lean mass.`}
        </AppText>
      </View>
    </View>
  );
}

function GoalChart({
  current,
  goal,
  labels,
}: {
  current: number;
  goal: number;
  labels: string[];
}) {
  const { colors, styles } = useOnboardingTheme();

  const width = 320;
  const height = 190;
  const left = 32;
  const bottom = 26;
  const top = 12;
  const right = 18;
  const max = Math.ceil(Math.max(current, goal) + 2);
  const min = Math.floor(Math.min(current, goal) - 1);
  const span = Math.max(1, max - min);
  const points = [
    { x: left, y: valueY(current, min, span, height, top, bottom) },
    {
      x: left + 78,
      y: valueY(
        current - (current - goal) * 0.58,
        min,
        span,
        height,
        top,
        bottom,
      ),
    },
    {
      x: left + 184,
      y: valueY(
        current - (current - goal) * 0.87,
        min,
        span,
        height,
        top,
        bottom,
      ),
    },
    { x: width - right, y: valueY(goal, min, span, height, top, bottom) },
  ];
  const areaPath = `M ${points[0].x} ${height - bottom} L ${points[0].x} ${points[0].y} C ${points[1].x - 22} ${points[0].y + 18}, ${points[1].x - 8} ${points[1].y}, ${points[1].x} ${points[1].y} S ${points[2].x - 22} ${points[2].y + 6}, ${points[2].x} ${points[2].y} S ${points[3].x - 24} ${points[3].y + 3}, ${points[3].x} ${points[3].y} L ${points[3].x} ${height - bottom} Z`;
  const linePath = `M ${points[0].x} ${points[0].y} C ${points[1].x - 22} ${points[0].y + 18}, ${points[1].x - 8} ${points[1].y}, ${points[1].x} ${points[1].y} S ${points[2].x - 22} ${points[2].y + 6}, ${points[2].x} ${points[2].y} S ${points[3].x - 24} ${points[3].y + 3}, ${points[3].x} ${points[3].y}`;

  return (
    <View style={styles.chartWrap}>
      <Svg width={width} height={height}>
        {[0, 1, 2].map((index) => {
          const y = top + ((height - top - bottom) / 3) * index;
          return (
            <Line
              key={index}
              x1={left}
              y1={y}
              x2={width - right}
              y2={y}
              stroke={colors.divider}
              strokeWidth={1}
            />
          );
        })}
        {[0, 1, 2].map((index) => {
          const x = left + ((width - left - right) / 3) * index;
          return (
            <Line
              key={`v-${index}`}
              x1={x}
              y1={top}
              x2={x}
              y2={height - bottom}
              stroke={colors.divider}
              strokeWidth={1}
            />
          );
        })}
        <Path d={areaPath} fill={colors.accentMuted} />
        <Path
          d={linePath}
          stroke={colors.accent}
          strokeWidth={4}
          fill="none"
        />
        <Circle cx={points[0].x} cy={points[0].y} r={6} fill="#10A6FF" />
        <Circle
          cx={points[3].x}
          cy={points[3].y}
          r={7}
          fill={colors.accentSoft}
        />
      </Svg>
      <View style={styles.chartLabels}>
        {labels.map((label) => (
          <AppText
            key={label}
            variant="caption"
            color={colors.textSecondary}
          >
            {label}
          </AppText>
        ))}
      </View>
    </View>
  );
}

function MetricRow({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  const { styles } = useOnboardingTheme();

  return (
    <View style={styles.metricRow}>
      <View style={styles.metricLeft}>
        <View style={styles.metricIcon}>{icon}</View>
        <AppText variant="body" style={styles.metricLabel}>
          {label}
        </AppText>
      </View>
      <AppText variant="heading" style={styles.metricValue}>
        {value}
      </AppText>
    </View>
  );
}
