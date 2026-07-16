import { Pressable, StyleSheet } from 'react-native';

import { AppText } from '@/components/atoms/AppText';
import { GlassSurface } from '@/components/atoms/GlassSurface';
import { Radii, Spacing } from '@/constants/theme';
import { useColors } from '@/hooks/use-colors';
import { t } from '@/i18n';

interface UndoToastProps {
  label: string;
  onUndo: () => void;
}

export function UndoToast({ label, onUndo }: UndoToastProps) {
  const colors = useColors();

  return (
    <GlassSurface glass="regular" style={styles.toast}>
      <AppText variant="secondary">{label}</AppText>
      <Pressable
        onPress={onUndo}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={t('undo.action')}>
        <AppText variant="label" color={colors.accent}>
          {t('undo.action')}
        </AppText>
      </Pressable>
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderRadius: Radii.lg,
    overflow: 'hidden',
  },
});
