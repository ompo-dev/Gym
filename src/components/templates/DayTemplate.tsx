import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard, KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { LoggedPressable } from '@/components/atoms/Logged';
import { AppIcon } from '@/components/atoms/AppIcon';
import { GlassSurface } from '@/components/atoms/GlassSurface';
import { UndoToast } from '@/components/molecules/UndoToast';
import { AppModalHost } from '@/components/organisms/AppModalHost';
import { DayHeader } from '@/components/organisms/DayHeader';
import { FoodGoalsSheet } from '@/components/organisms/FoodGoalsSheet';
import { FoodMediaActionMenu } from '@/components/organisms/FoodMediaActionMenu';
import { buildBarcodeText, type FoodMediaDraft } from '@/components/organisms/FoodMediaDraftTray';
import { NotesList } from '@/components/organisms/NotesList';
import { SaveRoutineSheet } from '@/components/organisms/SaveRoutineSheet';
import { TotalsDock } from '@/components/organisms/TotalsDock';
import { WorkoutProgressSheet } from '@/components/organisms/WorkoutProgressSheet';
import { Metrics, Radii, Spacing } from '@/constants/theme';
import { APP_MODAL_TRANSITION_MS, canOpenAppModal } from '@/core/appModals';
import { ENRICH_ERROR } from '@/core/command/CommandBus';
import type { Command } from '@/core/command/Command';
import { enrich } from '@/core/enrich/client';
import type { EnrichMediaDescription, EnrichMediaInput } from '@/core/enrich/types';
import { lookupOpenFoodFactsProduct } from '@/core/food/openFoodFacts';
import { buildOnboardingPromptContext } from '@/core/onboarding';
import type { Entry, EntryMediaAttachment, FoodMediaAction } from '@/core/types';
import { newId } from '@/core/utils';
import { EntryRepository } from '@/data/EntryRepository';
import { SavedMealRepository, type SavedMeal } from '@/data/SavedMealRepository';
import { SavedRoutineRepository, type Weekday } from '@/data/SavedRoutineRepository';
import { SavedExerciseRepository, type SavedExercise } from '@/data/SavedExerciseRepository';
import { routineItemsFor, weekdayOf } from '@/domains/routines';
import { mergeDuplicateFoodItems, mergeFoodEdit, type FoodTotals } from '@/domains/food';
import { foodEditSchema, foodSchema, type FoodData, type FoodItem, type WorkoutData } from '@/domains/schemas';
import type { DomainConfig } from '@/domains/types';
import { uniqueWorkoutExerciseNames } from '@/domains/workout';
import { useColors } from '@/hooks/use-colors';
import { useDay } from '@/hooks/useDay';
import { useTotals } from '@/hooks/useTotals';
import { getLang, t } from '@/i18n';
import { useAppModalStore } from '@/store/useAppModalStore';
import { useAppStore } from '@/store/useAppStore';

const UNDO_MS = 4_000;
const TAB_BAR_CLEARANCE = 64;
const REFRESH_REASONING_INSTRUCTION =
  'Rewrite only description, meal.reasoning and meal.confidence for this final meal. Preserve meal.items exactly.';

function buildFoodMediaText(drafts: FoodMediaDraft[]): string {
  const lines = drafts
    .map((draft, index) => {
      const description = draft.description.trim();
      return description ? `Image ${index + 1} mediaId=${draft.id}: ${description}` : '';
    })
    .filter(Boolean);
  return lines.join('\n');
}

function fallbackFoodMediaText(drafts: FoodMediaDraft[]): string {
  const text = drafts
    .map((draft) => draft.description.trim() || draft.data?.items[0]?.label)
    .filter(Boolean)
    .join(', ');
  return text || (drafts.length > 0 ? t('media.photosAdded') : '');
}

function mediaForEntry(drafts: FoodMediaDraft[]): EntryMediaAttachment[] | undefined {
  const media = drafts.map(({ id, kind, uri, description }) => ({
    id,
    kind,
    uri,
    description,
  }));
  return media.length ? media : undefined;
}

function mediaForAi(drafts: FoodMediaDraft[]): EnrichMediaInput[] | undefined {
  const media = drafts.flatMap((draft): EnrichMediaInput[] => {
    if (!draft.base64 || draft.kind === 'barcode') return [];
    return [
      {
        id: draft.id,
        kind: draft.kind,
        base64: draft.base64,
        mimeType: draft.mimeType,
        description: draft.description.trim() || undefined,
      },
    ];
  });
  return media.length ? media : undefined;
}

function withGeneratedDescriptions(
  media: EntryMediaAttachment[] | undefined,
  descriptions: EnrichMediaDescription[] | undefined,
): EntryMediaAttachment[] | undefined {
  if (!media?.length || !descriptions?.length) return media;
  return media.map((item) => {
    if (item.description.trim()) return item;
    const generated = descriptions.find((description) => description.id === item.id)?.description.trim();
    return generated ? { ...item, description: generated } : item;
  });
}

