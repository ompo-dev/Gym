import { useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { LoggedPressable } from '@/components/atoms/Logged';

import { AppIcon } from '@/components/atoms/AppIcon';
import { AppText } from '@/components/atoms/AppText';
import { GlassSurface } from '@/components/atoms/GlassSurface';
import { Radii, Spacing } from '@/constants/theme';
import type { Domain } from '@/core/types';
import type { Weekday } from '@/data/SavedRoutineRepository';
import { useColors } from '@/hooks/use-colors';
import { t } from '@/i18n';

import { SheetFrame } from './SheetFrame';

const WEEKDAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6];

interface SaveRoutineSheetProps {
  visible: boolean;
  domain: Domain;
  /** Preview of what is about to be saved, so the user is not saving blind. */
  itemCount: number;
  summary: string;
  defaultName: string;
  defaultWeekday: Weekday;
  onClose: () => void;
  onSave: (name: string, weekday: Weekday | null) => void;
}

export function SaveRoutineSheet({
  visible,
  domain,
  itemCount,
  summary,
  defaultName,
  defaultWeekday,
  onClose,
  onSave,
}: SaveRoutineSheetProps) {
  const colors = useColors();
  const [name, setName] = useState(defaultName);
  const [weekday, setWeekday] = useState<Weekday | null>(defaultWeekday);

  useEffect(() => {
    if (!visible) return;
    setName(defaultName);
    setWeekday(defaultWeekday);
  }, [visible, defaultName, defaultWeekday]);

  const save = () => {
    onSave(name.trim() || defaultName, weekday);
    onClose();
  };

  return (
    <SheetFrame
      visible={visible}
      title={domain === 'food' ? t('routine.saveDiet') : t('routine.saveWorkout')}
      onClose={onClose}
      centerTitle
      keyboardAwareScroll
      hideDefaultClose
      headerLeading={
        <LoggedPressable
          onPress={onClose}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
        >
          <GlassSurface glass="regular" isInteractive style={styles.headerButton}>
            <AppIcon name="x" color={colors.textSecondary} size={18} />
          </GlassSurface>
        </LoggedPressable>
      }
      headerTrailing={
        <LoggedPressable
          onPress={save}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t('settings.done')}
          style={[styles.headerButton, { backgroundColor: colors.accent }]}
        >
          <AppIcon name="check" color="#FFFFFF" size={18} />
        </LoggedPressable>
      }
    >
      <View style={styles.body}>
        <View style={styles.field}>
          <AppText variant="caption" color={colors.textTertiary}>
            {t('routine.name')}
          </AppText>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={defaultName}
            placeholderTextColor={colors.textTertiary}
            style={[styles.input, { backgroundColor: colors.surfaceMuted, color: colors.text }]}
          />
        </View>

        <View style={styles.field}>
          <AppText variant="caption" color={colors.textTertiary}>
            {t('routine.weekday')}
          </AppText>
          <View style={styles.weekRow}>
            {WEEKDAYS.map((day) => {
              const selected = weekday === day;
              return (
                <LoggedPressable
                  key={day}
                  onPress={() => setWeekday(selected ? null : day)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={t(`weekday.long.${day}` as 'weekday.long.0')}
                  style={styles.weekPressable}
                >
                  <View
                    style={[
                      styles.weekPill,
                      {
                        borderColor: selected ? colors.accent : colors.border,
                        backgroundColor: selected ? colors.accent : 'transparent',
                      },
                    ]}
                  >
                    <AppText
                      variant="label"
                      color={selected ? colors.background : colors.textSecondary}
                    >
                      {t(`weekday.short.${day}` as 'weekday.short.0')}
                    </AppText>
                  </View>
                </LoggedPressable>
              );
            })}
          </View>
          <AppText variant="caption" color={colors.textTertiary}>
            {t('routine.weekdayHint')}
          </AppText>
        </View>

        <GlassSurface glass="regular" style={styles.preview}>
          <AppText variant="label">
            {`${itemCount} ${
              domain === 'food' ? t('routine.mealsCount') : t('routine.exercisesCount')
            }`}
          </AppText>
          <AppText variant="caption" color={colors.textSecondary} numberOfLines={3}>
            {summary}
          </AppText>
          <AppText variant="caption" color={colors.textTertiary}>
            {domain === 'food' ? t('routine.dietNote') : t('routine.workoutNote')}
          </AppText>
        </GlassSurface>
      </View>
    </SheetFrame>
  );
}

const styles = StyleSheet.create({
  headerButton: {
    width: 32,
    height: 32,
    borderRadius: Radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  body: {
    gap: Spacing.five,
  },
  field: {
    gap: Spacing.two,
  },
  input: {
    minHeight: 44,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  weekRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  weekPressable: {
    flex: 1,
  },
  weekPill: {
    height: 40,
    borderWidth: 1,
    borderRadius: Radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  preview: {
    gap: Spacing.two,
    padding: Spacing.four,
    borderRadius: Radii.lg,
    overflow: 'hidden',
  },
});
