import { useEffect, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { LoggedPressable } from '@/components/atoms/Logged';

import { AppIcon, type AppIconName } from '@/components/atoms/AppIcon';
import { AppText } from '@/components/atoms/AppText';
import { GlassSurface } from '@/components/atoms/GlassSurface';
import { Metrics, Spacing } from '@/constants/theme';
import type { AppModalAnchor } from '@/core/appModals';
import { useColors } from '@/hooks/use-colors';
import { t } from '@/i18n';

export type FoodEntryActionMenuAnchor = AppModalAnchor;

const MENU_WIDTH = 250;
const MENU_RADIUS = 26;

interface FoodEntryActionMenuProps {
  visible: boolean;
  anchor?: FoodEntryActionMenuAnchor | null;
  mealSaved?: boolean;
  onClose: () => void;
  onSaveMeal: () => void;
  onEditWithAi: () => void;
  onEditManually: () => void;
  onDelete: () => void;
}

function ActionRow({
  icon,
  label,
  color,
  iconColor,
  iconFill,
  trailing,
  onPress,
}: {
  icon: AppIconName;
  label: string;
  color?: string;
  iconColor?: string;
  iconFill?: string;
  trailing?: AppIconName;
  onPress: () => void;
}) {
  const colors = useColors();
  const textColor = color ?? colors.text;

  return (
    <LoggedPressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <AppIcon
        name={icon}
        color={iconColor ?? textColor}
        fill={iconFill ?? 'transparent'}
        size={23}
      />
      <AppText variant="body" color={textColor} style={styles.rowText}>
        {label}
      </AppText>
      {trailing ? <AppIcon name={trailing} color={colors.textSecondary} size={22} /> : null}
    </LoggedPressable>
  );
}

export function FoodEntryActionMenu({
  visible,
  anchor,
  mealSaved = false,
  onClose,
  onSaveMeal,
  onEditWithAi,
  onEditManually,
  onDelete,
}: FoodEntryActionMenuProps) {
  const colors = useColors();
  const { width: windowWidth } = useWindowDimensions();
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!visible) setEditing(false);
  }, [visible]);

  const runAndClose = (fn: () => void) => {
    onClose();
    fn();
  };

  if (!visible) return null;

  const menuPosition =
    anchor
      ? {
          top: Math.max(
            Spacing.two,
            Math.round(anchor.y + anchor.height / 2 - MENU_RADIUS)
          ),
          right: Math.max(
            Spacing.two,
            Math.round(windowWidth - (anchor.x + anchor.width / 2 + MENU_RADIUS))
          ),
        }
      : {
          top: Spacing.three + 5 + Spacing.three,
          right: Spacing.four + Metrics.iconButton + Spacing.two,
        };

  return (
    <View style={styles.overlay}>
      <LoggedPressable
        style={StyleSheet.absoluteFill}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t('common.close')}
      />

      <GlassSurface glass="regular" style={[styles.menu, menuPosition]}>
        {editing ? (
          <>
            <ActionRow
              icon="pencil"
              label={t('details.editNutrition')}
              trailing="chevronDown"
              onPress={() => setEditing(false)}
            />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <ActionRow
              icon="sparkles"
              label={t('details.editWithAi')}
              onPress={() => runAndClose(onEditWithAi)}
            />
            <ActionRow
              icon="sliders"
              label={t('details.editManually')}
              onPress={() => runAndClose(onEditManually)}
            />
          </>
        ) : (
          <>
            <ActionRow
              icon="bookmark"
              label={mealSaved ? t('details.mealSaved') : t('details.saveMeal')}
              iconColor={mealSaved ? '#FFFFFF' : undefined}
              iconFill={mealSaved ? '#FFFFFF' : undefined}
              onPress={onSaveMeal}
            />
            <ActionRow
              icon="pencil"
              label={t('details.editNutrition')}
              trailing="chevronRight"
              onPress={() => setEditing(true)}
            />
            <ActionRow
              icon="trash"
              label={t('details.deleteMeal')}
              color={colors.danger}
              onPress={() => runAndClose(onDelete)}
            />
          </>
        )}
      </GlassSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
    elevation: 20,
  },
  menu: {
    position: 'absolute',
    width: MENU_WIDTH,
    borderRadius: MENU_RADIUS,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.five,
    overflow: 'hidden',
  },
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
  },
  rowText: {
    flex: 1,
    fontSize: 18,
    lineHeight: 23,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Spacing.two,
  },
  pressed: {
    opacity: 0.65,
  },
});
