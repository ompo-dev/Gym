import { memo, type ReactNode, useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { LoggedPressable } from '@/components/atoms/Logged';

import { AppText } from '@/components/atoms/AppText';
import { EntryMeta } from '@/components/molecules/EntryMeta';
import { ThinkingIndicator } from '@/components/molecules/ThinkingIndicator';
import { WorkoutOutliner } from '@/components/molecules/WorkoutOutliner';
import { Spacing } from '@/constants/theme';
import { ENRICH_UNCONFIGURED } from '@/core/enrich/types';
import type { Entry } from '@/core/types';
import { foodNoteKind, sumFoodData } from '@/domains/food';
import type { FoodData, FoodEntryData } from '@/domains/schemas';
import type { DomainConfig } from '@/domains/types';
import { useColors } from '@/hooks/use-colors';
import { t } from '@/i18n';
import { useAppStore } from '@/store/useAppStore';

interface NoteRowProps<TData, TTotals> {
  entry: Entry;
  previousEntry?: Entry;
  config: DomainConfig<TData, TTotals>;
  keyboardVisible?: boolean;
  leading?: ReactNode;
  onEdit: (entry: Entry, text: string) => void;
  onDelete: (entry: Entry) => void;
  onRetry: (entry: Entry) => void;
  onSaveExercise?: (entry: Entry, saved: boolean) => Promise<boolean> | boolean | void;
  exerciseSaved?: boolean;
  onOpenFoodDetails?: (entry: Entry) => void;
  onOpenPantry?: () => void;
  onFocusNewWorkoutExercise?: () => void;
  onDeleteWorkoutExercise?: () => void;
  onFocusWorkoutLine?: (layout: { screenY: number; height: number }) => void;
  autoFocusWorkoutExercise?: boolean;
  onWorkoutExerciseAutoFocused?: () => void;
}

function isFoodData(data: Entry['data']): data is FoodData {
  return Boolean(data && 'items' in data);
}

function StatusBadge<TData, TTotals>({
  entry,
  config,
  onRetry,
}: {
  entry: Entry;
  config: DomainConfig<TData, TTotals>;
  onRetry: (entry: Entry) => void;
}) {
  const colors = useColors();

  if (entry.status === 'thinking') return <ThinkingIndicator label={t('status.thinking')} />;
  if (entry.status === 'queued') return <ThinkingIndicator label={t('status.queued')} />;
  if (entry.status === 'error') {
    // Nothing to retry against: there is no proxy to reach and no key to send.
    // Offering "try again" here is a loop the user cannot win — the fix lives
    // in Settings, so say that instead.
    if (entry.error === ENRICH_UNCONFIGURED) {
      return (
        <AppText variant="label" color={colors.danger}>
          {t('status.needsKey')}
        </AppText>
      );
    }
    // Retry re-enriches from `text` only, so offering it on an entry with
    // photos/barcode would quietly rebuild the meal without them. Show the
    // failed state, no affordance — the user re-adds it.
    if (entry.media?.length) {
      return (
        <AppText variant="label" color={colors.danger}>
          {t('status.failed')}
        </AppText>
      );
    }
    return (
      <LoggedPressable onPress={() => onRetry(entry)} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('status.retry')}>
        <AppText variant="label" color={colors.danger}>
          {t('status.retry')}
        </AppText>
      </LoggedPressable>
    );
  }
  if (entry.data) {
    return (
      <AppText variant="value" color={config.accent}>
        {config.formatResult(entry.data as TData)}
      </AppText>
    );
  }
  return null;
}

/**
 * Colour carries the meaning here, so it is never the only carrier: the text
 * beside it always says what the number is (a price, a calorie count).
 */
function foodResultColor(
  kind: ReturnType<typeof foodNoteKind>,
  colors: ReturnType<typeof useColors>,
  fallback: string,
): string {
  if (kind === 'purchase') return colors.success;
  if (kind === 'recipe') return colors.carbs;
  return fallback;
}

