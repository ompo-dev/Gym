import { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  type KeyboardEvent,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { AppIcon } from '@/components/atoms/AppIcon';
import { AppText } from '@/components/atoms/AppText';
import { GlassSurface } from '@/components/atoms/GlassSurface';
import { Metrics, Radii, Spacing } from '@/constants/theme';
import { useColors } from '@/hooks/use-colors';
import { t } from '@/i18n';

interface FoodAiEditSheetProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (instruction: string) => Promise<void> | void;
  onOcclusionChange?: (height: number) => void;
}

export function FoodAiEditSheet({
  visible,
  onClose,
  onSubmit,
  onOcclusionChange,
}: FoodAiEditSheetProps) {
  const colors = useColors();
  const [instruction, setInstruction] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [footerHeight, setFooterHeight] = useState(0);
  const inputRef = useRef<TextInput | null>(null);

  useEffect(() => {
    if (!visible) {
      setInstruction('');
      setError(null);
      setKeyboardHeight(0);
      onOcclusionChange?.(0);
      return;
    }
    const timer = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(timer);
  }, [onOcclusionChange, visible]);

  const handleClose = () => {
    Keyboard.dismiss();
    onClose();
  };

  useEffect(() => {
    if (!visible) return undefined;
    const show = ({ endCoordinates }: KeyboardEvent) => {
      setKeyboardHeight(endCoordinates.height);
    };
    const willShow = Keyboard.addListener('keyboardWillShow', show);
    const didShow = Keyboard.addListener('keyboardDidShow', show);
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));

    return () => {
      willShow.remove();
      didShow.remove();
      hide.remove();
    };
  }, [visible]);

  useEffect(() => {
    onOcclusionChange?.(
      visible && keyboardHeight > 0 ? keyboardHeight + footerHeight + Spacing.two : 0,
    );
  }, [footerHeight, keyboardHeight, onOcclusionChange, visible]);

  useEffect(() => () => onOcclusionChange?.(0), [onOcclusionChange]);

  const handleSubmit = async () => {
    const trimmed = instruction.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit(trimmed);
      setInstruction('');
      setTimeout(() => inputRef.current?.focus(), 0);
    } catch {
      setError(t('details.aiEditFailed'));
    } finally {
      setSaving(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <View
        pointerEvents="box-none"
        style={[styles.host, { bottom: keyboardHeight + Spacing.two }]}>
        <View
          style={styles.footer}
          onLayout={({ nativeEvent }) => setFooterHeight(nativeEvent.layout.height)}>
          {error ? (
            <GlassSurface glass="regular" style={styles.errorBubble}>
              <AppText variant="caption" color={colors.danger}>
                {error}
              </AppText>
            </GlassSurface>
          ) : null}
          <View style={styles.keyboardBar}>
            <View style={styles.keyboardDock}>
              <GlassSurface glass="regular" style={styles.inputDock}>
                <TextInput
                  ref={(node) => {
                    inputRef.current = node;
                  }}
                  value={saving ? t('details.aiEditing') : instruction}
                  onChangeText={(value) => {
                    if (!saving) setInstruction(value);
                  }}
                  returnKeyType="send"
                  submitBehavior="submit"
                  onSubmitEditing={() => void handleSubmit()}
                  style={[styles.input, { color: colors.text }]}
                  placeholder={t('details.aiInstructionPlaceholder')}
                  placeholderTextColor={colors.textTertiary}
                  selectionColor={colors.accent}
                />
              </GlassSurface>
            </View>

            <Pressable
              onPress={handleClose}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}>
              <GlassSurface glass="regular" isInteractive style={styles.keyboardButton}>
                <AppIcon name="keyboard" color={colors.textSecondary} size={18} />
              </GlassSurface>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  footer: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
  },
  keyboardBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  keyboardDock: {
    flex: 1,
  },
  inputDock: {
    height: Metrics.iconButton,
    borderRadius: Radii.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
    overflow: 'hidden',
  },
  input: {
    flex: 1,
    height: Metrics.iconButton,
    paddingHorizontal: Spacing.three,
    paddingVertical: 0,
    fontSize: 17,
  },
  keyboardButton: {
    width: Metrics.iconButton,
    height: Metrics.iconButton,
    borderRadius: Radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  errorBubble: {
    alignSelf: 'center',
    borderRadius: Radii.pill,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    overflow: 'hidden',
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.65,
  },
});
