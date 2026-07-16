import Slider from "@react-native-community/slider";
import {
  ArrowLeft,
  CalendarDays,
  Cat,
  Check,
  PencilLine,
  Sparkles,
} from "lucide-react-native";
import { type ReactNode } from "react";
import { Pressable, TextInput, View } from "react-native";

import { AppText } from "@/components/atoms/AppText";
import type { OnboardingBias, OnboardingProfile } from "@/core/onboarding";
import {
  BIAS_DOT_COLORS,
  biasMeta,
  considerationOptions,
  copy,
} from "./onboardingContent";
import { PrimaryButton } from "./onboardingControls";
import { useOnboardingTheme } from "./onboardingTheme";
import { formatDate } from "./onboardingUtils";

export function WelcomeStep({
  text,
  onStart,
  onSkip,
}: {
  text: (typeof copy)["pt-BR"];
  onStart: () => void;
  onSkip: () => void;
}) {
  const { colors, styles } = useOnboardingTheme();

  return (
    <View style={styles.welcome}>
      <View style={styles.welcomeHero}>
        <AppText variant="title" style={styles.logoWordmark}>
          GymNotes
        </AppText>
        <View style={styles.logoMark}>
          <Sparkles
            color={colors.textTertiary}
            size={18}
            style={styles.logoSparkLeft}
          />
          <Cat color={colors.text} size={100} strokeWidth={1.7} />
          <Sparkles
            color={colors.textTertiary}
            size={20}
            style={styles.logoSparkRight}
          />
        </View>
      </View>

      <View style={styles.welcomeBody}>
        <AppText variant="title" style={styles.welcomeTitle}>
          {text.welcomeTitle}
        </AppText>
        <AppText
          variant="body"
          color={colors.textSecondary}
          style={styles.welcomeText}
        >
          {text.welcomeBody}
        </AppText>
        <AppText
          variant="body"
          color={colors.textSecondary}
          style={styles.welcomeText}
        >
          {text.welcomeHint}
        </AppText>
      </View>

      <View style={styles.welcomeFooter}>
        <PrimaryButton label={text.start} onPress={onStart} />
        <Pressable onPress={onSkip} hitSlop={10}>
          <AppText
            variant="body"
            color={colors.textSecondary}
            style={styles.skipText}
          >
            {text.skip}
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

export function StepHeader({
  progress,
  stageLabel,
  onBack,
}: {
  progress: number;
  stageLabel: string;
  onBack: () => void;
}) {
  const { colors, styles } = useOnboardingTheme();

  return (
    <View style={styles.header}>
      <Pressable style={styles.backButton} onPress={onBack} hitSlop={10}>
        <ArrowLeft color={colors.textSecondary} size={24} strokeWidth={2.2} />
      </Pressable>

      <View style={styles.progressWrap}>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${Math.max(8, progress * 100)}%` },
            ]}
          />
        </View>
      </View>
    </View>
  );
}

export function SelectionStep({
  title,
  body,
  options,
  fill,
}: {
  title: string;
  body: string;
  options: {
    key: string;
    label: string;
    description?: string;
    selected: boolean;
    icon: ReactNode;
    onPress: () => void;
  }[];
  fill?: boolean;
}) {
  const { styles } = useOnboardingTheme();

  return (
    <View style={[styles.stepSection, fill && styles.stepSectionFill]}>
      <TitleBlock title={title} body={body} />
      <View style={styles.optionList}>
        {options.map((option) => {
          const { key, ...rest } = option;
          return <OptionCard key={key} {...rest} />;
        })}
      </View>
    </View>
  );
}

export function SingleValueStep({
  title,
  body,
  label,
  value,
  caption,
  onPress,
  footer,
  centered,
  fill,
}: {
  title: string;
  body?: string;
  label: string;
  value: string;
  caption: string;
  onPress: () => void;
  footer?: ReactNode;
  centered?: boolean;
  fill?: boolean;
}) {
  const { styles } = useOnboardingTheme();

  return (
    <View style={[styles.stepSection, fill && styles.stepSectionFill]}>
      <TitleBlock title={title} body={body} />
      <ValueCard
        label={label}
        value={value}
        caption={caption}
        onPress={onPress}
        centered={centered}
      />
      {footer}
    </View>
  );
}

export function MeasurementsStep({
  lang,
  text,
  profile,
  onOpenHeight,
  onOpenWeight,
  onOpenGoalWeight,
  onOpenGoalDate,
}: {
  lang: "pt-BR" | "en-US";
  text: (typeof copy)["pt-BR"];
  profile: OnboardingProfile;
  onOpenHeight: () => void;
  onOpenWeight: () => void;
  onOpenGoalWeight: () => void;
  onOpenGoalDate: () => void;
}) {
  const { styles } = useOnboardingTheme();

  return (
    <View style={[styles.stepSection, styles.stepSectionFill]}>
      <TitleBlock
        title={
          lang === "pt-BR"
            ? "Qual é sua altura e peso?"
            : "What are your height and weight?"
        }
      />
      <View style={styles.measurementStack}>
        <MeasurementField
          label={lang === "pt-BR" ? "Altura" : "Height"}
          value={`${profile.heightCm} cm`}
          onPress={onOpenHeight}
        />
        <MeasurementField
          label={text.currentWeight}
          value={`${profile.weightKg.toFixed(1)} kg`}
          onPress={onOpenWeight}
        />
        <MeasurementField
          label={text.goalWeight}
          value={`${profile.goalWeightKg.toFixed(1)} kg`}
          onPress={onOpenGoalWeight}
        />
        <MeasurementField
          label={lang === "pt-BR" ? "Data-alvo" : "Target date"}
          optionalLabel={lang === "pt-BR" ? "Opcional" : "Optional"}
          value={
            profile.goalDate
              ? formatDate(profile.goalDate, lang)
              : text.goalDateCta
          }
          icon="calendar"
          onPress={onOpenGoalDate}
        />
      </View>
    </View>
  );
}

function MeasurementField({
  label,
  optionalLabel,
  value,
  icon = "edit",
  onPress,
}: {
  label: string;
  optionalLabel?: string;
  value: string;
  icon?: "edit" | "calendar";
  onPress: () => void;
}) {
  const { colors, styles } = useOnboardingTheme();

  const Icon = icon === "calendar" ? CalendarDays : PencilLine;

  return (
    <View style={styles.measurementField}>
      <View style={styles.measurementLabelRow}>
        <AppText variant="body" color={colors.textSecondary}>
          {label}
        </AppText>
        {optionalLabel ? (
          <AppText variant="body" color={colors.textTertiary}>
            ({optionalLabel})
          </AppText>
        ) : null}
      </View>
      <Pressable style={styles.measurementCard} onPress={onPress}>
        <AppText variant="metric" style={styles.measurementValue}>
          {value}
        </AppText>
        <Icon color={colors.textTertiary} size={22} strokeWidth={2.1} />
      </Pressable>
    </View>
  );
}

export function ConsiderationsStep({
  lang,
  text,
  profile,
  updateProfile,
}: {
  lang: "pt-BR" | "en-US";
  text: (typeof copy)["pt-BR"];
  profile: OnboardingProfile;
  updateProfile: (patch: Partial<OnboardingProfile>) => void;
}) {
  const { colors, styles } = useOnboardingTheme();

  return (
    <View style={styles.stepSection}>
      <TitleBlock
        title={text.considerationsTitle}
        body={text.considerationsBody}
      />
      <View style={styles.chipsWrap}>
        {considerationOptions.map((option) => {
          const selected = profile.considerations.includes(option.value);
          return (
            <Pressable
              key={option.value}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() =>
                updateProfile({
                  considerations: selected
                    ? profile.considerations.filter(
                        (item) => item !== option.value,
                      )
                    : [...profile.considerations, option.value],
                })
              }
            >
              <option.Icon
                color={selected ? colors.accentSoft : "#B8B8BD"}
                size={18}
                strokeWidth={2.1}
              />
              <AppText variant="secondary" style={styles.chipText}>
                {option.label[lang]}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.notesWrap}>
        <AppText variant="body" style={styles.inputLabel}>
          {text.considerationsNotes}
        </AppText>
        <View style={styles.notesCard}>
          <TextInput
            value={profile.notes}
            onChangeText={(notes) => updateProfile({ notes })}
            multiline
            placeholder={
              lang === "pt-BR"
                ? "Ex: rotina corrida, foco em saciedade..."
                : "Ex: busy routine, focus on satiety..."
            }
            placeholderTextColor={colors.textTertiary}
            style={styles.notesInput}
          />
        </View>
        <AppText variant="secondary" color={colors.textSecondary}>
          {text.considerationsHint}
        </AppText>
      </View>
    </View>
  );
}

export function UncertaintyStep({
  lang,
  text,
  value,
  onChange,
}: {
  lang: "pt-BR" | "en-US";
  text: (typeof copy)["pt-BR"];
  value: OnboardingBias;
  onChange: (value: OnboardingBias) => void;
}) {
  const { colors, styles } = useOnboardingTheme();

  return (
    <View style={styles.stepSection}>
      <TitleBlock title={text.uncertaintyTitle} body={text.uncertaintyBody} />

      <View style={styles.biasCard}>
        <View
          style={[
            styles.biasCardDot,
            { backgroundColor: BIAS_DOT_COLORS[value] },
          ]}
        />
        <View style={styles.biasCardCopy}>
          <AppText variant="heading" style={styles.biasTitle}>
            {biasMeta[value].title[lang]}
          </AppText>
          <AppText variant="body" color={colors.textSecondary}>
            {biasMeta[value].body[lang]}
          </AppText>
          <AppText
            variant="body"
            color={colors.textTertiary}
            style={styles.biasExampleText}
          >
            {biasMeta[value].example[lang]}
          </AppText>
        </View>
      </View>

      <View style={styles.sliderSection}>
        <Slider
          style={styles.nativeSlider}
          minimumValue={0}
          maximumValue={4}
          step={1}
          value={value}
          onValueChange={(next) => onChange(Math.round(next) as OnboardingBias)}
          minimumTrackTintColor={colors.textSecondary}
          maximumTrackTintColor={colors.sliderTrack}
          thumbTintColor={colors.text}
        />

        <View style={styles.sliderLabels}>
          {([0, 1, 2, 3, 4] as OnboardingBias[]).map((item) => (
            <Pressable
              key={item}
              style={[
                styles.sliderLabelItem,
                item === value
                  ? styles.sliderLabelItemActive
                  : styles.sliderLabelItemMuted,
              ]}
              onPress={() => onChange(item)}
            >
              <View
                style={[
                  styles.sliderDot,
                  { backgroundColor: BIAS_DOT_COLORS[item] },
                  item === value && styles.sliderDotActive,
                ]}
              />
              <AppText
                variant="caption"
                color={item === value ? colors.text : colors.textTertiary}
                style={styles.sliderLabelText}
              >
                {biasMeta[item].title[lang]}
              </AppText>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

function TitleBlock({ title, body }: { title: string; body?: string }) {
  const { colors, styles } = useOnboardingTheme();

  return (
    <View style={styles.titleBlock}>
      <AppText variant="title" style={styles.stepTitle}>
        {title}
      </AppText>
      {body ? (
        <AppText
          variant="body"
          color={colors.textSecondary}
          style={styles.stepBody}
        >
          {body}
        </AppText>
      ) : null}
    </View>
  );
}

function OptionCard({
  label,
  description,
  selected,
  icon,
  onPress,
}: {
  label: string;
  description?: string;
  selected: boolean;
  icon: ReactNode;
  onPress: () => void;
}) {
  const { colors, styles } = useOnboardingTheme();

  return (
    <Pressable
      onPress={onPress}
      style={[styles.optionCard, selected && styles.optionCardSelected]}
    >
      <View style={styles.optionLeft}>
        <View style={styles.optionIcon}>{icon}</View>
        <View style={styles.optionCopy}>
          <AppText variant="heading" style={styles.optionLabel}>
            {label}
          </AppText>
          {description ? (
            <AppText variant="secondary" color={colors.textSecondary}>
              {description}
            </AppText>
          ) : null}
        </View>
      </View>

      <View
        style={[styles.optionCheck, selected && styles.optionCheckSelected]}
      >
        {selected ? <Check color={colors.checkText} size={16} strokeWidth={3} /> : null}
      </View>
    </Pressable>
  );
}

function ValueCard({
  label,
  value,
  caption,
  onPress,
  centered,
}: {
  label: string;
  value: string;
  caption: string;
  onPress: () => void;
  centered?: boolean;
}) {
  const { colors, styles } = useOnboardingTheme();

  if (centered) {
    return (
      <Pressable
        style={[styles.valueCard, styles.valueCardCentered]}
        onPress={onPress}
      >
        <AppText variant="metric" style={styles.valueTextBig}>
          {value}
        </AppText>
        <View style={styles.valueCaptionRow}>
          <AppText variant="secondary" color={colors.textTertiary}>
            {caption}
          </AppText>
          <PencilLine color={colors.textTertiary} size={16} strokeWidth={2.1} />
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable style={styles.valueCard} onPress={onPress}>
      <View style={styles.valueLabelRow}>
        <AppText variant="body" color={colors.textSecondary}>
          {label}
        </AppText>
        <PencilLine color={colors.textTertiary} size={18} strokeWidth={2.1} />
      </View>
      <AppText variant="metric" style={styles.valueText}>
        {value}
      </AppText>
      <AppText variant="secondary" color={colors.textTertiary}>
        {caption}
      </AppText>
    </Pressable>
  );
}
