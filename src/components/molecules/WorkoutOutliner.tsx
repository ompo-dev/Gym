import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { AppIcon } from '@/components/atoms/AppIcon';
import { AppText } from '@/components/atoms/AppText';
import { GlassSurface } from '@/components/atoms/GlassSurface';
import { EntryMeta } from '@/components/molecules/EntryMeta';
import { ThinkingIndicator } from '@/components/molecules/ThinkingIndicator';
import { Metrics, Radii, Spacing } from '@/constants/theme';
import type { Entry, EntryStatus } from '@/core/types';
import type { WorkoutData, WorkoutSet } from '@/domains/schemas';
import {
  formatWorkoutNumber,
  formatWorkoutSetPace,
  formatWorkoutSetSummary,
  formatWorkoutSetVolume,
  getWorkoutSetVolume,
  normalizeWorkoutExercise,
  parseWorkoutSetLines,
  serializeWorkoutLines,
  WORKOUT_METRIC_COLORS,
} from '@/domains/workout';
import { useColors } from '@/hooks/use-colors';
import { t } from '@/i18n';

const RECENT_MS = 4_000;
const BLUR_COMMIT_MS = 40;
const FOCUS_RETRY_MS = 16;
interface WorkoutOutlinerProps {
  entry: Entry;
  previousEntry?: Entry;
  accent: string;
  keyboardVisible?: boolean;
  onEdit: (entry: Entry, text: string) => void;
  onDelete: (entry: Entry) => void;
  onRetry: (entry: Entry) => void;
  onSaveExercise?: (entry: Entry, saved: boolean) => Promise<boolean> | boolean | void;
  initialExerciseSaved?: boolean;
  onFocusNewExercise?: () => void;
  onDeleteExercise?: () => void;
  onFocusLine?: (layout: { screenY: number; height: number }) => void;
  autoFocusExercise?: boolean;
  onExerciseAutoFocused?: () => void;
}

function splitLines(text: string): string[] {
  const parts = text.split('\n');
  return parts.length > 0 ? parts : [''];
}

function formattedExercise(entry: Entry, rawExercise: string): string {
  const data =
    entry.status === 'done' && entry.data && 'sets' in entry.data
      ? (entry.data as WorkoutData)
      : null;

  return data?.exercise ?? (normalizeWorkoutExercise(rawExercise) || rawExercise);
}

export function getAnimatedMarkerIndex({
  isInitialSync,
  previousStatus,
  nextStatus,
  previousResolved,
  resolvedNow,
  latestResolvedSet,
}: {
  isInitialSync: boolean;
  previousStatus: EntryStatus;
  nextStatus: EntryStatus;
  previousResolved: boolean[];
  resolvedNow: boolean[];
  latestResolvedSet: number;
}): number {
  if (isInitialSync) return -1;

  const wasPending = previousStatus === 'thinking' || previousStatus === 'queued';
  if (wasPending && nextStatus === 'done') return latestResolvedSet;

  return resolvedNow.findIndex((resolved, index) => resolved && !previousResolved[index]);
}

function FlexMarker({ animationNonce }: { animationNonce: number }) {
  const scale = useSharedValue(1);

  useEffect(() => {
    if (animationNonce === 0) return;
    scale.value = 1;
    scale.value = withSequence(
      withTiming(1.26, { duration: 120, easing: Easing.out(Easing.cubic) }),
      withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) }),
    );
  }, [animationNonce, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return <Animated.Text style={[styles.flexMarker, animatedStyle]}>{'\uD83D\uDCAA'}</Animated.Text>;
}

function formatWorkoutSetEffort(set: WorkoutSet): string | null {
  const pace = formatWorkoutSetPace(set);
  if (pace) return pace;
  return getWorkoutSetVolume(set) > 0 ? formatWorkoutSetVolume(set) : null;
}

