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
import { NotesList } from '@/components/organisms/NotesList';
import { SettingsSheet } from '@/components/organisms/SettingsSheet';
import { TotalsDock } from '@/components/organisms/TotalsDock';
import { Metrics, Radii, Spacing } from '@/constants/theme';
import { enrich } from '@/core/enrich/client';
import { buildOnboardingPromptContext } from '@/core/onboarding';
import type { Entry } from '@/core/types';
import { EntryRepository } from '@/data/EntryRepository';
import { SavedMealRepository } from '@/data/SavedMealRepository';
import type { FoodTotals } from '@/domains/food';
import { foodSchema, type FoodData } from '@/domains/schemas';
import type { DomainConfig } from '@/domains/types';
import { useColors } from '@/hooks/use-colors';
import { useDay } from '@/hooks/useDay';
import { useTotals } from '@/hooks/useTotals';
import { getLang, t } from '@/i18n';
import { useAppStore } from '@/store/useAppStore';

const UNDO_MS = 4_000;
const TAB_BAR_CLEARANCE = 64;

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
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFood = config.id === 'food';

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    if (keyboardVisible) setFoodGoalsVisible(false);
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
      await EntryRepository.update(entry.id, {
        text,
        data,
        status: 'done',
        error: null,
      });
      useAppStore.getState().upsertEntry('food', updated);
      setSelectedFoodEntry(updated);
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
      const response = await enrich({
        domain: 'food',
        locale,
        userContext: buildOnboardingPromptContext(
          useAppStore.getState().onboardingProfile,
          locale,
        ),
        text: [
          'Atualize esta refeicao conforme a instrucao e retorne a refeicao completa.',
          `Instrucao: ${instruction}`,
          `JSON atual: ${JSON.stringify(entry.data)}`,
        ].join('\n'),
      });
      if (!response.ok) return;
      const parsed = foodSchema.safeParse(response.data);
      if (!parsed.success) return;
      await handleSaveFoodNutrition(entry, entry.text, parsed.data);
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
            onAdd={addEntry}
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
              <View style={styles.keyboardBar}>
                <View style={styles.keyboardDock}>
                  <TotalsDock items={totalItems} compact />
                </View>

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