function attachMediaToItems(
  items: FoodItem[],
  media: EntryMediaAttachment[] | undefined,
  allowPositionalFallback: boolean,
): FoodItem[] {
  if (!media?.length) return items;
  const used = new Set<number>();
  const mediaItems = media.map((attachment) => {
    const matched = items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.mediaId === attachment.id);

    if (matched.length) {
      matched.forEach(({ index }) => used.add(index));
      const [first, ...rest] = matched.map(({ item }) => item);
      return rest.reduce<FoodItem>(
        (sum, item) => ({
          ...sum,
          label: sum.label === item.label ? sum.label : `${sum.label}, ${item.label}`,
          calories: sum.calories + item.calories,
          protein: sum.protein + item.protein,
          carbs: sum.carbs + item.carbs,
          fat: sum.fat + item.fat,
          waterMl: sum.waterMl + item.waterMl,
          sugarG: sum.sugarG + item.sugarG,
          fiberG: sum.fiberG + item.fiberG,
          sodiumMg: sum.sodiumMg + item.sodiumMg,
        }),
        { ...first, mediaId: attachment.id },
      );
    }

    const fallbackIndex = allowPositionalFallback
      ? items.findIndex((item, index) => !used.has(index) && !item.mediaId)
      : -1;
    if (fallbackIndex >= 0) {
      used.add(fallbackIndex);
      return { ...items[fallbackIndex], mediaId: attachment.id };
    }

    return {
      label: attachment.description.trim() || t('media.photosAdded'),
      mediaId: attachment.id,
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      waterMl: 0,
      sugarG: 0,
      fiberG: 0,
      sodiumMg: 0,
    };
  });
  const remainingItems = items.filter((_, index) => !used.has(index));
  return [...mediaItems, ...remainingItems];
}

function ensureMediaItems(
  items: FoodItem[],
  media: EntryMediaAttachment[] | undefined,
): FoodItem[] {
  if (!media?.length) return items;
  const existing = new Set(items.map((item) => item.mediaId).filter(Boolean));
  const missing = media
    .filter((attachment) => !existing.has(attachment.id))
    .map((attachment) => ({
      label: attachment.description.trim() || t('media.photosAdded'),
      mediaId: attachment.id,
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      waterMl: 0,
      sugarG: 0,
      fiberG: 0,
      sodiumMg: 0,
    }));
  return [...items, ...missing];
}

function fallbackFoodItemsFromText(text: string): FoodItem[] {
  return text
    .split(/\s*(?:,|;|\+|\n|\be\b|\bcom\b)\s*/i)
    .map((label) => label.trim())
    .filter(Boolean)
    .map((label) => ({
      label,
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      waterMl: 0,
      sugarG: 0,
      fiberG: 0,
      sodiumMg: 0,
    }));
}

function hasTextFoodItem(items: FoodItem[]): boolean {
  return items.some((item) => !item.mediaId);
}

function barcodeFoodData(code: string): FoodData {
  return {
    items: [
      {
        label: `${t('media.barcode')} ${code}`,
        quantity: 1,
        unit: 'unidade',
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        waterMl: 0,
        sugarG: 0,
        fiberG: 0,
        sodiumMg: 0,
      },
    ],
    reasoning: t('media.barcodeReasoning'),
    confidence: 100,
  };
}