function SetSummaryText({
  set,
  fallback,
  color,
}: {
  set: WorkoutSet | null;
  fallback: string;
  color: string;
}) {
  const colors = useColors();
  if (!set) {
    return <Text style={[styles.setValueText, { color }]}>{fallback}</Text>;
  }

  if (set.weight !== undefined && set.reps !== undefined) {
    return (
      <Text style={[styles.setValueText, { color }]}>
        <Text style={{ color: WORKOUT_METRIC_COLORS.volume }}>
          {`${formatWorkoutNumber(set.weight)} ${set.unit ?? 'kg'}`}
        </Text>
        <Text style={{ color: colors.textSecondary }}>{' x '}</Text>
        <Text style={{ color: WORKOUT_METRIC_COLORS.reps }}>{set.reps}</Text>
      </Text>
    );
  }

  if (set.reps !== undefined) {
    return (
      <Text style={[styles.setValueText, { color }]}>
        <Text style={{ color: WORKOUT_METRIC_COLORS.reps }}>{set.reps}</Text>
        <Text>{' reps'}</Text>
      </Text>
    );
  }

  const parts: { key: string; text: string; color: string }[] = [];
  if (set.durationSeconds) {
    parts.push({
      key: 'time',
      text: formatWorkoutSetSummary({ durationSeconds: set.durationSeconds }),
      color: WORKOUT_METRIC_COLORS.duration,
    });
  }
  if (set.distanceMeters) {
    parts.push({
      key: 'dist',
      text: formatWorkoutSetSummary({ distanceMeters: set.distanceMeters }),
      color: WORKOUT_METRIC_COLORS.distance,
    });
  }

  return (
    <Text style={[styles.setValueText, { color }]}>
      {parts.map((part, index) => (
        <Text key={part.key}>
          {index > 0 ? <Text style={{ color: colors.textSecondary }}>{' / '}</Text> : null}
          <Text style={{ color: part.color }}>{part.text}</Text>
        </Text>
      ))}
    </Text>
  );
}

function SetDisplay({
  set,
  fallback,
  onPress,
  volumeColor,
}: {
  set: WorkoutSet | null;
  fallback: string;
  onPress: () => void;
  volumeColor: string;
}) {
  const colors = useColors();

  if (!set) {
    return (
      <Pressable onPress={onPress} hitSlop={6} style={styles.setValuePress}>
        <Text style={[styles.setValueText, { color: colors.text }]}>{fallback}</Text>
      </Pressable>
    );
  }

  const effort = formatWorkoutSetEffort(set);
  return (
    <Pressable onPress={onPress} hitSlop={6} style={styles.setValuePress}>
      <View style={styles.setValueRow}>
        <SetSummaryText set={set} fallback={fallback} color={colors.text} />
        {effort ? (
          <AppText variant="label" color={volumeColor} style={styles.setVolume}>
            {effort}
          </AppText>
        ) : null}
      </View>
    </Pressable>
  );
}

