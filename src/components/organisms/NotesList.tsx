import { type RefObject, useEffect, useRef, useState } from 'react';
import { FlatList, Keyboard, type LayoutChangeEvent, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/atoms/AppText';
import { NoteRow } from '@/components/molecules/NoteRow';
import { Spacing } from '@/constants/theme';
import { COMPOSER_TRAY } from '@/core/appModals';
import type { Entry } from '@/core/types';
import type { DomainConfig } from '@/domains/types';
import { useColors } from '@/hooks/use-colors';

import { FoodMediaDraftTray, type FoodMediaDraft } from './FoodMediaDraftTray';

interface NotesListProps<TData, TTotals> {
  entries: Entry[];
  config: DomainConfig<TData, TTotals>;
  keyboardVisible?: boolean;
  canAddEmpty?: boolean;
  mediaDrafts?: FoodMediaDraft[];
  onChangeMediaDescription?: (id: string, description: string) => void;
  onRemoveMediaDraft?: (id: string) => void;
  onAdd: (text: string) => void;
  onEdit: (entry: Entry, text: string) => void;
  onDelete: (entry: Entry) => void;
  onRetry: (entry: Entry) => void;
  onSaveExercise?: (entry: Entry, saved: boolean) => Promise<boolean> | boolean | void;
  savedExerciseEntryIds?: Set<string>;
  onOpenFoodDetails?: (entry: Entry) => void;
  onOpenPantry?: () => void;
}

function getPreviousWorkoutEntryId(entries: Entry[], index: number): string | null {
  if (index <= 0) return null;
  return entries[index - 1]?.id ?? null;
}

function NewNoteInput({
  placeholder,
  onAdd,
  showBullet = false,
  inputRef,
  canAddEmpty = false,
  mediaDrafts = [],
  onChangeMediaDescription,
  onRemoveMediaDraft,
  onFocus,
  onBlur,
}: {
  placeholder: string;
  onAdd: (text: string) => void;
  showBullet?: boolean;
  inputRef?: RefObject<TextInput | null>;
  canAddEmpty?: boolean;
  mediaDrafts?: FoodMediaDraft[];
  onChangeMediaDescription?: (id: string, description: string) => void;
  onRemoveMediaDraft?: (id: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
}) {
  const colors = useColors();
  const [text, setText] = useState('');

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed && !canAddEmpty) return;
    onAdd(trimmed);
    setText('');
  };

  return (
    <View style={styles.newRow}>
      {showBullet ? (
        <AppText variant="value" color={colors.textSecondary} style={styles.newMarker}>
          {'\u2022'}
        </AppText>
      ) : null}
      {mediaDrafts.length > 0 && onChangeMediaDescription && onRemoveMediaDraft ? (
        <FoodMediaDraftTray
          drafts={mediaDrafts}
          ownerId={COMPOSER_TRAY}
          onChangeDescription={onChangeMediaDescription}
          onRemove={onRemoveMediaDraft}
        />
      ) : null}
      <TextInput
        ref={inputRef}
        value={text}
        onChangeText={setText}
        onFocus={onFocus}
        onBlur={onBlur}
        onSubmitEditing={submit}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        returnKeyType="done"
        submitBehavior="submit"
        style={[styles.newInput, { color: colors.text }]}
        accessibilityLabel={placeholder}
      />
    </View>
  );
}

