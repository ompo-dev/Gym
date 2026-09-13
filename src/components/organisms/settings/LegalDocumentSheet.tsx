import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/atoms/AppText';
import { Spacing } from '@/constants/theme';
import { getLegalDocument, type LegalDocumentKind } from '@/core/legal';
import { useColors } from '@/hooks/use-colors';
import { getLang } from '@/i18n';

import { PageSheet } from './primitives';

export function LegalDocumentSheet({
  visible,
  kind,
  onClose,
  nested,
}: {
  visible: boolean;
  kind: LegalDocumentKind;
  onClose: () => void;
  nested?: ReactNode;
}) {
  const colors = useColors();
  const document = getLegalDocument(kind, getLang());

  return (
    <PageSheet visible={visible} title={document.title} onClose={onClose} nested={nested}>
      <View style={styles.content}>
        <View style={styles.header}>
          <AppText variant="caption" color={colors.textTertiary} selectable>
            {document.effectiveDate}
          </AppText>
          <AppText variant="secondary" color={colors.textSecondary} selectable>
            {document.intro}
          </AppText>
        </View>

        {document.sections.map((section) => (
          <View key={section.title} style={styles.section}>
            <AppText variant="label" selectable>
              {section.title}
            </AppText>
            <AppText variant="secondary" color={colors.textSecondary} selectable>
              {section.body}
            </AppText>
          </View>
        ))}
      </View>
    </PageSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: Spacing.five,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
  },
  header: {
    gap: Spacing.two,
  },
  section: {
    gap: Spacing.two,
  },
});