export function WorkoutOutliner({
  entry,
  previousEntry,
  accent,
  keyboardVisible,
  onEdit,
  onDelete,
  onRetry,
  onSaveExercise,
  initialExerciseSaved = false,
  onFocusNewExercise,
  onDeleteExercise,
  onFocusLine,
  autoFocusExercise,
  onExerciseAutoFocused,
}: WorkoutOutlinerProps) {
  const colors = useColors();
  const [lines, setLines] = useState<string[]>(() => splitLines(entry.text));
  const [focused, setFocused] = useState<number | null>(null);
  const [pendingFocus, setPendingFocus] = useState<number | null>(null);
  const [activeLine, setActiveLine] = useState(0);
  const [exerciseSaved, setExerciseSaved] = useState(initialExerciseSaved);
  const [animatedMarker, setAnimatedMarker] = useState<{ index: number; nonce: number } | null>(
    null,
  );

  const inputs = useRef<(TextInput | null)[]>([]);
  const linesRef = useRef(lines);
  const focusedRef = useRef<number | null>(null);
  const syncedText = useRef(entry.text);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reportTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousStatus = useRef(entry.status);
  const previousResolved = useRef<boolean[]>([]);
  const hasResolvedHistory = useRef(false);

  const parsedSetLines = parseWorkoutSetLines(lines.slice(1));
  const resolvedSignature = parsedSetLines
    .map((set) => (set ? formatWorkoutSetSummary(set) : ''))
    .join('|');
  const isPending = entry.status === 'thinking' || entry.status === 'queued';
  const latestResolvedSet = parsedSetLines.reduce((last, set, idx) => (set ? idx : last), -1);
  const pendingLine = isPending && activeLine > 0 && activeLine < lines.length ? activeLine : 0;
  const pendingSetIndex = pendingLine > 0 ? pendingLine - 1 : -1;

  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);

  useEffect(() => {
    if (entry.text !== syncedText.current && focusedRef.current === null) {
      syncedText.current = entry.text;
      setLines(splitLines(entry.text));
    }
  }, [entry.text]);

  useEffect(() => {
    setExerciseSaved(initialExerciseSaved);
  }, [entry.id, initialExerciseSaved]);

  useEffect(() => {
    const isRecent = Date.now() - entry.createdAt < RECENT_MS;
    if (isRecent && splitLines(entry.text).length === 1) {
      setLines((current) => (current.length === 1 ? [...current, ''] : current));
      queueFocus(1);
    }
    return () => {
      if (blurTimer.current) clearTimeout(blurTimer.current);
      if (focusTimer.current) clearTimeout(focusTimer.current);
      if (reportTimer.current) clearTimeout(reportTimer.current);
      if (markerTimer.current) clearTimeout(markerTimer.current);
    };
    // mount-only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (pendingFocus === null) return;

    const nextFocus = pendingFocus;
    let attempts = 0;

    const focusNext = () => {
      const input = inputs.current[nextFocus];
      if (input) {
        input.focus();
        scheduleLineReport(nextFocus);
        setPendingFocus(null);
        return;
      }
      if (attempts >= 4) {
        setPendingFocus(null);
        return;
      }
      attempts += 1;
      focusTimer.current = setTimeout(focusNext, FOCUS_RETRY_MS);
    };

    focusTimer.current = setTimeout(focusNext, FOCUS_RETRY_MS);
    return () => {
      if (focusTimer.current) clearTimeout(focusTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingFocus, lines.length]);

  useEffect(() => {
    const resolvedNow = parsedSetLines.map((set) => Boolean(set));
    const nextAnimated = getAnimatedMarkerIndex({
      isInitialSync: !hasResolvedHistory.current,
      previousStatus: previousStatus.current,
      nextStatus: entry.status,
      previousResolved: previousResolved.current,
      resolvedNow,
      latestResolvedSet,
    });

    if (nextAnimated !== -1) {
      setAnimatedMarker((current) => ({
        index: nextAnimated,
        nonce: (current?.nonce ?? 0) + 1,
      }));
      if (markerTimer.current) clearTimeout(markerTimer.current);
      markerTimer.current = setTimeout(() => {
        setAnimatedMarker((current) => (current?.index === nextAnimated ? null : current));
      }, 950);
    }

    hasResolvedHistory.current = true;
    previousStatus.current = entry.status;
    previousResolved.current = resolvedNow;
  }, [entry.status, latestResolvedSet, parsedSetLines, resolvedSignature]);

  useEffect(() => {
    if (!autoFocusExercise) return;
    queueFocus(0);
    onExerciseAutoFocused?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocusExercise]);

  useEffect(() => {
    if (focused === null) return;
    scheduleLineReport(focused);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused, keyboardVisible]);

  const commit = (next: string[]) => {
    const text = serializeWorkoutLines(next);
    if (!text) {
      onDelete(entry);
      return;
    }
    if (text !== entry.text) onEdit(entry, text);
  };

  const reportFocusedLine = (index: number) => {
    const input = inputs.current[index];
    if (!input) return;
    input.measureInWindow((_x, y, _width, height) => {
      onFocusLine?.({ screenY: y, height });
    });
  };

  const scheduleLineReport = (index: number) => {
    if (reportTimer.current) clearTimeout(reportTimer.current);
    reportTimer.current = setTimeout(() => reportFocusedLine(index), 0);
  };

  const queueFocus = (index: number) => {
    if (blurTimer.current) {
      clearTimeout(blurTimer.current);
      blurTimer.current = null;
    }
    focusedRef.current = index;
    setActiveLine(index);
    setFocused(index);
    setPendingFocus(index);
    scheduleLineReport(index);
  };

  const activateLine = (index: number) => {
    queueFocus(index);
  };

  const handleFocus = (index: number) => {
    if (blurTimer.current) {
      clearTimeout(blurTimer.current);
      blurTimer.current = null;
    }
    focusedRef.current = index;
    setActiveLine(index);
    setFocused(index);
    scheduleLineReport(index);
  };

  const handleBlur = () => {
    focusedRef.current = null;
    if (blurTimer.current) clearTimeout(blurTimer.current);
    blurTimer.current = setTimeout(() => {
      if (focusedRef.current === null) {
        setFocused(null);
        commit(linesRef.current);
      }
    }, BLUR_COMMIT_MS);
  };

  const updateLine = (index: number, value: string) => {
    setLines((current) => current.map((line, i) => (i === index ? value : line)));
  };

  const advanceToLine = (index: number) => {
    const nextIndex = index + 1;
    if (linesRef.current[nextIndex] !== undefined) {
      queueFocus(nextIndex);
      return;
    }
    setLines((current) => {
      const next = [...current];
      next.splice(nextIndex, 0, '');
      return next;
    });
    queueFocus(nextIndex);
  };

  const addSetAfter = (index: number) => {
    const nextIndex = index + 1;
    setLines((current) => {
      const next = [...current];
      next.splice(nextIndex, 0, '');
      return next;
    });
    queueFocus(nextIndex);
  };

  const focusNewExercise = () => {
    setFocused(null);
    focusedRef.current = null;
    setPendingFocus(null);
    setActiveLine(0);
    onFocusNewExercise?.();
  };

  const removeSetLine = (index: number) => {
    setLines((current) => current.filter((_, i) => i !== index));
    queueFocus(Math.max(0, index - 1));
  };

  const deleteExerciseBlock = () => {
    onDeleteExercise?.();
    if (!onDeleteExercise) focusNewExercise();
    onDelete(entry);
  };

  const toggleSaveExercise = () => {
    if (!onSaveExercise) return;
    const next = !exerciseSaved;
    setExerciseSaved(next);
    void Promise.resolve(onSaveExercise(entry, next))
      .then((confirmed) => {
        if (confirmed === false) setExerciseSaved(!next);
      })
      .catch(() => setExerciseSaved(!next));
  };

  const exerciseValue = focused === 0 ? lines[0] : formattedExercise(entry, lines[0] ?? '');

  return (
    <View style={styles.container}>
      <View style={styles.main}>
        <View style={styles.exerciseRow}>
          <View style={styles.exerciseMarker}>
            {pendingSetIndex === -1 && isPending ? (
              <ThinkingIndicator />
            ) : (
              <AppText variant="value" color={accent}>
                {'\u2022'}
              </AppText>
            )}
          </View>

          <TextInput
            ref={(ref) => {
              inputs.current[0] = ref;
            }}
            value={exerciseValue}
            onChangeText={(value) => updateLine(0, value)}
            onFocus={() => handleFocus(0)}
            onBlur={handleBlur}
            onSubmitEditing={() => advanceToLine(0)}
            onKeyPress={({ nativeEvent }) => {
              if (nativeEvent.key === 'Backspace' && lines[0].length === 0) {
                deleteExerciseBlock();
              }
            }}
            blurOnSubmit={false}
            submitBehavior="submit"
            returnKeyType="next"
            placeholder={t('workout.exercisePlaceholder')}
            placeholderTextColor={colors.textTertiary}
            style={[styles.exerciseInput, { color: accent }]}
            accessibilityLabel={t('workout.exercisePlaceholder')}
          />
        </View>

        <View style={styles.sets}>
          {lines.slice(1).map((line, idx) => {
            const i = idx + 1;
            const parsedSet = parsedSetLines[idx] ?? null;
            const showFlexMarker =
              focused !== i && Boolean(parsedSet) && animatedMarker?.index === idx;
            const animationNonce = showFlexMarker ? animatedMarker?.nonce ?? 0 : 0;

            return (
              <View key={i} style={styles.setRow}>
                <View style={styles.setMarker}>
                  {pendingSetIndex === idx ? (
                    <ThinkingIndicator />
                  ) : showFlexMarker ? (
                    <FlexMarker animationNonce={animationNonce} />
                  ) : (
                    <AppText variant="caption" color={colors.textTertiary} style={styles.setIndex}>
                      {idx + 1}.
                    </AppText>
                  )}
                </View>

                {focused === i ? (
                  <View style={styles.setInputRow}>
                    <TextInput
                      ref={(ref) => {
                        inputs.current[i] = ref;
                      }}
                      value={line}
                      onChangeText={(value) => updateLine(i, value)}
                      onFocus={() => handleFocus(i)}
                      onBlur={handleBlur}
                      onSubmitEditing={() => advanceToLine(i)}
                      blurOnSubmit={false}
                      onKeyPress={({ nativeEvent }) => {
                        if (nativeEvent.key === 'Backspace' && lines[i].length === 0) {
                          removeSetLine(i);
                        }
                      }}
                      submitBehavior="submit"
                      returnKeyType="next"
                      placeholder={t('workout.setPlaceholder')}
                      placeholderTextColor={colors.textTertiary}
                      style={[styles.setInput, { color: accent }]}
                      accessibilityLabel={t('workout.setPlaceholder')}
                    />
                    {parsedSet ? (
                      <AppText variant="label" color={accent} style={styles.setVolume}>
                        {formatWorkoutSetEffort(parsedSet) ?? formatWorkoutSetSummary(parsedSet)}
                      </AppText>
                    ) : null}
                  </View>
                ) : (
                  <SetDisplay
                    set={parsedSet}
                    fallback={line}
                    onPress={() => activateLine(i)}
                    volumeColor={accent}
                  />
                )}
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.right}>
        {entry.status === 'error' ? (
          <Pressable onPress={() => onRetry(entry)} hitSlop={10} accessibilityRole="button">
            <AppText variant="label" color={colors.danger}>
              {t('status.retry')}
            </AppText>
          </Pressable>
        ) : isPending ? null : (
          <>
            {entry.status === 'done' && onSaveExercise ? (
              <View style={styles.actionGroup}>
                <Pressable
                  onPress={toggleSaveExercise}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityState={{ selected: exerciseSaved }}
                  accessibilityLabel={t('workout.saveExercise')}>
                  <GlassSurface
                    glass="regular"
                    style={[
                      styles.actionSegment,
                      styles.actionSegmentLeft,
                    ]}>
                    <View style={[styles.actionIcon, exerciseSaved && styles.actionIconSaved]}>
                      <AppIcon
                        name="bookmark"
                        color={exerciseSaved ? colors.background : colors.textSecondary}
                        size={14}
                      />
                    </View>
                  </GlassSurface>
                </Pressable>

                <Pressable
                  onPress={() => addSetAfter(lines.length - 1)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={t('workout.addSet')}>
                  <GlassSurface glass="regular" style={[styles.actionSegment, styles.actionSegmentRight]}>
                    <AppIcon name="plus" color={colors.textSecondary} size={14} />
                  </GlassSurface>
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={() => addSetAfter(lines.length - 1)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={t('workout.addSet')}>
                <GlassSurface glass="regular" style={styles.addButton}>
                  <AppIcon name="plus" color={colors.textSecondary} size={14} />
                </GlassSurface>
              </Pressable>
            )}
          </>
        )}
        <EntryMeta entry={entry} previousEntry={previousEntry} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  main: {
    flex: 1,
    gap: Spacing.one,
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  exerciseMarker: {
    width: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exerciseInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
    padding: 0,
  },
  sets: {
    gap: 2,
    paddingLeft: Spacing.three,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 24,
  },
  setMarker: {
    width: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setIndex: {
    width: 22,
    textAlign: 'right',
  },
  flexMarker: {
    fontSize: 22,
    lineHeight: 22,
  },
  setInput: {
    flex: 1,
    fontSize: 15,
    lineHeight: 21,
    padding: 0,
  },
  setInputRow: {
    flex: 1,
    minHeight: 21,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  setValuePress: {
    flex: 1,
    minHeight: 21,
    justifyContent: 'center',
  },
  setValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  setValueText: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '500',
  },
  setVolume: {
    flexShrink: 0,
  },
  right: {
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    gap: Spacing.one,
    paddingTop: Spacing.half,
    minWidth: 92,
  },
  actionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radii.pill,
    overflow: 'hidden',
  },
  actionSegment: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: Metrics.iconButton - 16,
    overflow: 'hidden',
  },
  actionSegmentLeft: {
    borderTopLeftRadius: Radii.pill,
    borderBottomLeftRadius: Radii.pill,
  },
  actionSegmentRight: {
    borderTopRightRadius: Radii.pill,
    borderBottomRightRadius: Radii.pill,
  },
  actionIcon: {
    width: 22,
    height: 22,
    borderRadius: Radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIconSaved: {
    backgroundColor: '#FFFFFF',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    height: Metrics.iconButton - 16,
    borderRadius: Radii.pill,
    overflow: 'hidden',
  },
});
