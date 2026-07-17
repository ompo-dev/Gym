import { Pressable, StyleSheet } from 'react-native';

import { AppIcon, type AppIconName } from '@/components/atoms/AppIcon';
import { AppText } from '@/components/atoms/AppText';
import { GlassSurface } from '@/components/atoms/GlassSurface';
import { Radii, Spacing } from '@/constants/theme';
import { useColors } from '@/hooks/use-colors';
import { t } from '@/i18n';

export type FoodMediaAction = 'foodPhoto' | 'menuPhoto' | 'barcode';
type MediaLabel = Parameters<typeof t>[0];

const actionMeta: Record<FoodMediaAction, { label: MediaLabel; icon: AppIconName }> = {
  foodPhoto: { label: 'media.foodPhoto', icon: 'camera' },
  menuPhoto: { label: 'media.menuPhoto', icon: 'fileText' },
  barcode: { label: 'media.barcode', icon: 'scanBarcode' },
};

export function FoodMediaActionMenu({
  visible,
  onSelect,
}: {
  visible: boolean;
  onSelect: (action: FoodMediaAction) => void;
}) {
  const colors = useColors();
  if (!visible) return null;

  return (
    <GlassSurface glass="regular" style={styles.menu}>
      {(Object.keys(actionMeta) as FoodMediaAction[]).map((action) => (
        <Pressable
          key={action}
          onPress={() => onSelect(action)}
          accessibilityRole="button"
          accessibilityLabel={t(actionMeta[action].label)}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
          <AppIcon name={actionMeta[action].icon} color={colors.textSecondary} size={20} />
          <AppText variant="body">{t(actionMeta[action].label)}</AppText>
        </Pressable>
      ))}
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  menu: {
    alignSelf: 'flex-end',
    minWidth: 240,
    borderRadius: Radii.lg,
    paddingVertical: Spacing.two,
    overflow: 'hidden',
  },
  row: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  pressed: {
    opacity: 0.65,
  },
});