export function DayTemplate<TData, TTotals>({
  config,
}: {
  config: DomainConfig<TData, TTotals>;
}) {
  useAppStore((s) => s.lang);
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    date,
    entries,
    canGoNext,
    addEntry,
    editEntry,
    deleteEntry,
    retryEntry,
    undo,
    goPrev,
    goNext,
    goToday,
  } = useDay(config.id);
  const totals = useTotals(entries, config);

  const [undoVisible, setUndoVisible] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [selectedFoodMealSaved, setSelectedFoodMealSaved] = useState(false);
  const [foodReasoningLoadingId, setFoodReasoningLoadingId] = useState<string | null>(null);
  const [foodMediaMenuVisible, setFoodMediaMenuVisible] = useState(false);
  const [foodMediaDrafts, setFoodMediaDrafts] = useState<FoodMediaDraft[]>([]);
  const [savedExerciseEntryIds, setSavedExerciseEntryIds] = useState<Set<string>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoCommand = useRef<Promise<Command> | null>(null);
  const barcodeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingBarcodeDraft = useRef<{ text: string; data: FoodData; imageUri?: string } | null>(null);
  const barcodeCaptureDismissed = useRef(false);
  const barcodeLookupRun = useRef(0);
  const foodReasoningRun = useRef(0);
  const isFood = config.id === 'food';
  const modalStack = useAppModalStore((state) => state.stack);
  const replaceAppModal = useAppModalStore((state) => state.replaceAppModal);
  const closeAppModal = useAppModalStore((state) => state.closeAppModal);
  const activeModal = modalStack.at(-1);
  const activeDomainModal = activeModal?.domain === config.id ? activeModal : null;
  const foodGoalsVisible = activeDomainModal?.id === 'food.goals';
  const workoutProgressVisible = activeDomainModal?.id === 'workout.progress';
  const foodDetailModal = [...modalStack]
    .reverse()
    .find(
      (item) =>
        item.domain === 'food' &&
        (item.id === 'food.entryDetail' ||
          item.id === 'food.actionMenu' ||
          item.id === 'food.aiEdit' ||
          item.id === 'food.nutritionEdit'),
    );
  const selectedFoodEntryId =
    foodDetailModal && 'entryId' in foodDetailModal ? foodDetailModal.entryId : null;
  const selectedFoodEntry =
    isFood && selectedFoodEntryId
      ? entries.find((entry) => entry.id === selectedFoodEntryId) ?? null
      : null;
  const barcodeDraft =
    activeDomainModal?.id === 'food.barcodeNutritionEdit' ? activeDomainModal.draft : null;
  const selectedFoodEntryText = selectedFoodEntry?.text ?? '';
  const selectedFoodEntryData = selectedFoodEntry?.data;
  const selectedFoodEntryMedia = selectedFoodEntry?.media;

  const openSettings = useCallback(() => {
    if (!canOpenAppModal('day.root', 'settings.root')) return;
    replaceAppModal({ id: 'settings.root', domain: config.id });
  }, [config.id, replaceAppModal]);

  const openFoodEntryDetails = useCallback((entry: Entry) => {
    if (!canOpenAppModal('day.root', 'food.entryDetail')) return;
    replaceAppModal({ id: 'food.entryDetail', domain: 'food', entryId: entry.id });
  }, [replaceAppModal]);

  const openPantry = useCallback(() => {
    if (!canOpenAppModal('day.root', 'settings.pantry')) return;
    replaceAppModal({ id: 'settings.pantry', domain: 'food' });
  }, [replaceAppModal]);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      show.remove();
      hide.remove();
      if (barcodeTimer.current) clearTimeout(barcodeTimer.current);
    };
  }, []);

  useEffect(() => {
    if (keyboardVisible) {
      closeAppModal('food.goals');
      closeAppModal('workout.progress');
    } else {
      setFoodMediaMenuVisible(false);
    }
  }, [closeAppModal, keyboardVisible]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  useEffect(() => {
    if (!isFood || !selectedFoodEntryId || !selectedFoodEntryData || !('items' in selectedFoodEntryData)) {
      setSelectedFoodMealSaved(false);
      return;
    }
    let active = true;
    setSelectedFoodMealSaved(false);
    void SavedMealRepository.findByEntry(
      selectedFoodEntryId,
      selectedFoodEntryText,
      selectedFoodEntryData as FoodData,
      selectedFoodEntryMedia,
    )
      .then((meal) => {
        if (active) setSelectedFoodMealSaved(Boolean(meal));
      })
      .catch(() => {
        if (active) setSelectedFoodMealSaved(false);
      });
    return () => {
      active = false;
    };
  }, [isFood, selectedFoodEntryData, selectedFoodEntryId, selectedFoodEntryMedia, selectedFoodEntryText]);

  useEffect(() => {
    if (isFood) return;
    let active = true;
    void SavedExerciseRepository.all().then((workouts) => {
      if (!active) return;
      setSavedExerciseEntryIds(
        new Set(workouts.flatMap((workout) => (workout.sourceEntryId ? [workout.sourceEntryId] : []))),
      );
    });
    return () => {
      active = false;
    };
    // Keyed on the day, not on `entries` — `entries` changes on every upsert
    // (each keystroke-driven edit, each enrich resolution), and this is a full
    // table read. The bookmark handler keeps the set in sync within a day.
  }, [isFood, date]);

  const handleDelete = useCallback(
    (entry: Entry) => {
      // Keep the *promise*, assigned synchronously: the toast is on screen the
      // instant the row goes, and tapping undo before the delete resolves still
      // targets the right command. The bus is shared by both verticals, so an
      // untargeted undo could revert whatever the user did next instead.
      undoCommand.current = deleteEntry(entry);
      setUndoVisible(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setUndoVisible(false), UNDO_MS);
    },
    [deleteEntry],
  );

  const handleSaveWorkoutExercise = useCallback(
    async (entry: Entry, saved: boolean) => {
      if (isFood || entry.status !== 'done' || !entry.data || !('sets' in entry.data)) return false;
      if (!saved) {
        await SavedExerciseRepository.deleteBySourceEntryId(entry.id);
        setSavedExerciseEntryIds((current) => {
          const next = new Set(current);
          next.delete(entry.id);
          return next;
        });
        return true;
      }
      const exercises = uniqueWorkoutExerciseNames(
        [{ text: entry.text, data: entry.data as WorkoutData }],
        getLang(),
      );
      const exercise = exercises[0];
      if (!exercise) return false;
      const workout = await SavedExerciseRepository.save('exercise', exercise, [exercise], entry.id);
      if (!workout) return false;
      setSavedExerciseEntryIds((current) => new Set(current).add(entry.id));
      return true;
    },
    [isFood],
  );

  const handleUndo = useCallback(() => {
    const pending = undoCommand.current;
    undoCommand.current = null;
    setUndoVisible(false);
    if (timer.current) clearTimeout(timer.current);
    if (pending) void pending.then((command) => undo(command));
  }, [undo]);

  const handleAddEntry = useCallback(
    (text: string) => {
      if (!isFood) {
        // "monte um treino pra semana" is a request, not a log. Detected
        // locally so an ordinary note never pays for a round trip.
        // No local guess about what the note is: it is added like any other,
        // and the enrich round-trip decides whether it was a log or a request
        // for a plan. Nothing typed can be lost — the note exists first.
        addEntry(text);
        return;
      }
      const drafts = foodMediaDrafts;
      const noteText = text.trim();
      const barcodeData = drafts.flatMap((draft) => draft.data?.items ?? []);
      const barcodeItems = mergeDuplicateFoodItems(barcodeData);
      const photoDrafts = drafts.filter((draft) => !draft.data);
      const mediaText = buildFoodMediaText(photoDrafts);
      const barcodeText = buildBarcodeText(drafts);
      const entryText = noteText || fallbackFoodMediaText(drafts);
      const entryMedia = mediaForEntry(drafts);
      const foodPhotoMedia = entryMedia?.filter((item) => item.kind !== 'barcode');
      const aiMedia = mediaForAi(drafts);
      if (!entryText && barcodeData.length === 0) return;
      setFoodMediaDrafts([]);

      if (barcodeData.length === 0 && !foodPhotoMedia?.length) {
        addEntry(entryText, entryMedia);
        return;
      }

      void (async () => {
        const entry: Entry = {
          id: newId(),
          date,
          domain: 'food',
          text: entryText || t('media.barcode'),
          media: entryMedia,
          status: 'thinking',
          data: null,
          error: null,
          createdAt: Date.now(),
        };
        await EntryRepository.insert(entry);
        useAppStore.getState().upsertEntry('food', entry);

        let parsedFood: FoodData | null = null;
        let describedMedia = entryMedia;
        let enrichFailed = false;

        if (noteText || foodPhotoMedia?.length) {
          try {
            const locale = getLang();
            const response = await enrich({
              domain: 'food',
              // The same router a typed note goes through (`CommandBus.ts:248`).
              // Without it this path defaulted to `parse` — a plain meal parser
              // — so attaching ANY photo or barcode silently disabled the
              // recipe and purchase branches: "receita com isso" beside a photo
              // was logged as a meal that was never eaten.
              intent: 'foodAuto',
              locale,
              text: [noteText, mediaText, barcodeText].filter(Boolean).join('\n') || entryText,
              media: aiMedia,
              userContext: buildOnboardingPromptContext(
                useAppStore.getState().onboardingProfile,
                locale,
              ),
            });
            const parsed = response.ok ? foodSchema.safeParse(response.data) : null;
            parsedFood = parsed?.success && parsed.data.items.length ? parsed.data : null;
            enrichFailed = !response.ok || !parsed?.success;
            describedMedia = response.ok
              ? withGeneratedDescriptions(entryMedia, response.mediaDescriptions)
              : entryMedia;
          } catch {
            parsedFood = null;
            enrichFailed = true;
          }
        }

        // The AI is the only source of numbers here unless a barcode supplied
        // some. Falling through on failure would save a "done" meal whose items
        // are all zeros — a silent 0 kcal lunch. Mark it errored instead.
        // ponytail: no retry affordance for these (NoteRow hides it when the
        // entry has media) because runEnrich only re-sends `text` and would drop
        // the photos. Upgrade path: move this path into CommandBus and re-read
        // media[].uri so a retry can rebuild the composite request.
        if (enrichFailed && barcodeData.length === 0) {
          const failure = {
            media: describedMedia,
            status: 'error' as const,
            error: ENRICH_ERROR.failed,
          };
          await EntryRepository.update(entry.id, failure);
          useAppStore.getState().upsertEntry('food', { ...entry, ...failure });
          return;
        }

        const describedFoodPhotoMedia = describedMedia?.filter((item) => item.kind !== 'barcode');
        const parsedItems = parsedFood?.items ?? [];
        const noteFallbackItems =
          noteText && !hasTextFoodItem(parsedItems) ? fallbackFoodItemsFromText(noteText) : [];
        const confidenceValues = [parsedFood?.confidence].filter(
          (value): value is number => typeof value === 'number',
        );
        const confidence = confidenceValues.length
          ? Math.round(
              confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length,
            )
          : parsedFood
            ? 100
            : barcodeData.length
              ? 100
              : 0;
        const foodItems = ensureMediaItems(
          attachMediaToItems(
            [...parsedItems, ...noteFallbackItems],
            describedFoodPhotoMedia,
            noteText.length === 0,
          ),
          describedFoodPhotoMedia,
        );
        // A recipe's items ARE the finished dish, ingredients folded in. Keeping
        // the scanned product beside them counts the mayonnaise twice: once in
        // the jar, once in the meal made out of it.
        const data = foodSchema.parse({
          items: [...(parsedFood?.recipe ? [] : barcodeItems), ...foodItems],
          reasoning:
            parsedFood?.reasoning ||
            (barcodeData.length ? t('media.barcodeReasoning') : t('details.reasoningFallback')),
          confidence,
        });
        const done: Entry = { ...entry, media: describedMedia, status: 'done', data, error: null };
        await EntryRepository.update(entry.id, {
          media: describedMedia,
          status: 'done',
          data,
          error: null,
        });
        useAppStore.getState().upsertEntry('food', done);
      })();
    },
    [addEntry, date, foodMediaDrafts, isFood],
  );

  const handleSelectFoodMedia = useCallback((action: FoodMediaAction) => {
    if (!canOpenAppModal('day.root', 'food.mediaCapture')) return;
    setFoodMediaMenuVisible(false);
    replaceAppModal({ id: 'food.mediaCapture', domain: 'food', mode: action });
  }, [replaceAppModal]);

  const handlePhotoCaptured = useCallback((photo: {
    kind: 'foodPhoto' | 'menuPhoto';
    uri: string;
    base64?: string;
    mimeType?: string;
  }) => {
    setFoodMediaDrafts((current) => [
      ...current,
      {
        id: newId(),
        kind: photo.kind,
        uri: photo.uri,
        base64: photo.base64,
        mimeType: photo.mimeType,
        description: '',
      },
    ]);
  }, []);

  const openPendingBarcodeDraft = useCallback(() => {
    const draft = pendingBarcodeDraft.current;
    if (!draft || !barcodeCaptureDismissed.current) return;
    if (!canOpenAppModal('food.mediaCapture', 'food.barcodeNutritionEdit')) return;
    if (barcodeTimer.current) clearTimeout(barcodeTimer.current);
    pendingBarcodeDraft.current = null;
    replaceAppModal({ id: 'food.barcodeNutritionEdit', domain: 'food', draft });
    barcodeTimer.current = null;
  }, [replaceAppModal]);

  const handleBarcodeScanned = useCallback((code: string, imageUri?: string) => {
    if (barcodeTimer.current) clearTimeout(barcodeTimer.current);
    const run = barcodeLookupRun.current + 1;
    barcodeLookupRun.current = run;
    barcodeCaptureDismissed.current = false;
    pendingBarcodeDraft.current = null;
    closeAppModal('food.mediaCapture');
    barcodeTimer.current = setTimeout(() => {
      barcodeCaptureDismissed.current = true;
      openPendingBarcodeDraft();
    }, APP_MODAL_TRANSITION_MS);
    void (async () => {
      const product = await lookupOpenFoodFactsProduct(code);
      if (barcodeLookupRun.current !== run) return;
      // The product shot from Open Food Facts is the better picture — a clean
      // front-of-pack image instead of a phone frame of a barcode — so the
      // frame we grabbed is the fallback, not the winner. It used to overwrite
      // the product photo unconditionally, which is why every scanned item
      // showed a picture of its own barcode.
      pendingBarcodeDraft.current = {
        ...(product ?? { text: `${t('media.barcode')} ${code}`, data: barcodeFoodData(code) }),
        imageUri: product?.imageUri ?? imageUri,
      };
      openPendingBarcodeDraft();
    })();
  }, [closeAppModal, openPendingBarcodeDraft]);

  const handleFoodCaptureDismiss = useCallback(() => {
    barcodeCaptureDismissed.current = true;
    openPendingBarcodeDraft();
  }, [openPendingBarcodeDraft]);

  const handleSaveBarcodeFood = useCallback(
    async (text: string, data: FoodData) => {
      const id = newId();
      const parsedData = foodSchema.parse({
        ...data,
        items: data.items.map((item) => ({ ...item, mediaId: item.mediaId ?? id })),
        reasoning: data.reasoning ?? t('media.barcodeReasoning'),
        confidence: data.confidence ?? 100,
      });
      setFoodMediaDrafts((current) => [
        ...current,
        { id, kind: 'barcode', uri: barcodeDraft?.imageUri, description: text, data: parsedData },
      ]);
      // Back to the scanner, the way the photo modes never leave it. Scanning a
      // shop's worth of items meant reopening the camera from the menu every
      // time, and the thumbnail strip beside the shutter — which is fed by
      // exactly these drafts — could never show a single one, because the
      // camera was always gone by the time the draft existed.
      replaceAppModal({ id: 'food.mediaCapture', domain: 'food', mode: 'barcode' });
    },
    [barcodeDraft?.imageUri, replaceAppModal],
  );

  const handleDeleteFoodEntry = useCallback(
    (entry: Entry) => {
      closeAppModal();
      closeAppModal('food.entryDetail');
      handleDelete(entry);
    },
    [closeAppModal, handleDelete],
  );

  const handleSaveFoodNutrition = useCallback(
    async (entry: Entry, text: string, data: FoodData) => {
      const updated: Entry = { ...entry, text, data, status: 'done', error: null };
      const needsReasoning = !data.reasoning;
      const reasoningRun = needsReasoning ? foodReasoningRun.current + 1 : foodReasoningRun.current;

      if (needsReasoning) {
        foodReasoningRun.current = reasoningRun;
        setFoodReasoningLoadingId(entry.id);
      }

      await EntryRepository.update(entry.id, {
        text,
        data,
        status: 'done',
        error: null,
      });
      useAppStore.getState().upsertEntry('food', updated);

      if (!needsReasoning) return;

      void (async () => {
        const saveAiRefresh = async (reasoning: string, confidence?: number, description?: string) => {
          if (foodReasoningRun.current !== reasoningRun) return;

          const latest = useAppStore.getState().food.entries.find((item) => item.id === entry.id);
          const latestData =
            latest?.data && 'items' in latest.data ? foodSchema.parse(latest.data) : data;
          const refreshedData = foodSchema.parse({ ...latestData, reasoning, confidence });
          const refreshedText = description?.trim() || latest?.text || text;
          const refreshed: Entry = { ...(latest ?? updated), text: refreshedText, data: refreshedData };
          await EntryRepository.update(entry.id, { text: refreshedText, data: refreshedData });
          useAppStore.getState().upsertEntry('food', refreshed);
        };

        try {
          const locale = getLang();
          const response = await enrich({
            domain: 'food',
            intent: 'foodEdit',
            currentFood: data,
            locale,
            userContext: buildOnboardingPromptContext(
              useAppStore.getState().onboardingProfile,
              locale,
            ),
            text: REFRESH_REASONING_INSTRUCTION,
          });
          if (!response.ok) throw new Error(response.error);

          const parsed = foodEditSchema.safeParse(response.data);
          if (!parsed.success || !parsed.data.meal.reasoning) {
            throw new Error('Invalid AI reasoning response');
          }

          await saveAiRefresh(
            parsed.data.meal.reasoning,
            parsed.data.meal.confidence,
            parsed.data.description,
          );
        } catch (error) {
          console.warn('Failed to refresh food reasoning', error);
          await saveAiRefresh(t('details.reasoningFallback'));
        } finally {
          if (foodReasoningRun.current === reasoningRun) {
            setFoodReasoningLoadingId((current) => (current === entry.id ? null : current));
          }
        }
      })();
    },
    [],
  );

  const handleSaveMeal = useCallback(async (entry: Entry) => {
    if (!entry.data || !('items' in entry.data)) return;
    await SavedMealRepository.save(entry.text, entry.data as FoodData, entry.media, entry.id);
    if (selectedFoodEntryId === entry.id) setSelectedFoodMealSaved(true);
  }, [selectedFoodEntryId]);

  const openSavedMealPicker = useCallback(() => {
    if (!canOpenAppModal('day.root', 'food.savedMealPicker')) return;
    Keyboard.dismiss();
    setFoodMediaMenuVisible(false);
    replaceAppModal({ id: 'food.savedMealPicker', domain: 'food' });
  }, [replaceAppModal]);

  const routineItems = useMemo(
    () => routineItemsFor(config.id, entries, getLang()),
    [config.id, entries],
  );

  const openSaveRoutine = useCallback(() => {
    if (!canOpenAppModal('day.root', 'day.saveRoutine')) return;
    Keyboard.dismiss();
    replaceAppModal({ id: 'day.saveRoutine', domain: config.id });
  }, [config.id, replaceAppModal]);

  const handleSaveRoutine = useCallback(
    (name: string, weekday: Weekday | null) => {
      closeAppModal('day.saveRoutine');
      void SavedRoutineRepository.save(config.id, name, routineItems, weekday, date);
    },
    [closeAppModal, config.id, date, routineItems],
  );

  const openSavedExercisePicker = useCallback(() => {
    if (!canOpenAppModal('day.root', 'workout.savedExercisePicker')) return;
    Keyboard.dismiss();
    replaceAppModal({ id: 'workout.savedExercisePicker', domain: 'workout' });
  }, [replaceAppModal]);

  const handleSelectSavedMeals = useCallback((meals: SavedMeal[]) => {
    closeAppModal('food.savedMealPicker');
    const now = Date.now();
    const entries = meals.map((meal, index): Entry => ({
      id: newId(),
      date,
      domain: 'food',
      text: meal.name,
      media: meal.media,
      status: 'done',
      data: meal.data,
      error: null,
      createdAt: now + index,
    }));
    void (async () => {
      await EntryRepository.insertMany(entries);
      entries.forEach((entry) => useAppStore.getState().upsertEntry('food', entry));
    })();
  }, [closeAppModal, date]);

  const handleSelectSavedExercises = useCallback((workouts: SavedExercise[]) => {
    closeAppModal('workout.savedExercisePicker');
    workouts.forEach((workout) => {
      workout.exercises.forEach((exercise) => addEntry(exercise));
    });
  }, [addEntry, closeAppModal]);

  const handleFoodAiEdit = useCallback(
    async (entry: Entry, instruction: string) => {
      if (!entry.data || !('items' in entry.data)) return;
      const locale = getLang();
      const currentFood = foodSchema.parse(entry.data);
      const response = await enrich({
        domain: 'food',
        intent: 'foodEdit',
        currentFood,
        locale,
        userContext: buildOnboardingPromptContext(
          useAppStore.getState().onboardingProfile,
          locale,
        ),
        text: instruction,
      });
      if (!response.ok) throw new Error(response.error);
      const parsed = foodEditSchema.safeParse(response.data);
      if (!parsed.success) throw new Error('Invalid AI edit response');
      await handleSaveFoodNutrition(
        entry,
        parsed.data.description ?? entry.text,
        mergeFoodEdit(currentFood, parsed.data, instruction),
      );
    },
    [handleSaveFoodNutrition],
  );

  const totalItems = config.describeTotals(totals);
  const foodTotals = isFood ? (totals as FoodTotals) : null;
  const footerPaddingBottom = keyboardVisible ? Spacing.two : insets.bottom + TAB_BAR_CLEARANCE;
  const toggleFoodGoals = () => {
    if (!canOpenAppModal('day.root', 'food.goals')) return;
    if (foodGoalsVisible) closeAppModal('food.goals');
    else replaceAppModal({ id: 'food.goals', domain: 'food' });
  };
  const toggleWorkoutProgress = () => {
    if (!canOpenAppModal('day.root', 'workout.progress')) return;
    if (workoutProgressVisible) closeAppModal('workout.progress');
    else replaceAppModal({ id: 'workout.progress', domain: 'workout' });
  };
  const dismissStatsPanelResponder = useCallback(() => {
    if (!foodGoalsVisible && !workoutProgressVisible) return false;
    closeAppModal('food.goals');
    closeAppModal('workout.progress');
    return true;
  }, [closeAppModal, foodGoalsVisible, workoutProgressVisible]);

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View
          style={styles.paddedHeader}
          onStartShouldSetResponderCapture={dismissStatsPanelResponder}>
          <DayHeader
            onSaveDay={openSaveRoutine}
            canSaveDay={routineItems.length > 0}
            date={date}
            canNext={canGoNext}
            onPrev={goPrev}
            onNext={goNext}
            onToday={goToday}
            onOpenSettings={openSettings}
          />
        </View>

        <View
          style={styles.paddedBody}
          onStartShouldSetResponderCapture={dismissStatsPanelResponder}>
          <NotesList
            entries={entries}
            config={config}
            keyboardVisible={keyboardVisible}
            canAddEmpty={isFood && foodMediaDrafts.length > 0}
            mediaDrafts={isFood ? foodMediaDrafts : undefined}
            onChangeMediaDescription={(id, description) =>
              setFoodMediaDrafts((current) =>
                current.map((draft) => (draft.id === id ? { ...draft, description } : draft)),
              )
            }
            onRemoveMediaDraft={(id) =>
              setFoodMediaDrafts((current) => current.filter((draft) => draft.id !== id))
            }
            onAdd={handleAddEntry}
            onEdit={editEntry}
            onDelete={handleDelete}
            onRetry={retryEntry}
            onSaveExercise={!isFood ? handleSaveWorkoutExercise : undefined}
            savedExerciseEntryIds={!isFood ? savedExerciseEntryIds : undefined}
            onOpenFoodDetails={isFood ? openFoodEntryDetails : undefined}
            onOpenPantry={isFood ? openPantry : undefined}
          />
        </View>

        <View style={[styles.footer, { paddingBottom: footerPaddingBottom }]}>
          {undoVisible ? <UndoToast label={t('undo.deleted')} onUndo={handleUndo} /> : null}

          <View style={styles.footerStack}>
            {/* Floating, not stacked. In the flow every one of these panels is a
                block that shoves the dock, the composer and the notes list
                upward the moment it opens — the same reason `OptionMenu` is
                absolute. `box-none` so taps fall through the empty area to the
                list, which is what dismisses them. */}
            <View style={styles.floatingPanels} pointerEvents="box-none">
              {foodTotals ? (
                <FoodGoalsSheet totals={foodTotals} visible={foodGoalsVisible} date={date} />
              ) : null}
              {!isFood ? (
                <WorkoutProgressSheet
                  date={date}
                  entries={entries}
                  visible={workoutProgressVisible}
                />
              ) : null}
              {keyboardVisible && isFood ? (
                <FoodMediaActionMenu
                  visible={foodMediaMenuVisible}
                  onSelect={handleSelectFoodMedia}
                />
              ) : null}
            </View>

            {keyboardVisible ? (
              <>
                <View style={styles.keyboardBar}>
                  <View style={styles.keyboardDock}>
                    <TotalsDock
                      items={
                        isFood
                          ? totalItems.filter((item) => item.key === 'cal' || item.key === 'h')
                          : totalItems.filter(
                              (item) =>
                                item.key === 'sets' || item.key === 'vol' || item.key === 'dist',
                            )
                      }
                      compact
                    />
                  </View>

                  {isFood ? (
                    <>
                      <LoggedPressable
                        onPress={() => setFoodMediaMenuVisible((current) => !current)}
                        hitSlop={10}
                        accessibilityRole="button"
                        accessibilityLabel={t('media.addAttachment')}>
                        <GlassSurface glass="regular" isInteractive style={styles.keyboardButton}>
                          <AppIcon name="camera" color={colors.carbs} size={20} />
                        </GlassSurface>
                      </LoggedPressable>

                      <LoggedPressable
                        onPress={openSavedMealPicker}
                        hitSlop={10}
                        accessibilityRole="button"
                        accessibilityLabel={t('media.addSavedMeal')}>
                        <GlassSurface glass="regular" isInteractive style={styles.keyboardButton}>
                          <AppIcon name="plus" color={colors.accent} size={20} />
                        </GlassSurface>
                      </LoggedPressable>
                    </>
                  ) : (
                    <LoggedPressable
                      onPress={openSavedExercisePicker}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel={t('media.addSavedWorkout')}>
                      <GlassSurface glass="regular" isInteractive style={styles.keyboardButton}>
                        <AppIcon name="plus" color={colors.accent} size={20} />
                      </GlassSurface>
                    </LoggedPressable>
                  )}

                  {Platform.OS === 'ios' ? (
                    <LoggedPressable
                      onPress={Keyboard.dismiss}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel="Dismiss keyboard">
                      <GlassSurface glass="regular" isInteractive style={styles.keyboardButton}>
                        <AppIcon name="keyboard" color={colors.textSecondary} size={18} />
                      </GlassSurface>
                    </LoggedPressable>
                  ) : null}
                </View>
              </>
            ) : (
              <TotalsDock
                items={totalItems}
                onPress={isFood ? toggleFoodGoals : toggleWorkoutProgress}
              />
            )}
          </View>
        </View>
      </SafeAreaView>

      <AppModalHost
        domain={config.id}
        entries={entries}
        selectedFoodMealSaved={selectedFoodMealSaved}
        reasoningLoadingId={foodReasoningLoadingId}
        onDeleteFoodEntry={handleDeleteFoodEntry}
        onSaveMeal={handleSaveMeal}
        onSaveNutrition={handleSaveFoodNutrition}
        onAiEdit={handleFoodAiEdit}
        onPhoto={handlePhotoCaptured}
        mediaDrafts={foodMediaDrafts}
        onBarcode={handleBarcodeScanned}
        onFoodCaptureDismiss={handleFoodCaptureDismiss}
        onSaveBarcodeFood={handleSaveBarcodeFood}
        onSelectSavedMeals={handleSelectSavedMeals}
        onSelectSavedExercises={handleSelectSavedExercises}
      />

      <SaveRoutineSheet
        visible={activeDomainModal?.id === 'day.saveRoutine'}
        domain={config.id}
        itemCount={routineItems.length}
        summary={routineItems
          .map((item) => (typeof item === 'string' ? item : item.text))
          .filter(Boolean)
          .join('  ·  ')}
        // The weekday reads better as a routine name than the date does: these
        // get reused, so "Segunda" beats "19 de jul".
        defaultName={t(`weekday.long.${weekdayOf(date)}` as 'weekday.long.0')}
        defaultWeekday={weekdayOf(date)}
        onClose={() => closeAppModal('day.saveRoutine')}
        onSave={handleSaveRoutine}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  safe: {
    flex: 1,
  },
  paddedHeader: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
  },
  paddedBody: {
    flex: 1,
    paddingHorizontal: Spacing.four,
  },
  footer: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
  },
  footerStack: {
    gap: Spacing.four,
  },
  /** Sits on top of the footer instead of above it, so opening one moves nothing. */
  floatingPanels: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: '100%',
    gap: Spacing.two,
    paddingBottom: Spacing.two,
    justifyContent: 'flex-end',
  },
  keyboardBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  keyboardDock: {
    flex: 1,
  },
  keyboardButton: {
    width: Metrics.iconButton,
    height: Metrics.iconButton,
    borderRadius: Radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
