import { Shield } from "lucide-react-native";
import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { AppText } from "@/components/atoms/AppText";
import { addDays, todayISO } from "@/core/date";
import {
  buildOnboardingSummary,
  defaultOnboardingProfile,
  getOnboardingStage,
  type OnboardingProfile,
} from "@/core/onboarding";
import { useAppStore } from "@/store/useAppStore";
import { DatePickerSheet, PickerSheet, PrimaryButton } from "./onboardingControls";
import { activityOptions, copy, genderOptions } from "./onboardingContent";
import { useOnboardingTheme } from "./onboardingTheme";
import {
  AccuracyStep,
  CaptureStep,
  ConsiderationsStep,
  DetailsStep,
  GoalsStep,
  MeasurementsStep,
  SelectionStep,
  SingleValueStep,
  StepHeader,
  UncertaintyStep,
  WelcomeStep,
} from "./onboardingSteps";
import { ageLabel, formatDate, type PickerKind } from "./onboardingUtils";

const TOTAL_STEPS = 11;
export function OnboardingFlow() {
  const { colors, styles } = useOnboardingTheme();
  const lang = useAppStore((s) => s.lang);
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);
  const insets = useSafeAreaInsets();
  const text = copy[lang];
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<OnboardingProfile>(() => ({
    ...defaultOnboardingProfile(),
    goalDate: null,
  }));
  const [picker, setPicker] = useState<PickerKind | null>(null);
  const [birthdayOpen, setBirthdayOpen] = useState(false);
  const [birthdayDraft, setBirthdayDraft] = useState(
    () => defaultOnboardingProfile().birthDate,
  );
  const [goalDateOpen, setGoalDateOpen] = useState(false);
  const [goalDateDraft, setGoalDateDraft] = useState(
    () => defaultOnboardingProfile().goalDate ?? addDays(todayISO(), 84),
  );
  const summary = useMemo(() => buildOnboardingSummary(profile), [profile]);
  const stage = getOnboardingStage(step);
  const progress = step === 0 ? 0 : step / (TOTAL_STEPS - 1);

  const updateProfile = (patch: Partial<OnboardingProfile>) =>
    setProfile((current) => ({ ...current, ...patch }));

  const handleNext = async () => {
    if (step === TOTAL_STEPS - 1) {
      await completeOnboarding(profile);
      return;
    }
    setStep((current) => current + 1);
  };

  const handleSkip = async () => {
    await completeOnboarding(profile);
  };

  const openBirthday = () => {
    setBirthdayDraft(profile.birthDate);
    setBirthdayOpen(true);
  };

  const saveBirthday = () => {
    updateProfile({ birthDate: birthdayDraft });
    setBirthdayOpen(false);
  };

  const openGoalDate = () => {
    setGoalDateDraft(profile.goalDate ?? addDays(todayISO(), 84));
    setGoalDateOpen(true);
  };

  const saveGoalDate = () => {
    updateProfile({ goalDate: goalDateDraft });
    setGoalDateOpen(false);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.safe}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {step === 0 ? (
          <WelcomeStep text={text} onStart={handleNext} onSkip={handleSkip} />
        ) : (
          <>
            <StepHeader
              progress={progress}
              stageLabel={stage === 1 ? text.stageProfile : text.stageApp}
              onBack={() => setStep((current) => Math.max(0, current - 1))}
            />

            {step <= 3 ? (
              <ScrollView
                style={styles.scroll}
                contentContainerStyle={[
                  styles.scrollContent,
                  styles.scrollContentGrow,
                  { paddingBottom: 112 + insets.bottom },
                ]}
                keyboardShouldPersistTaps="handled"
                alwaysBounceVertical={false}
                showsVerticalScrollIndicator={false}
              >
                {step === 1 ? (
                  <SelectionStep
                    fill
                    title={text.genderTitle}
                    body={text.genderBody}
                    options={genderOptions.map((option) => ({
                      key: option.value,
                      label: option.label[lang],
                      selected: profile.gender === option.value,
                      icon: (
                        <option.Icon
                          color={
                            profile.gender === option.value
                              ? colors.accentSoft
                              : colors.iconMuted
                          }
                          size={18}
                          strokeWidth={2.2}
                        />
                      ),
                      onPress: () => updateProfile({ gender: option.value }),
                    }))}
                  />
                ) : null}

                {step === 2 ? (
                  <SingleValueStep
                    fill
                    title={text.birthdayTitle}
                    body={text.birthdayBody}
                    label={text.birthdayField}
                    value={formatDate(profile.birthDate, lang)}
                    caption={ageLabel(profile.birthDate, lang)}
                    onPress={openBirthday}
                    footer={
                      <View style={styles.inlineHint}>
                        <Shield
                          color={colors.accentSoft}
                          size={18}
                          strokeWidth={2.2}
                        />
                        <AppText
                          variant="secondary"
                          color={colors.textSecondary}
                        >
                          {text.birthdaySafety}
                        </AppText>
                      </View>
                    }
                  />
                ) : null}

                {step === 3 ? (
                  <MeasurementsStep
                    lang={lang}
                    text={text}
                    profile={profile}
                    onOpenHeight={() => setPicker("height")}
                    onOpenWeight={() => setPicker("weight")}
                    onOpenGoalWeight={() => setPicker("goalWeight")}
                    onOpenGoalDate={openGoalDate}
                  />
                ) : null}
              </ScrollView>
            ) : (
              <ScrollView
                style={styles.scroll}
                contentContainerStyle={[
                  styles.scrollContent,
                  styles.scrollContentGrow,
                  { paddingBottom: 112 + insets.bottom },
                ]}
                keyboardShouldPersistTaps="handled"
                alwaysBounceVertical
                showsVerticalScrollIndicator={step >= 7}
              >
                {step === 4 ? (
                  <SelectionStep
                    title={text.activityTitle}
                    body={text.activityBody}
                    options={activityOptions.map((option) => ({
                      key: option.value,
                      label: option.label[lang],
                      description: option.body[lang],
                      selected: profile.activity === option.value,
                      icon: (
                        <option.Icon
                          color={
                            profile.activity === option.value
                              ? colors.accentSoft
                              : colors.iconMuted
                          }
                          size={20}
                          strokeWidth={2.2}
                        />
                      ),
                      onPress: () => updateProfile({ activity: option.value }),
                    }))}
                  />
                ) : null}

                {step === 5 ? (
                  <ConsiderationsStep
                    lang={lang}
                    text={text}
                    profile={profile}
                    updateProfile={updateProfile}
                  />
                ) : null}

                {step === 6 ? (
                  <UncertaintyStep
                    lang={lang}
                    text={text}
                    value={profile.estimationBias}
                    onChange={(estimationBias) =>
                      updateProfile({ estimationBias })
                    }
                  />
                ) : null}

                {step === 7 ? (
                  <GoalsStep
                    lang={lang}
                    text={text}
                    profile={profile}
                    summary={summary}
                    onToggleMicros={(trackMicronutrients) =>
                      updateProfile({ trackMicronutrients })
                    }
                  />
                ) : null}

                {step === 8 ? <AccuracyStep lang={lang} text={text} /> : null}

                {step === 9 ? <DetailsStep lang={lang} text={text} /> : null}

                {step === 10 ? <CaptureStep lang={lang} text={text} /> : null}
              </ScrollView>
            )}

            <View
              style={[
                styles.footer,
                { paddingBottom: Math.max(insets.bottom - 30, 0) },
              ]}
            >
              <PrimaryButton
                label={step === TOTAL_STEPS - 1 ? text.finish : text.continue}
                onPress={() => void handleNext()}
              />
            </View>
          </>
        )}

        <PickerSheet
          lang={lang}
          text={text}
          picker={picker}
          profile={profile}
          onClose={() => setPicker(null)}
          onPick={(kind, value) => {
            if (kind === "height" && typeof value === "number") {
              updateProfile({ heightCm: value });
            }
            if (kind === "weight" && typeof value === "number") {
              updateProfile({ weightKg: value });
            }
            if (kind === "goalWeight" && typeof value === "number") {
              updateProfile({ goalWeightKg: value });
            }
            if (kind === "goalDate") {
              updateProfile({
                goalDate: typeof value === "string" ? value : null,
              });
            }
            setPicker(null);
          }}
        />

        <DatePickerSheet
          visible={birthdayOpen}
          title={
            lang === "pt-BR" ? "Sua data de nascimento" : "Your birth date"
          }
          lang={lang}
          buttonLabel={text.saveDate}
          value={birthdayDraft}
          maximumDate={new Date()}
          onChange={setBirthdayDraft}
          onClose={() => setBirthdayOpen(false)}
          onSave={saveBirthday}
        />

        <DatePickerSheet
          visible={goalDateOpen}
          title={lang === "pt-BR" ? "Data-alvo" : "Target date"}
          lang={lang}
          buttonLabel={text.saveDate}
          value={goalDateDraft}
          minimumDate={new Date()}
          onChange={setGoalDateDraft}
          onClose={() => setGoalDateOpen(false)}
          onSave={saveGoalDate}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