function FoodRow<TData, TTotals>({
  entry,
  previousEntry,
  config,
  leading,
  onEdit,
  onDelete,
  onRetry,
  onOpenFoodDetails,
  onOpenPantry,
}: NoteRowProps<TData, TTotals>) {
  const colors = useColors();
  const [text, setText] = useState(entry.text);

  useEffect(() => setText(entry.text), [entry.text]);

  const commit = () => {
    const trimmed = text.trim();
    if (!trimmed) {
      onDelete(entry);
      return;
    }
    if (trimmed !== entry.text) onEdit(entry, trimmed);
  };

  const resolved = entry.status === 'done' && entry.data;
  const kind = resolved ? foodNoteKind(entry.data as FoodEntryData) : null;
  const foodData = resolved && isFoodData(entry.data) ? (entry.data as FoodData) : null;
  const foodCalories = foodData ? Math.round(sumFoodData(foodData).calories) : null;

  return (
    <View style={styles.rowTop}>
      {leading}
      <TextInput
        value={text}
        onChangeText={setText}
        onEndEditing={commit}
        multiline
        scrollEnabled={false}
        style={[styles.input, { color: colors.text }]}
        accessibilityLabel={entry.text}
      />

      <View style={styles.right}>
        {kind ? (
          <>
            {/* A purchase opens the fridge it just stocked; a meal or a recipe
                opens its own nutrition. Same badge, different destination —
                which is why the label is not shared. */}
            <LoggedPressable
              onPress={() => (kind === 'purchase' ? onOpenPantry?.() : onOpenFoodDetails?.(entry))}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={
                kind === 'purchase' ? t('pantry.title') : t('details.nutrition')
              }>
              <AppText variant="value" color={foodResultColor(kind, colors, config.accent)}>
                {kind === 'purchase'
                  ? config.formatResult(entry.data as TData)
                  : `${foodCalories} cal`}
              </AppText>
            </LoggedPressable>
            <EntryMeta entry={entry} previousEntry={previousEntry} />
          </>
        ) : (
          <StatusBadge entry={entry} config={config} onRetry={onRetry} />
        )}
      </View>
    </View>
  );
}

function NoteRowInner<TData, TTotals>(props: NoteRowProps<TData, TTotals>) {
  useAppStore((s) => s.lang);
  const {
    entry,
    previousEntry,
    config,
    keyboardVisible,
    onEdit,
    onDelete,
    onRetry,
    onSaveExercise,
    exerciseSaved,
    onFocusNewWorkoutExercise,
    onDeleteWorkoutExercise,
    onFocusWorkoutLine,
    autoFocusWorkoutExercise,
    onWorkoutExerciseAutoFocused,
  } = props;

  return (
    <View style={styles.row}>
      {config.id === 'workout' ? (
        <WorkoutOutliner
          entry={entry}
          previousEntry={previousEntry}
          accent={config.accent}
          keyboardVisible={keyboardVisible}
          onEdit={onEdit}
          onDelete={onDelete}
          onRetry={onRetry}
          onSaveExercise={onSaveExercise}
          initialExerciseSaved={exerciseSaved}
          onFocusNewExercise={onFocusNewWorkoutExercise}
          onDeleteExercise={onDeleteWorkoutExercise}
          onFocusLine={onFocusWorkoutLine}
          autoFocusExercise={autoFocusWorkoutExercise}
          onExerciseAutoFocused={onWorkoutExerciseAutoFocused}
        />
      ) : (
        <FoodRow {...props} />
      )}
    </View>
  );
}

export const NoteRow = memo(NoteRowInner) as typeof NoteRowInner;

/**
 * Deliberately not `Metrics.rowMinHeight` (56). That token sizes tappable
 * *settings* rows, and it was padding a one-line note out to 80pt tall — the
 * gap the diet list actually complained about was mostly this, not the margins.
 * A note is a line of text, so it gets a line's height; 40 + 8pt of padding
 * still clears the 44pt touch minimum, and the shared token stays untouched
 * for the settings and onboarding rows that genuinely want 56.
 */
const NOTE_MIN_HEIGHT = 40;

const styles = StyleSheet.create({
  row: {
    paddingVertical: Spacing.one,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  input: {
    flex: 1,
    minHeight: NOTE_MIN_HEIGHT,
    fontSize: 17,
    lineHeight: 24,
    padding: 0,
  },
  right: {
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    gap: Spacing.one,
    paddingTop: Spacing.half,
    minWidth: 74,
  },
});
