import { useState } from 'react';
import { FlatList, StyleSheet, TextInput } from 'react-native';

import { NoteRow } from '@/components/molecules/NoteRow';
import { Spacing } from '@/constants/theme';
import type { Entry } from '@/core/types';
import type { DomainConfig } from '@/domains/types';
import { useColors } from '@/hooks/use-colors';

interface NotesListProps<TData, TTotals> {
  entries: Entry[];
  config: DomainConfig<TData, TTotals>;
  onAdd: (text: string) => void;
  onEdit: (entry: Entry, text: string) => void;
  onDelete: (entry: Entry) => void;
  onRetry: (entry: Entry) => void;
}

/** The trailing "new line" of the notes block — type and hit return to add. */
function NewNoteInput({ placeholder, onAdd }: { placeholder: string; onAdd: (text: string) => void }) {
  const colors = useColors();
  const [text, setText] = useState('');
  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setText('');
  };
  return (
    <TextInput
      value={text}
      onChangeText={setText}
      onSubmitEditing={submit}
      placeholder={placeholder}
      placeholderTextColor={colors.textSecondary}
      returnKeyType="done"
      submitBehavior="submit"
      style={[styles.newInput, { color: colors.text }]}
      accessibilityLabel={placeholder}
    />
  );
}

/** Editable notes block: each line is a note; the last line adds a new one. */
export function NotesList<TData, TTotals>({
  entries,
  config,
  onAdd,
  onEdit,
  onDelete,
  onRetry,
}: NotesListProps<TData, TTotals>) {
  return (
    <FlatList
      style={styles.list}
      data={entries}
      keyExtractor={(e) => e.id}
      renderItem={({ item }) => (
        <NoteRow
          entry={item}
          config={config}
          onEdit={onEdit}
          onDelete={onDelete}
          onRetry={onRetry}
        />
      )}
      ListFooterComponent={<NewNoteInput placeholder={config.placeholder} onAdd={onAdd} />}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      automaticallyAdjustKeyboardInsets
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  content: { paddingBottom: Spacing.four },
  newInput: { fontSize: 17, lineHeight: 24, paddingVertical: Spacing.two },
});
