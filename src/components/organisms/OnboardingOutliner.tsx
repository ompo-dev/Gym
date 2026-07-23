import { Check } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { LoggedPressable, LoggedTextInput } from '@/components/atoms/Logged';

import { AppText } from '@/components/atoms/AppText';
import { Metrics, Spacing } from '@/constants/theme';
import type { Answers, Question, QuestionOption } from '@/domains/onboardingQuestions';
import { isAnswered } from '@/domains/onboardingQuestions';
import { useColors } from '@/hooks/use-colors';
import { t } from '@/i18n';

interface OnboardingOutlinerProps {
  question: Question;
  answers: Answers;
  /** Rendered under the bullet for sheet-backed questions once answered. */
  display?: string;
  notes?: string;
  /** Current free-text answer, for `kind: 'list'` questions. */
  listText?: string;
  onChangeList?: (text: string) => void;
  onPick: (option: QuestionOption) => void;
  onOpenSheet: () => void;
  onSkip: () => void;
  onChangeNotes: (text: string) => void;
  /**
   * A text field took focus. The parent scrolls the block into view — the
   * keyboard shrinks the scroll viewport but does not move its content, so the
   * line being typed ends up behind the keyboard without this.
   */
  onFocusInput?: () => void;
  /** The field was left — the parent logs the settled text once, here. */
  onBlurInput?: () => void;
}

/**
 * One question, shaped exactly like a workout exercise block: a coloured bullet
 * on the headline and indented sub-lines under it.
 *
 * Every question stays live for the whole session — tapping a different line
 * changes the answer, which is the point of writing it as a note rather than as
 * a wizard step you can only pass through once.
 */
export function OnboardingOutliner({
  question,
  answers,
  display,
  notes,
  listText,
  onChangeList,
  onPick,
  onOpenSheet,
  onSkip,
  onChangeNotes,
  onFocusInput,
  onBlurInput,
}: OnboardingOutlinerProps) {
  const colors = useColors();
  const answered = isAnswered(answers, question.id);
  const chosen = answers[question.id];
  const isChosen = (value: string) =>
    Array.isArray(chosen) ? chosen.includes(value) : chosen === value;

  return (
    <View style={styles.block}>
      <View style={styles.headline}>
        <View style={styles.marker}>
          <AppText variant="value" color={question.color}>
            {'•'}
          </AppText>
        </View>
        <AppText variant="body" color={colors.text} style={styles.headlineText}>
          {question.question}
        </AppText>
      </View>

      <View style={styles.subLines}>
        {question.options?.map((option, index) => {
          const picked = isChosen(option.value);
          // The bias scale and the micronutrients each carry their own colour,
          // so a picked line looks like the thing it will become on the goals
          // screen rather than like a generic selection.
          const tint = option.color ?? question.color;
          return (
            <View key={option.value}>
              <LoggedPressable
                onPress={() => onPick(option)}
                hitSlop={4}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: picked }}
                accessibilityLabel={option.label}
                style={styles.subLine}>
                <View style={styles.subMarker}>
                  {picked ? (
                    <Check size={14} strokeWidth={3} color={tint} />
                  ) : (
                    <AppText variant="caption" color={colors.textTertiary}>
                      {`${index + 1}.`}
                    </AppText>
                  )}
                </View>
                {option.Icon ? (
                  <option.Icon
                    size={15}
                    strokeWidth={2.2}
                    color={picked ? tint : colors.textTertiary}
                  />
                ) : null}
                <AppText variant="body" color={picked ? tint : colors.text}>
                  {option.label}
                </AppText>
              </LoggedPressable>

              {/* The explanation is a sub-item of the answer, one level deeper —
                  it only earns its space once that answer is the chosen one. */}
              {picked && option.description ? (
                <View style={styles.detailLine}>
                  <AppText variant="caption" color={colors.textSecondary}>
                    {option.description}
                  </AppText>
                </View>
              ) : null}
            </View>
          );
        })}

        {question.kind === 'list' ? (
          <View style={styles.subLine}>
            <View style={styles.subMarker}>
              <AppText variant="caption" color={answered ? question.color : colors.textTertiary}>
                {answered ? '✓' : '1.'}
              </AppText>
            </View>
            <LoggedTextInput
              label={question.question}
              value={listText ?? ''}
              onChangeText={onChangeList}
              onFocus={onFocusInput}
              onBlur={onBlurInput}
              placeholder={t('onboarding.listPlaceholder')}
              placeholderTextColor={colors.textTertiary}
              multiline
              style={[styles.notesInput, { color: colors.text }]}
              accessibilityLabel={question.question}
            />
          </View>
        ) : question.options ? null : (
          <LoggedPressable
            onPress={onOpenSheet}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel={question.question}
            style={styles.subLine}>
            <View style={styles.subMarker}>
              {answered ? (
                <Check size={14} strokeWidth={3} color={question.color} />
              ) : (
                <AppText variant="caption" color={colors.textTertiary}>
                  1.
                </AppText>
              )}
            </View>
            <AppText variant="body" color={answered ? question.color : colors.textTertiary}>
              {display ?? question.hint ?? t('onboarding.tap')}
            </AppText>
          </LoggedPressable>
        )}

        {question.allowsText ? (
          <View style={styles.subLine}>
            <View style={styles.subMarker}>
              <AppText variant="caption" color={colors.textTertiary}>
                {'+'}
              </AppText>
            </View>
            <LoggedTextInput
              label={t('onboarding.notesPlaceholder')}
              value={notes ?? ''}
              onChangeText={onChangeNotes}
              onFocus={onFocusInput}
              onBlur={onBlurInput}
              placeholder={t('onboarding.notesPlaceholder')}
              placeholderTextColor={colors.textTertiary}
              multiline
              style={[styles.notesInput, { color: colors.text }]}
              accessibilityLabel={t('onboarding.notesPlaceholder')}
            />
          </View>
        ) : null}

        {question.optional && !answered ? (
          <LoggedPressable onPress={onSkip} hitSlop={4} accessibilityRole="button" accessibilityLabel={`${t('onboarding.skip')}: ${question.question}`} style={styles.subLine}>
            <View style={styles.subMarker} />
            <AppText variant="caption" color={colors.textTertiary}>
              {t('onboarding.skip')}
            </AppText>
          </LoggedPressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    paddingVertical: Spacing.three,
    gap: Spacing.one,
  },
  headline: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  marker: {
    width: Metrics.rowMinHeight / 2,
    alignItems: 'center',
  },
  headlineText: { flex: 1 },
  subLines: {
    paddingLeft: Metrics.rowMinHeight / 2 + Spacing.two,
    gap: Spacing.half,
  },
  subLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: Metrics.rowMinHeight - Spacing.two,
  },
  subMarker: {
    width: 18,
    alignItems: 'center',
  },
  detailLine: {
    paddingLeft: 18 + Spacing.two,
    paddingBottom: Spacing.one,
  },
  notesInput: {
    flex: 1,
    fontSize: 15,
    lineHeight: 21,
    padding: 0,
  },
});
