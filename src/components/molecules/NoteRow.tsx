import { memo, useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/atoms/AppText';
import { EntryMeta } from '@/components/molecules/EntryMeta';
import { ThinkingIndicator } from '@/components/molecules/ThinkingIndicator';
import { WorkoutOutliner } from '@/components/molecules/WorkoutOutliner';
import { Metrics, Spacing } from '@/constants/theme';
import type { Entry } from '@/core/types';
import { sumFoodData } from '@/domains/food';
import type { FoodData } from '@/domains/schemas';
import type { DomainConfig } from '@/domains/types';
import { useColors } from '@/hooks/use-colors';
import { t } from '@/i18n';
import { useAppStore } from '@/store/useAppStore';

interface NoteRowProps<TData, TTotals> {
  entry: Entry;
  previousEntry?: Entry;
  config: DomainConfig<TData, TTotals>;
  keyboardVisible?: boolean;
  onEdit: (entry: Entry, text: string) => void;
  onDelete: (entry: Entry) => void;
  onRetry: (entry: Entry) => void;
  onOpenFoodDetails?: (entry: Entry) => void;
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
    return (
      <Pressable onPress={() => onRetry(entry)} hitSlop={10} accessibilityRole="button">
        <AppText variant="label" color={colors.danger}>
          {t('status.retry')}
        </AppText>
      </Pressable>
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

function FoodRow<TData, TTotals>({
  entry,
  previousEntry,
  config,
  onEdit,
  onDelete,
  onRetry,
  onOpenFoodDetails,
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

  const resolvedFood = entry.status === 'done' && isFoodData(entry.data);
  const foodData = resolvedFood ? (entry.data as FoodData) : null;
  const foodCalories = foodData ? Math.round(sumFoodData(foodData).calories) : null;

  return (
    <View style={styles.rowTop}>
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
        {resolvedFood && foodCalories !== null ? (
          <>
            <Pressable
              onPress={() => onOpenFoodDetails?.(entry)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t('details.nutrition')}>
              <AppText variant="value" color={config.accent}>
                {foodCalories} cal
              </AppText>
            </Pressable>
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

const styles = StyleSheet.create({
  row: {
    paddingVertical: Spacing.three,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  input: {
    flex: 1,
    minHeight: Metrics.rowMinHeight,
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
