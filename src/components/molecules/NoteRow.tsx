import { memo, type ReactNode, useEffect, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { AppIcon } from '@/components/atoms/AppIcon';
import { LoggedPressable } from '@/components/atoms/Logged';

import { AppText } from '@/components/atoms/AppText';
import { EntryMeta } from '@/components/molecules/EntryMeta';
import { ThinkingIndicator } from '@/components/molecules/ThinkingIndicator';
import { WorkoutOutliner } from '@/components/molecules/WorkoutOutliner';
import {
  IOS_NATIVE_ENABLED,
  SwiftHost,
  SwiftButton,
  swiftButtonStyle,
  swiftControlSize,
  swiftFrame,
  swiftLabelStyle,
  swiftTint,
  swiftFont,
  swiftForegroundStyle,
} from '@/components/onboarding/onboardingNative';
import { Radii, Spacing } from '@/constants/theme';
import { ENRICH_TIMEOUT, ENRICH_UNCONFIGURED } from '@/core/enrich/types';
import type { Entry } from '@/core/types';
import { foodNoteKind, sumFoodData } from '@/domains/food';
import type { FoodData, FoodEntryData } from '@/domains/schemas';
import type { DomainConfig } from '@/domains/types';
import { useColors } from '@/hooks/use-colors';
import { t } from '@/i18n';
import { useAppStore } from '@/store/useAppStore';
import { useAppModalStore } from '@/store/useAppModalStore';

interface NoteRowProps<TData, TTotals> {
  entry: Entry;
  previousEntry?: Entry;
  config: DomainConfig<TData, TTotals>;
  keyboardVisible?: boolean;
  leading?: ReactNode;
  onEdit: (entry: Entry, text: string) => void;
  onDelete: (entry: Entry) => void;
  onRetry: (entry: Entry) => void;
  onTogglePlanned?: (entry: Entry, completed: boolean) => void;
  onSaveExercise?: (entry: Entry, saved: boolean) => Promise<boolean> | boolean | void;
  exerciseSaved?: boolean;
  onOpenFoodDetails?: (entry: Entry) => void;
  onOpenPantry?: () => void;
  onFocusNewWorkoutExercise?: () => void;
  onDeleteWorkoutExercise?: () => void;
  onFocusLine?: () => void;
  autoFocusWorkoutExercise?: boolean;
  onWorkoutExerciseAutoFocused?: () => void;
}

function PlannedCheckButton({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const colors = useColors();
  const progress = useSharedValue(checked ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(checked ? 1 : 0, {
      duration: 220,
      easing: Easing.out(Easing.cubic),
    });
  }, [checked, progress]);

  const buttonAnim = useAnimatedStyle(() => ({
    transform: [{ scale: 0.92 + progress.value * 0.08 }],
  }));
  const checkAnim = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.65 + progress.value * 0.35 }],
  }));

  if (IOS_NATIVE_ENABLED && SwiftHost && SwiftButton) {
    return (
      <View style={styles.planCheckSlot}>
        <SwiftHost style={styles.swiftPlanCheckHost}>
          <SwiftButton
            onPress={() => onChange(!checked)}
            label={t('plan.toggle')}
            systemImage={checked ? 'checkmark.circle.fill' : 'circle'}
            modifiers={[
              swiftButtonStyle?.('plain'),
              swiftControlSize?.('regular'),
              swiftLabelStyle?.('iconOnly'),
              swiftFont?.({ size: 26 }),
              swiftForegroundStyle?.(checked ? colors.success : colors.textSecondary),
              swiftTint?.(colors.success),
              swiftFrame?.({ width: 30, height: 30 }),
            ].filter(Boolean)}
          />
        </SwiftHost>
      </View>
    );
  }

  return (
    <View style={styles.planCheckSlot}>
      <LoggedPressable
        onPress={() => onChange(!checked)}
        hitSlop={10}
        accessibilityRole="checkbox"
        accessibilityLabel={t('plan.toggle')}
        accessibilityState={{ checked }}>
        <Animated.View
          style={[
            styles.planCheckButton,
            {
              borderColor: checked ? colors.success : colors.border,
              backgroundColor: checked ? colors.success : 'transparent',
            },
            buttonAnim,
          ]}>
          <Animated.View style={checkAnim}>
            <AppIcon name="check" color="#FFFFFF" size={18} />
          </Animated.View>
        </Animated.View>
      </LoggedPressable>
    </View>
  );
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
    if (entry.error === 'agent.authRequired') {
      return <LoggedPressable onPress={() => useAppModalStore.getState().openAppModal({ id: 'settings.connect', domain: entry.domain })}
        hitSlop={10} accessibilityRole="button" accessibilityLabel={t('agent.authRequired')}>
        <AppText variant="label" color={colors.danger}>{t('status.signIn')}</AppText>
      </LoggedPressable>;
    }
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
    // Barcode nutrition has its own import flow; photos retain their original source.
    if (entry.media?.some((media) => media.kind === 'barcode')) {
      return (
        <AppText variant="label" color={colors.danger}>
          {t('status.failed')}
        </AppText>
      );
    }
    return (
      <LoggedPressable onPress={() => onRetry(entry)} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('status.retry')}>
        <AppText variant="label" color={colors.danger}>
          {t(entry.error === ENRICH_TIMEOUT ? 'status.timedOut' : 'status.retry')}
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
  onTogglePlanned,
  onOpenFoodDetails,
  onOpenPantry,
  onFocusLine,
}: NoteRowProps<TData, TTotals>) {
  const colors = useColors();
  const [text, setText] = useState(entry.text);
  const inputRef = useRef<TextInput>(null);
  const deletedRef = useRef(false);
  const completed = entry.completedAt != null;
  const completeProgress = useSharedValue(completed ? 1 : 0);

  useEffect(() => {
    setText(entry.text);
    deletedRef.current = false;
  }, [entry.id, entry.text]);

  useEffect(() => {
    completeProgress.value = withTiming(completed ? 1 : 0, {
      duration: 260,
      easing: Easing.out(Easing.cubic),
    });
  }, [completed, completeProgress]);

  const rowDoneStyle = useAnimatedStyle(() => ({
    opacity: 1 - completeProgress.value * 0.34,
  }));

  const commit = () => {
    if (deletedRef.current) return;
    const trimmed = text.trim();
    if (!trimmed) {
      deletedRef.current = true;
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
    <Animated.View style={[styles.rowTop, rowDoneStyle]}>
      {entry.planned ? (
        <PlannedCheckButton
          checked={completed}
          onChange={(next) => onTogglePlanned?.(entry, next)}
        />
      ) : null}
      {leading}
      <View style={styles.inputWrap}>
        <TextInput
          ref={inputRef}
          value={text}
          onChangeText={setText}
          onFocus={onFocusLine}
          onContentSizeChange={() => {
            if (inputRef.current?.isFocused()) onFocusLine?.();
          }}
          onBlur={commit}
          onEndEditing={commit}
          multiline
          scrollEnabled={false}
          style={[
            styles.input,
            {
              color: colors.text,
              textDecorationLine: completed ? 'line-through' : 'none',
              textDecorationColor: colors.textSecondary,
            },
          ]}
          accessibilityLabel={entry.text}
        />
      </View>

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
    </Animated.View>
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
    onTogglePlanned,
    onSaveExercise,
    exerciseSaved,
    onFocusNewWorkoutExercise,
    onDeleteWorkoutExercise,
    onFocusLine,
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
          onFocusLine={onFocusLine}
          autoFocusExercise={autoFocusWorkoutExercise}
          onExerciseAutoFocused={onWorkoutExerciseAutoFocused}
        />
      ) : (
        <FoodRow {...props} onTogglePlanned={onTogglePlanned} />
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
  inputWrap: {
    flex: 1,
    minWidth: 0,
    minHeight: NOTE_MIN_HEIGHT,
    justifyContent: 'flex-start',
  },
  planCheckSlot: {
    width: 30,
    minHeight: NOTE_MIN_HEIGHT,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 1,
  },
  planCheckButton: {
    width: 28,
    height: 28,
    borderRadius: Radii.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swiftPlanCheckHost: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  right: {
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    gap: Spacing.one,
    paddingTop: Spacing.half,
    minWidth: 74,
  },
});
