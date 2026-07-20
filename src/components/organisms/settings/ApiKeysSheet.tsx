import { useEffect, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";

import { AppIcon } from "@/components/atoms/AppIcon";
import { AppText } from "@/components/atoms/AppText";
import { SettingsRow } from "@/components/molecules/SettingsRow";
import { Radii, Spacing } from "@/constants/theme";
import type { ApiKeyMode } from "@/core/enrich/types";
import { useColors } from "@/hooks/use-colors";
import { t } from "@/i18n";
import { useAppStore } from "@/store/useAppStore";

import { Divider, PageSheet, Section } from "./primitives";

function ApiKeyField({
  label,
  hint,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const colors = useColors();
  return (
    <View style={styles.apiKeyField}>
      <AppText variant="body">{label}</AppText>
      {hint ? (
        <AppText variant="caption" color={colors.textTertiary}>
          {hint}
        </AppText>
      ) : null}
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        // Not a password field, but the value is a credential — keep it out of
        // the keyboard's learned-words store and off the screen in plain sight.
        secureTextEntry
        style={[
          styles.apiKeyInput,
          { backgroundColor: colors.surfaceMuted, color: colors.text },
        ]}
      />
    </View>
  );
}

export function ApiKeysSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const colors = useColors();
  const apiKeys = useAppStore((s) => s.apiKeys);
  const setApiKeys = useAppStore((s) => s.setApiKeys);
  const [draft, setDraft] = useState(apiKeys);

  useEffect(() => {
    if (visible) setDraft(apiKeys);
  }, [visible, apiKeys]);

  const modes: { value: ApiKeyMode; title: string; subtitle: string }[] = [
    {
      value: "managed",
      title: t("settings.api.managed"),
      subtitle: t("settings.api.managedHint"),
    },
    {
      value: "own",
      title: t("settings.api.own"),
      subtitle: t("settings.api.ownHint"),
    },
  ];

  const save = () => {
    void setApiKeys(draft);
    onClose();
  };

  return (
    <PageSheet
      visible={visible}
      title={t("settings.connect.api")}
      onClose={onClose}
      onSave={save}
      keyboardAwareScroll
    >
      <Section label={t("settings.api.mode")}>
        {modes.map((mode, index) => (
          <View key={mode.value}>
            {index > 0 ? <Divider /> : null}
            <SettingsRow
              title={mode.title}
              subtitle={mode.subtitle}
              trailing={
                draft.mode === mode.value ? (
                  <AppIcon name="check" color={colors.accent} size={18} />
                ) : undefined
              }
              onPress={() =>
                setDraft((current) => ({ ...current, mode: mode.value }))
              }
            />
          </View>
        ))}
      </Section>

      {draft.mode === "own" ? (
        <Section label={t("settings.api.keys")}>
          <ApiKeyField
            label={t("settings.api.chatKey")}
            hint={t("settings.api.chatKeyHint")}
            value={draft.chat}
            placeholder="sk-..."
            onChange={(chat) => setDraft((current) => ({ ...current, chat }))}
          />
          <Divider />
          <ApiKeyField
            label={t("settings.api.imageKey")}
            hint={t("settings.api.imageKeyHint")}
            value={draft.image}
            placeholder={t("settings.api.sameAsChat")}
            onChange={(image) => setDraft((current) => ({ ...current, image }))}
          />
        </Section>
      ) : null}
    </PageSheet>
  );
}

const styles = StyleSheet.create({
  apiKeyField: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  apiKeyInput: {
    minHeight: 44,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
});
