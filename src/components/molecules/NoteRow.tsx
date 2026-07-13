import { memo, useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/atoms/AppText';
import { ThinkingIndicator } from '@/components/molecules/ThinkingIndicator';
import { Spacing } from '@/constants/theme';
import type { Entry } from '@/core/types';
import type { DomainConfig } from '@/domains/types';
import { useColors } from '@/hooks/use-colors';
import { t } from '@/i18n';

interface NoteRowProps<TData, TTotals> {
  entry: Entry;
  config: DomainConfig<TData, TTotals>;
  onEdit: (entry: Entry, text: string) => void;
  onDelete: (entry: Entry) => void;
  onRetry: (entry: Entry) => void;
}

function RowStatus<TData, TTotals>({
  entry,
  config,
  onRetry,
}: {
  entry: Entry;
  config: DomainConfig<TData, TTotals>;
  onRetry: (entry: Entry) => void;
}) {
  if (entry.status === 'thinking') return <ThinkingIndicator label={t('status.thinking')} />;
  if (entry.status === 'queued') return <ThinkingIndicator label={t('status.queued')} />;
  if (entry.status === 'error') {
    return (
      <Pressable onPress={() => onRetry(entry)} hitSlop={10} accessibilityRole="button">
        <AppText variant="label" color="#E5484D">
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

/** One editable note line: type to edit (re-enriches), clear to delete. */
function NoteRowInner<TData, TTotals>({
  entry,
  config,
  onEdit,
  onDelete,
  onRetry,
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

  return (
    <View style={styles.row}>
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
        <RowStatus entry={entry} config={config} onRetry={onRetry} />
      </View>
    </View>
  );
}

export const NoteRow = memo(NoteRowInner) as typeof NoteRowInner;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
  },
  input: { flex: 1, fontSize: 17, lineHeight: 24, padding: 0 },
  right: { alignItems: 'flex-end', justifyContent: 'center', paddingTop: 2, minWidth: 60 },
});
