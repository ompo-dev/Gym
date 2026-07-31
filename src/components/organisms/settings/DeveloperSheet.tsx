import { useState } from "react";
import { Alert } from "react-native";

import { AppIcon } from "@/components/atoms/AppIcon";
import { AppText } from "@/components/atoms/AppText";
import { SettingsRow } from "@/components/molecules/SettingsRow";
import { buildMockEntries } from "@/core/dev/mockData";
import { EntryRepository } from "@/data/EntryRepository";
import { useColors } from "@/hooks/use-colors";

import { Divider, PageSheet, Section, Toggle } from "./primitives";

const DAY_OPTIONS = [
  { label: "7 dias", value: 7 },
  { label: "30 dias", value: 30 },
  { label: "90 dias", value: 90 },
];

export function DeveloperSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const colors = useColors();
  const [days, setDays] = useState(30);
  const [seedFood, setSeedFood] = useState(true);
  const [seedWorkout, setSeedWorkout] = useState(true);

  const seed = async () => {
    const domains: ("food" | "workout")[] = [];
    if (seedFood) domains.push("food");
    if (seedWorkout) domains.push("workout");
    if (domains.length === 0) return;

    const entries = buildMockEntries({ days, domains });
    await EntryRepository.insertMany(entries);
    Alert.alert("Mock Data", `${entries.length} notas criadas`);
  };

  const remove = () => {
    Alert.alert("Remover mocks", "Apagar todas as notas geradas?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Apagar",
        style: "destructive",
        onPress: async () => {
          const deleted = await EntryRepository.deleteByIdPrefix("mock-");
          Alert.alert("Mock Data", `${deleted} notas removidas`);
        },
      },
    ]);
  };

  return (
    <PageSheet
      visible={visible}
      title="Developer"
      onClose={onClose}
      keyboardAwareScroll
    >
      <Section label="Mock Data">
        {DAY_OPTIONS.map((opt, i) => (
          <SettingsRow
            key={opt.value}
            title={opt.label}
            trailing={
              days === opt.value ? (
                <AppIcon name="check" color={colors.accent} size={18} />
              ) : undefined
            }
            onPress={() => setDays(opt.value)}
          />
        ))}
      </Section>

      <Section label="Dominios">
        <SettingsRow
          title="Comida"
          trailing={
            <Toggle
              value={seedFood}
              onValueChange={setSeedFood}
              label="Comida"
            />
          }
        />
        <Divider />
        <SettingsRow
          title="Treino"
          trailing={
            <Toggle
              value={seedWorkout}
              onValueChange={setSeedWorkout}
              label="Treino"
            />
          }
        />
      </Section>

      <Section label="Acoes">
        <SettingsRow
          title="Semear"
          subtitle={`${days} dias, ${[seedFood && "comida", seedWorkout && "treino"].filter(Boolean).join(" + ")}`}
          trailing={<AppIcon name="plus" color={colors.success} size={20} />}
          onPress={seed}
        />
        <Divider />
        <SettingsRow
          title="Remover mocks"
          subtitle="Apaga todas as notas com id prefixo mock-"
          trailing={<AppIcon name="trash" color={colors.danger} size={20} />}
          onPress={remove}
        />
      </Section>
    </PageSheet>
  );
}
