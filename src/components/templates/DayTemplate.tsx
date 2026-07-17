import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/atoms/AppIcon';
import { GlassSurface } from '@/components/atoms/GlassSurface';
import { UndoToast } from '@/components/molecules/UndoToast';
import { DayHeader } from '@/components/organisms/DayHeader';
import { FoodEntryDetailSheet } from '@/components/organisms/FoodEntryDetailSheet';
import { FoodGoalsSheet } from '@/components/organisms/FoodGoalsSheet';
import {
  FoodMediaActionMenu,
  type FoodMediaAction,
} from '@/components/organisms/FoodMediaActionMenu';
import { FoodMediaCaptureSheet } from '@/components/organisms/FoodMediaCaptureSheet';
import type { FoodMediaDraft } from '@/components/organisms/FoodMediaDraftTray';
import { FoodNutritionEditSheet } from '@/components/organisms/FoodNutritionEditSheet';
import { NotesList } from '@/components/organisms/NotesList';
import { SettingsSheet } from '@/components/organisms/SettingsSheet';
import { TotalsDock } from '@/components/organisms/TotalsDock';
import { Metrics, Radii, Spacing } from '@/constants/theme';
import { enrich } from '@/core/enrich/client';
import type { EnrichMediaDescription, EnrichMediaInput } from '@/core/enrich/types';
import { lookupOpenFoodFactsProduct } from '@/core/food/openFoodFacts';
import { buildOnboardingPromptContext } from '@/core/onboarding';
import type { Entry, EntryMediaAttachment } from '@/core/types';
import { newId } from '@/core/utils';
import { EntryRepository } from '@/data/EntryRepository';
import { SavedMealRepository } from '@/data/SavedMealRepository';
import { mergeDuplicateFoodItems, mergeFoodEdit, type FoodTotals } from '@/domains/food';
import { foodEditSchema, foodSchema, type FoodData, type FoodItem } from '@/domains/schemas';
import type { DomainConfig } from '@/domains/types';
import { useColors } from '@/hooks/use-colors';
import { useDay } from '@/hooks/useDay';
import { useTotals } from '@/hooks/useTotals';
import { getLang, t } from '@/i18n';
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
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [foodGoalsVisible, setFoodGoalsVisible] = useState(false);
  const [selectedFoodEntry, setSelectedFoodEntry] = useState<Entry | null>(null);
  const [foodReasoningLoadingId, setFoodReasoningLoadingId] = useState<string | null>(null);
  const [foodMediaMenuVisible, setFoodMediaMenuVisible] = useState(false);
  const [foodCaptureMode, setFoodCaptureMode] = useState<FoodMediaAction | null>(null);
  const [foodMediaDrafts, setFoodMediaDrafts] = useState<FoodMediaDraft[]>([]);
  const [barcodeDraft, setBarcodeDraft] = useState<{ text: string; data: FoodData; imageUri?: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const barcodeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingBarcodeDraft = useRef<{ text: string; data: FoodData; imageUri?: string } | null>(null);
  const barcodeCaptureDismissed = useRef(false);
  const barcodeLookupRun = useRef(0);
  const foodReasoningRun = useRef(0);
  const isFood = config.id === 'food';

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
    if (keyboardVisible) setFoodGoalsVisible(false);
    else setFoodMediaMenuVisible(false);
  }, [keyboardVisible]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const handleDelete = useCallback(
    (entry: Entry) => {
      deleteEntry(entry);
      setUndoVisible(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setUndoVisible(false), UNDO_MS);
    },
    [deleteEntry],
  );

  const handleUndo = useCallback(() => {
    void undo();
    setUndoVisible(false);
    if (timer.current) clearTimeout(timer.current);
  }, [undo]);

  const handleAddEntry = useCallback(
    (text: string) => {
      if (!isFood) {
        addEntry(text);
        return;
      }
      const drafts = foodMediaDrafts;
      const noteText = text.trim();
      const barcodeData = drafts.flatMap((draft) => draft.data?.items ?? []);
      const barcodeItems = mergeDuplicateFoodItems(barcodeData);
      const photoDrafts = drafts.filter((draft) => !draft.data);
      const mediaText = buildFoodMediaText(photoDrafts);
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

        if (noteText || foodPhotoMedia?.length) {
          try {
            const locale = getLang();
            const response = await enrich({
              domain: 'food',
              locale,
              text: [noteText, mediaText].filter(Boolean).join('\n') || entryText,
              media: aiMedia,
              userContext: buildOnboardingPromptContext(
                useAppStore.getState().onboardingProfile,
                locale,
              ),
            });
            const parsed = response.ok ? foodSchema.safeParse(response.data) : null;
            parsedFood = parsed?.success && parsed.data.items.length ? parsed.data : null;
            describedMedia = response.ok
              ? withGeneratedDescriptions(entryMedia, response.mediaDescriptions)
              : entryMedia;
          } catch {
            parsedFood = null;
          }
        }

        if (barcodeData.length === 0 && !parsedFood && !foodPhotoMedia?.length && !noteText) {
          await EntryRepository.update(entry.id, {
            media: describedMedia,
            status: 'error',
            error: t('details.aiEditFailed'),
          });
          useAppStore.getState().upsertEntry('food', {
            ...entry,
            media: describedMedia,
            status: 'error',
            error: t('details.aiEditFailed'),
          });
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
        const data = foodSchema.parse({
          items: [...barcodeItems, ...foodItems],
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
    setFoodMediaMenuVisible(false);
    setFoodCaptureMode(action);
  }, []);

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
    if (barcodeTimer.current) clearTimeout(barcodeTimer.current);
    pendingBarcodeDraft.current = null;
    setBarcodeDraft(draft);
    barcodeTimer.current = null;
  }, []);

  const handleBarcodeScanned = useCallback((code: string) => {
    if (barcodeTimer.current) clearTimeout(barcodeTimer.current);
    const run = barcodeLookupRun.current + 1;
    barcodeLookupRun.current = run;
    barcodeCaptureDismissed.current = false;
    pendingBarcodeDraft.current = null;
    setFoodCaptureMode(null);
    barcodeTimer.current = setTimeout(() => {
      barcodeCaptureDismissed.current = true;
      openPendingBarcodeDraft();
    }, 900);
    void (async () => {
      const product = await lookupOpenFoodFactsProduct(code);
      if (barcodeLookupRun.current !== run) return;
      pendingBarcodeDraft.current = product ?? {
        text: `${t('media.barcode')} ${code}`,
        data: barcodeFoodData(code),
      };
      openPendingBarcodeDraft();
    })();
  }, [openPendingBarcodeDraft]);

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
      setBarcodeDraft(null);
    },
    [barcodeDraft?.imageUri],
  );

  const handleDeleteFoodEntry = useCallback(
    (entry: Entry) => {
      setSelectedFoodEntry(null);
      handleDelete(entry);
    },
    [handleDelete],
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
      setSelectedFoodEntry(updated);

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
          setSelectedFoodEntry((current) => (current?.id === entry.id ? refreshed : current));
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
    await SavedMealRepository.save(entry.text, entry.data as FoodData);
  }, []);

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
  const toggleFoodGoals = () => setFoodGoalsVisible((current) => !current);

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.paddedHeader}>
          <DayHeader
            date={date}
            canNext={canGoNext}
            onPrev={goPrev}
            onNext={goNext}
            onToday={goToday}
            onOpenSettings={() => setSettingsVisible(true)}
          />
        </View>

        <View style={styles.paddedBody}>
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
            onOpenFoodDetails={isFood ? setSelectedFoodEntry : undefined}
          />
        </View>

        <View style={[styles.footer, { paddingBottom: footerPaddingBottom }]}>
          {undoVisible ? <UndoToast label={t('undo.deleted')} onUndo={handleUndo} /> : null}

          <View style={styles.footerStack}>
            {foodTotals ? <FoodGoalsSheet totals={foodTotals} visible={foodGoalsVisible} /> : null}

            {keyboardVisible ? (
              <>
                {isFood ? (
                  <>
                    <FoodMediaActionMenu
                      visible={foodMediaMenuVisible}
                      onSelect={handleSelectFoodMedia}
                    />
                  </>
                ) : null}

                <View style={styles.keyboardBar}>
                  <View style={styles.keyboardDock}>
                    <TotalsDock
                      items={isFood ? totalItems.filter((item) => item.key === 'cal') : totalItems}
                      compact
                    />
                  </View>

                  {isFood ? (
                    <>
                      <Pressable
                        onPress={() => {}}
                        hitSlop={10}
                        accessibilityRole="button"
                        accessibilityLabel={t('media.microphone')}>
                        <GlassSurface glass="regular" isInteractive style={styles.keyboardButton}>
                          <AppIcon name="mic" color={colors.textSecondary} size={18} />
                        </GlassSurface>
                      </Pressable>

                      <Pressable
                        onPress={() => setFoodMediaMenuVisible((current) => !current)}
                        hitSlop={10}
                        accessibilityRole="button"
                        accessibilityLabel={t('media.addAttachment')}>
                        <GlassSurface glass="regular" isInteractive style={styles.keyboardButton}>
                          <AppIcon name="plus" color={colors.textSecondary} size={20} />
                        </GlassSurface>
                      </Pressable>
                    </>
                  ) : null}

                  {Platform.OS === 'ios' ? (
                    <Pressable
                      onPress={Keyboard.dismiss}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel="Dismiss keyboard">
                      <GlassSurface glass="regular" isInteractive style={styles.keyboardButton}>
                        <AppIcon name="keyboard" color={colors.textSecondary} size={18} />
                      </GlassSurface>
                    </Pressable>
                  ) : null}
                </View>
              </>
            ) : (
              <TotalsDock
                items={totalItems}
                onPress={isFood ? toggleFoodGoals : undefined}
              />
            )}
          </View>
        </View>
      </SafeAreaView>

      <SettingsSheet visible={settingsVisible} onClose={() => setSettingsVisible(false)} />
      <FoodEntryDetailSheet
        visible={selectedFoodEntry !== null}
        onClose={() => setSelectedFoodEntry(null)}
        entry={selectedFoodEntry}
        onDelete={handleDeleteFoodEntry}
        onSaveMeal={handleSaveMeal}
        onSaveNutrition={handleSaveFoodNutrition}
        onAiEdit={handleFoodAiEdit}
        reasoningLoading={selectedFoodEntry?.id === foodReasoningLoadingId}
      />
      <FoodMediaCaptureSheet
        visible={foodCaptureMode !== null}
        mode={foodCaptureMode}
        onClose={() => setFoodCaptureMode(null)}
        onDismiss={handleFoodCaptureDismiss}
        onPhoto={handlePhotoCaptured}
        onBarcode={handleBarcodeScanned}
      />
      {barcodeDraft ? (
        <FoodNutritionEditSheet
          visible
          text={barcodeDraft.text}
          data={barcodeDraft.data}
          saveUnchanged
          onClose={() => setBarcodeDraft(null)}
          onSave={handleSaveBarcodeFood}
        />
      ) : null}
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
