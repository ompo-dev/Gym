import { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { UndoToast } from '@/components/molecules/UndoToast';
import { DayHeader } from '@/components/organisms/DayHeader';
import { NotesList } from '@/components/organisms/NotesList';
import { TotalsDock } from '@/components/organisms/TotalsDock';
import { Spacing } from '@/constants/theme';
import type { Entry } from '@/core/types';
import type { DomainConfig } from '@/domains/types';
import { useColors } from '@/hooks/use-colors';
import { useDay } from '@/hooks/useDay';
import { useTotals } from '@/hooks/useTotals';
import { t } from '@/i18n';

const UNDO_MS = 4_000;
/** Room to clear the floating native glass tab bar (SDK 54 has no height hook). */
const TAB_BAR_CLEARANCE = 64;

/** Domain-agnostic notes-block screen. Diet and Workout are one template + a config. */
export function DayTemplate<TData, TTotals>({
  config,
}: {
  config: DomainConfig<TData, TTotals>;
}) {
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
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.paddedHeader}>
          <DayHeader
            title={config.title}
            date={date}
            canNext={canGoNext}
            onPrev={goPrev}
            onNext={goNext}
            onToday={goToday}
          />
        </View>

        <View style={styles.paddedBody}>
          <NotesList
            entries={entries}
            config={config}
            onAdd={addEntry}
            onEdit={editEntry}
            onDelete={handleDelete}
            onRetry={retryEntry}
          />
        </View>

        <View style={[styles.footer, { paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }]}>
          {undoVisible && <UndoToast label={t('undo.deleted')} onUndo={handleUndo} />}
          <TotalsDock items={config.describeTotals(totals)} />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  paddedHeader: { paddingHorizontal: Spacing.four, paddingTop: Spacing.two },
  paddedBody: { flex: 1, paddingHorizontal: Spacing.four },
  footer: { paddingHorizontal: Spacing.four, gap: Spacing.two },
});