export function NotesList<TData, TTotals>({
  entries,
  config,
  keyboardVisible,
  canAddEmpty,
  mediaDrafts,
  onChangeMediaDescription,
  onRemoveMediaDraft,
  onAdd,
  onEdit,
  onDelete,
  onRetry,
  onSaveExercise,
  savedExerciseEntryIds,
  onOpenFoodDetails,
  onOpenPantry,
}: NotesListProps<TData, TTotals>) {
  const containerRef = useRef<View | null>(null);
  const listRef = useRef<FlatList<Entry> | null>(null);
  const newInputRef = useRef<TextInput | null>(null);
  const [pendingWorkoutExerciseFocusId, setPendingWorkoutExerciseFocusId] = useState<string | null>(
    null,
  );
  const [viewportHeight, setViewportHeight] = useState(0);
  const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const newInputCenterTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollEndTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const centerNewInputRef = useRef<(animated: boolean) => void>(() => {});
  const newInputFocused = useRef(false);
  const lastScrolledEntriesKey = useRef<string | null>(null);
  const entriesLength = useRef(entries.length);
  const scrollY = useRef(0);
  const listHeight = useRef(0);
  const listWindowY = useRef(0);
  const keyboardTop = useRef<number | null>(null);
  const focusedLine = useRef<{ index: number; screenY: number; height: number } | null>(null);
  const entriesKey = entries.map((entry) => entry.id).join('|');
  entriesLength.current = entries.length;

  const scheduleScrollToEnd = (animated = false) => {
    if (scrollEndTimer.current) clearTimeout(scrollEndTimer.current);
    scrollEndTimer.current = setTimeout(() => {
      listRef.current?.scrollToEnd({ animated });
    }, 32);
  };

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', ({ endCoordinates }) => {
      keyboardTop.current = endCoordinates.screenY;
      if (focusedLine.current) measureViewport(() => scrollLineToCenter(focusedLine.current!, false));
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      keyboardTop.current = null;
      if (focusedLine.current?.index === entriesLength.current) {
        centerNewInputRef.current(false);
        return;
      }
      if (focusedLine.current) measureViewport(() => scrollLineToCenter(focusedLine.current!, false));
    });

    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (focusTimer.current) clearTimeout(focusTimer.current);
      if (newInputCenterTimer.current) clearTimeout(newInputCenterTimer.current);
      if (scrollEndTimer.current) clearTimeout(scrollEndTimer.current);
    };
  }, []);

  const measureViewport = (afterMeasure?: () => void) => {
    const container = containerRef.current;
    if (!container) {
      afterMeasure?.();
      return;
    }
    container.measureInWindow((_x, y, _width, height) => {
      listWindowY.current = y;
      listHeight.current = height;
      afterMeasure?.();
    });
  };

  const scrollLineToCenter = (
    target: { index: number; screenY: number; height: number },
    animated: boolean,
  ) => {
    if (!listHeight.current) return;
    const visibleTop = listWindowY.current + Spacing.four;
    const visibleBottom = keyboardTop.current
      ? Math.min(listWindowY.current + listHeight.current, keyboardTop.current - Spacing.four)
      : listWindowY.current + listHeight.current;
    const visibleHeight = Math.max(0, visibleBottom - visibleTop);
    if (visibleHeight <= 0) return;
    const desiredCenter = visibleTop + visibleHeight / 2;
    const lineCenter = target.screenY + target.height / 2;
    const delta = lineCenter - desiredCenter;
    if (Math.abs(delta) < 8) return;
    const offset = Math.max(0, scrollY.current + delta);
    scrollY.current = offset;
    listRef.current?.scrollToOffset({ offset, animated });
  };

  const centerLine = (index: number, layout: { screenY: number; height: number }) => {
    const target = { index, ...layout };
    focusedLine.current = target;
    measureViewport(() => scrollLineToCenter(target, true));
  };

  const centerNewInput = (animated: boolean) => {
    const input = newInputRef.current;
    if (!input) return;
    input.measureInWindow((_x, y, _width, height) => {
      const target = { index: entries.length, screenY: y, height };
      focusedLine.current = target;
      measureViewport(() => scrollLineToCenter(target, animated));
    });
  };
  centerNewInputRef.current = centerNewInput;

  const scheduleNewInputCenter = (animated = true) => {
    if (newInputCenterTimer.current) clearTimeout(newInputCenterTimer.current);
    newInputCenterTimer.current = setTimeout(() => centerNewInput(animated), 32);
  };

  const focusNewExercise = () => {
    let attempts = 0;

    const focusInput = () => {
      const input = newInputRef.current;
      if (input) {
        input.focus();
        return;
      }
      if (attempts >= 4) return;
      attempts += 1;
      focusTimer.current = setTimeout(focusInput, 16);
    };

    if (focusTimer.current) clearTimeout(focusTimer.current);
    focusTimer.current = setTimeout(focusInput, 16);
  };

  const focusWorkoutExercise = (entryId: string | null) => {
    if (!entryId) {
      setPendingWorkoutExerciseFocusId(null);
      focusNewExercise();
      return;
    }
    setPendingWorkoutExerciseFocusId(entryId);
  };

  const handleNewInputFocus = () => {
    newInputFocused.current = true;
    scheduleNewInputCenter(true);
  };

  const handleNewInputBlur = () => {
    newInputFocused.current = false;
    scheduleNewInputCenter(false);
  };

  const handleLayout = (event: LayoutChangeEvent) => {
    const height = event.nativeEvent.layout.height;
    setViewportHeight((current) => (current === height ? current : height));
    measureViewport(() => {
      if (focusedLine.current?.index === entriesLength.current) {
        centerNewInput(false);
        return;
      }
      if (focusedLine.current) scrollLineToCenter(focusedLine.current, false);
    });
  };

  const contentPaddingBottom =
    viewportHeight > 0 ? Math.max(Spacing.four, Math.round(viewportHeight * 0.45)) : Spacing.four;

  return (
    <View
      ref={containerRef}
      style={styles.container}
      onLayout={handleLayout}>
      <FlatList
        ref={listRef}
        style={styles.list}
        data={entries}
        keyExtractor={(entry) => entry.id}
        onScroll={({ nativeEvent }) => {
          scrollY.current = nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        renderItem={({ item, index }) => (
          <View>
            <NoteRow
              entry={item}
              previousEntry={index > 0 ? entries[index - 1] : undefined}
              config={config}
              keyboardVisible={keyboardVisible}
              leading={
                config.id === 'food' && item.media?.length ? (
                  <FoodMediaDraftTray drafts={item.media} ownerId={item.id} />
                ) : undefined
              }
              onEdit={onEdit}
              onDelete={onDelete}
              onRetry={onRetry}
              onSaveExercise={
                config.id === 'workout' ? onSaveExercise : undefined
              }
              exerciseSaved={
                config.id === 'workout' ? savedExerciseEntryIds?.has(item.id) ?? false : false
              }
              onOpenFoodDetails={onOpenFoodDetails}
              onOpenPantry={onOpenPantry}
              onFocusNewWorkoutExercise={config.id === 'workout' ? focusNewExercise : undefined}
              onDeleteWorkoutExercise={
                config.id === 'workout'
                  ? () => focusWorkoutExercise(getPreviousWorkoutEntryId(entries, index))
                  : undefined
              }
              onFocusWorkoutLine={
                config.id === 'workout' ? (layout) => centerLine(index, layout) : undefined
              }
              autoFocusWorkoutExercise={
                config.id === 'workout' && item.id === pendingWorkoutExerciseFocusId
              }
              onWorkoutExerciseAutoFocused={
                config.id === 'workout'
                  ? () =>
                      setPendingWorkoutExerciseFocusId((current) =>
                        current === item.id ? null : current,
                      )
                  : undefined
              }
            />
          </View>
        )}
        onScrollToIndexFailed={({ averageItemLength, index }) => {
          listRef.current?.scrollToOffset({ offset: averageItemLength * index, animated: true });
          setTimeout(() => {
            if (focusedLine.current?.index === index) {
              measureViewport(() => scrollLineToCenter(focusedLine.current!, true));
            }
          }, 32);
        }}
        onContentSizeChange={() => {
          if (newInputFocused.current) {
            scheduleNewInputCenter(true);
            return;
          }
          if (lastScrolledEntriesKey.current !== entriesKey) {
            lastScrolledEntriesKey.current = entriesKey;
            scheduleScrollToEnd(false);
          }
        }}
        ListFooterComponent={
          <NewNoteInput
            placeholder={config.placeholder}
            onAdd={onAdd}
            showBullet={config.id === 'workout'}
            inputRef={newInputRef}
            canAddEmpty={canAddEmpty}
            mediaDrafts={mediaDrafts}
            onChangeMediaDescription={onChangeMediaDescription}
            onRemoveMediaDraft={onRemoveMediaDraft}
            onFocus={handleNewInputFocus}
            onBlur={handleNewInputBlur}
          />
        }
        contentContainerStyle={[styles.content, { paddingBottom: contentPaddingBottom }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
  content: {
    paddingBottom: Spacing.four,
  },
  newRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  newMarker: {
    width: 16,
    textAlign: 'center',
  },
  newInput: {
    flex: 1,
    fontSize: 17,
    lineHeight: 24,
    paddingVertical: Spacing.two,
  },
});
