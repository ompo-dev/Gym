import { useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/atoms/AppText';
import { copy } from '@/components/onboarding/onboardingContent';
import { DatePickerSheet, PickerSheet, PrimaryButton } from '@/components/onboarding/onboardingControls';
import { FoodGoalsSheet } from '@/components/organisms/FoodGoalsSheet';
import { OnboardingOutliner } from '@/components/organisms/OnboardingOutliner';
import { TotalsDock } from '@/components/organisms/TotalsDock';
import { Spacing } from '@/constants/theme';
import { addDays, todayISO } from '@/core/date';
import { log } from '@/core/log';
import {
  buildOnboardingSummary,
  defaultOnboardingProfile,
  type OnboardingProfile,
} from '@/core/onboarding';
import { foodConfig, type FoodTotals } from '@/domains/food';
import { OnboardingDraftStore } from '@/domains/onboardingDraft';
import {
  buildQuestions,
  currentQuestion,
  profileFromAnswers,
  type Answers,
  type Question,
  type QuestionOption,
} from '@/domains/onboardingQuestions';
import { formatDate } from '@/components/onboarding/onboardingUtils';
import { useColors } from '@/hooks/use-colors';
import { t } from '@/i18n';
import { useAppStore } from '@/store/useAppStore';

type SheetState =
  | { kind: 'none' }
  | { kind: 'date'; id: 'birthDate' | 'goalDate'; draft: string }
  | { kind: 'picker'; id: 'heightCm' | 'weightKg' | 'goalWeightKg' };

/**
 * First run as a note document, not a wizard.
 *
 * Every question is an outliner block — coloured bullet, indented sub-lines —
 * the same shape a workout exercise takes. Closed answers are ticked off in
 * place; measurements open the very pickers Settings uses, so nothing here is a
 * control the user will never meet again. When the script runs out the page
 * clears itself and writes the targets those answers produced.
 */
export function OnboardingTemplate() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const lang = useAppStore((s) => s.lang);
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);

  const [answers, setAnswers] = useState<Answers>({});
  const [notes, setNotes] = useState('');
  const [restored, setRestored] = useState(false);
  const [sheet, setSheet] = useState<SheetState>({ kind: 'none' });
  const [goalsOpen, setGoalsOpen] = useState(false);
  const updateOnboardingProfile = useAppStore((s) => s.updateOnboardingProfile);
  const scrollRef = useRef<ScrollView>(null);

  // Pick up where a previous launch stopped before drawing anything, so the
  // person never sees question one again after answering six.
  useEffect(() => {
    let alive = true;
    void OnboardingDraftStore.load().then((draft) => {
      if (!alive) return;
      setAnswers(draft.answers);
      setNotes(draft.notes);
      setRestored(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!restored) return; // never write the empty initial state over a draft
    void OnboardingDraftStore.save({ answers, notes });
  }, [restored, answers, notes]);

  const questions = useMemo(() => buildQuestions(lang), [lang]);
  const active = currentQuestion(questions, answers);
  const base = useMemo(() => ({ ...defaultOnboardingProfile(), goalDate: null }), []);
  const profile = useMemo(
    () => ({ ...profileFromAnswers(answers, base), notes }),
    [answers, base, notes],
  );
  const summary = useMemo(() => buildOnboardingSummary(profile), [profile]);

  // Only the answered questions plus the one in play are on screen — the script
  // reveals itself line by line instead of dumping nine blocks at once.
  const visible = questions.slice(0, activeIndex(questions, active) + 1);

  const store = (id: Question['id'], value: string | string[]) =>
    setAnswers((current) => ({ ...current, [id]: value }));

  /**
   * A settled answer: a tap on an option, a skip, a date saved, a picker
   * confirmed. Logged, because each is one deliberate decision.
   */
  const answer = (id: Question['id'], value: string | string[]) => {
    log.nav(`onboarding: ${id}`, {
      value: Array.isArray(value) ? (value.length ? value : '(skipped)') : value,
    });
    store(id, value);
  };

  /**
   * Free text, stored on every keystroke but NOT logged there — one line per
   * letter buries the log. `LoggedTextInput` already carries the per-keystroke
   * firehose behind `logConfig.verbose`; the settled value is logged on blur.
   */
  const typeAnswer = (id: Question['id'], text: string) => store(id, text);

  const pick = (question: Question, option: QuestionOption) => {
    // Touching anything else means the text field is done — `keyboardShould
    // PersistTaps="handled"` keeps the keyboard up for a tap it handles, which
    // is right for the tap but wrong for the field left focused behind it.
    Keyboard.dismiss();
    if (question.kind !== 'multi') {
      answer(question.id, option.value);
      return;
    }
    // Considerations are a set: tapping an already-picked line unpicks it.
    setAnswers((current) => {
      const chosen = current[question.id];
      const list = Array.isArray(chosen) ? chosen : [];
      const next = list.includes(option.value)
        ? list.filter((value) => value !== option.value)
        : [...list, option.value];
      return { ...current, [question.id]: next };
    });
  };

  const openSheet = (question: Question) => {
    Keyboard.dismiss();
    if (question.kind === 'date') {
      const id = question.id as 'birthDate' | 'goalDate';
      setSheet({
        kind: 'date',
        id,
        draft: draftDate(id, answers, base),
      });
      return;
    }
    if (question.kind === 'picker') {
      setSheet({ kind: 'picker', id: question.id as 'heightCm' | 'weightKg' | 'goalWeightKg' });
    }
  };

  const enter = () => {
    void OnboardingDraftStore.clear();
    void completeOnboarding(profile);
  };

  // `useFoodGoals` reads the profile from the store, so it has to be written
  // before the dock can show real numbers. Persisting here — rather than on the
  // way out — is what makes the dock the same one the diet tab will render.
  useEffect(() => {
    if (active === null) void updateOnboardingProfile(profile);
  }, [active, profile, updateOnboardingProfile]);

  // The targets shown as if the day were complete, so the dock reads full and
  // coloured instead of as an empty day.
  const goalTotals: FoodTotals = {
    calories: summary.calories,
    protein: summary.protein,
    carbs: summary.carbs,
    fat: summary.fat,
    waterMl: summary.waterMl,
    sugarG: summary.sugarG,
    fiberG: summary.fiberG,
    sodiumMg: summary.sodiumMg,
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.safe}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.safe}>
          <View style={styles.header}>
            <AppText variant="title" color={colors.text}>
              {t('onboarding.title')}
            </AppText>
          </View>

          <ScrollView
            ref={scrollRef}
            style={styles.scroll}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
            {visible.map((question) => (
              <OnboardingOutliner
                key={question.id}
                question={question}
                answers={answers}
                display={displayFor(question, answers, lang)}
                notes={question.allowsText ? notes : undefined}
                listText={typeof answers[question.id] === 'string' ? (answers[question.id] as string) : ''}
                onChangeList={(text) => typeAnswer(question.id, text)}
                onPick={(option) => pick(question, option)}
                onOpenSheet={() => openSheet(question)}
                onSkip={() => {
                  Keyboard.dismiss();
                  answer(question.id, []);
                }}
                onChangeNotes={setNotes}
                // The keyboard shrinks the viewport without moving the content,
                // so the line being typed lands behind it. The active question
                // is always the last block, so scrolling to the end puts it
                // above the keyboard. Deferred one frame past the keyboard
                // animation, or it scrolls to the pre-keyboard height.
                onFocusInput={() => {
                  setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
                }}
                // One line with the finished text, instead of one per letter.
                onBlurInput={() => {
                  const value = answers[question.id];
                  if (typeof value === 'string' && value.trim()) {
                    log.nav(`onboarding: ${question.id}`, { value });
                  }
                }}
              />
            ))}
          </ScrollView>

          {/* Once the script runs out the dock slides in above the button —
              the diet home dock, unchanged, tappable straight into the goals
              sheet. No separate results screen: the page just finishes. */}
          {active === null ? (
            <Animated.View
              entering={FadeIn.duration(420)}
              style={[styles.footer, { paddingBottom: Math.max(insets.bottom, Spacing.four) }]}>
              <FoodGoalsSheet visible={goalsOpen} totals={goalTotals} />
              <TotalsDock
                items={foodConfig.describeTotals(goalTotals)}
                // Same affordance as the diet home: the dock toggles the panel.
                onPress={() => setGoalsOpen((open) => !open)}
              />
              <PrimaryButton label={t('onboarding.enter')} onPress={enter} />
            </Animated.View>
          ) : null}
        </View>
      </KeyboardAvoidingView>

      <DatePickerSheet
        visible={sheet.kind === 'date'}
        title={sheet.kind === 'date' ? questionOf(questions, sheet.id).question : ''}
        lang={lang}
        buttonLabel={copy[lang].saveDate}
        value={sheet.kind === 'date' ? sheet.draft : todayISO()}
        maximumDate={sheet.kind === 'date' && sheet.id === 'birthDate' ? new Date() : undefined}
        minimumDate={sheet.kind === 'date' && sheet.id === 'goalDate' ? new Date() : undefined}
        onChange={(value) =>
          setSheet((current) => (current.kind === 'date' ? { ...current, draft: value } : current))
        }
        onClose={() => setSheet({ kind: 'none' })}
        onSave={() => {
          if (sheet.kind === 'date') answer(sheet.id, sheet.draft);
          setSheet({ kind: 'none' });
        }}
      />

      <PickerSheet
        lang={lang}
        text={copy[lang]}
        picker={sheet.kind === 'picker' ? PICKER_KIND[sheet.id] : null}
        profile={profile}
        onClose={() => setSheet({ kind: 'none' })}
        onPick={(_kind, value) => {
          if (sheet.kind === 'picker' && typeof value === 'number') answer(sheet.id, String(value));
          setSheet({ kind: 'none' });
        }}
      />
    </SafeAreaView>
  );
}

const PICKER_KIND = {
  heightCm: 'height',
  weightKg: 'weight',
  goalWeightKg: 'goalWeight',
} as const;

function activeIndex(questions: Question[], active: Question | null): number {
  return active ? questions.findIndex((q) => q.id === active.id) : questions.length - 1;
}

function questionOf(questions: Question[], id: Question['id']): Question {
  return questions.find((q) => q.id === id) ?? questions[0];
}

function draftDate(
  id: 'birthDate' | 'goalDate',
  answers: Answers,
  base: OnboardingProfile,
): string {
  const stored = answers[id];
  if (typeof stored === 'string') return stored;
  return id === 'birthDate' ? base.birthDate : addDays(todayISO(), 84);
}

/** Sheet-backed questions echo their answer on the sub-line once picked. */
function displayFor(question: Question, answers: Answers, lang: 'pt-BR' | 'en-US'): string | undefined {
  const value = answers[question.id];
  if (typeof value !== 'string') return undefined;
  if (question.kind === 'date') return formatDate(value, lang);
  if (question.id === 'heightCm') return `${value} cm`;
  return `${value} kg`;
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
  },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  footer: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    gap: Spacing.two,
  },
});
