import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppIcon } from '@/components/atoms/AppIcon';
import { AppText } from '@/components/atoms/AppText';
import { Radii, Spacing } from '@/constants/theme';
import { useColors } from '@/hooks/use-colors';
import { t } from '@/i18n';

import { SheetFrame } from './SheetFrame';

interface FoodAiEditSheetProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (instruction: string) => Promise<void> | void;
}

export function FoodAiEditSheet({ visible, onClose, onSubmit }: FoodAiEditSheetProps) {
  const colors = useColors();
  const [instruction, setInstruction] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) setInstruction('');
  }, [visible]);

  const handleSubmit = async () => {
    const trimmed = instruction.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      await onSubmit(trimmed);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <SheetFrame
      visible={visible}
      title={t('details.editWithAi')}
      onClose={onClose}
      scroll={false}>
      <View style={styles.content}>
        <AppText variant="heading" color={colors.textSecondary}>
          {t('details.aiInstruction')}
        </AppText>
        <TextInput
          value={instruction}
          onChangeText={setInstruction}
          multiline
          style={[
            styles.input,
            { backgroundColor: colors.backgroundElement, color: colors.text },
          ]}
          placeholder={t('details.aiInstructionPlaceholder')}
          placeholderTextColor={colors.textTertiary}
          selectionColor={colors.accent}
        />
        <Pressable
          onPress={handleSubmit}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: colors.accent },
            pressed && styles.pressed,
            (!instruction.trim() || saving) && styles.disabled,
          ]}>
          <AppIcon name="sparkles" color="#FFFFFF" size={18} />
          <AppText variant="label" color="#FFFFFF">
            {t('details.applyAiEdit')}
          </AppText>
        </Pressable>
      </View>
    </SheetFrame>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: Spacing.three,
  },
  input: {
    minHeight: 120,
    borderRadius: Radii.lg,
    padding: Spacing.three,
    fontSize: 17,
    textAlignVertical: 'top',
  },
  button: {
    minHeight: 54,
    borderRadius: Radii.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  disabled: {
    opacity: 0.55,
  },
  pressed: {
    opacity: 0.65,
  },
});
