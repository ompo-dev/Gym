import { useState } from "react";
import { Alert, StyleSheet, TextInput, View } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import * as BackgroundTask from "expo-background-task";

import { AppIcon } from "@/components/atoms/AppIcon";
import { AppText } from "@/components/atoms/AppText";
import { SettingsRow } from "@/components/molecules/SettingsRow";
import { todayISO, setDevDayOffset, getDevDayOffset } from "@/core/date";
import { FEATURE_FLAGS } from "@/core/dev/flags";
import { buildMockEntries } from "@/core/dev/mockData";
import { getLogBuffer, clearLogBuffer, logConfig } from "@/core/log";
import {
  debugFireReminder,
  getScheduledSlots,
  slotLabel,
} from "@/core/notifications/reminders";
import { getStoredTimeZone } from "@/core/timezone";
import { EntryRepository } from "@/data/EntryRepository";
import { addDays, getDevDayOffset as getOffset } from "@/core/date";
import {
  buildRoutine,
  ROUTINE_DAYS,
} from "@/domains/mealTiming";
import type { MealType } from "@/domains/schemas";
import { getLang } from "@/i18n";
import { useColors } from "@/hooks/use-colors";
import { useAppStore } from "@/store/useAppStore";

import { Divider, PageSheet, Section, Toggle } from "./primitives";
import { Spacing, Radii } from "@/constants/theme";

const DAY_OPTIONS = [
  { label: "7 dias", value: 7 },
  { label: "30 dias", value: 30 },
  { label: "90 dias", value: 90 },
];

const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner"];

type FeatureLabel = Record<string, string>;
const FEATURE_LABELS: FeatureLabel = {
  camera: "Câmera",
  savedMeals: "Refeições salvas",
  savedExercises: "Exercícios salvos",
  pantry: "Geladeira",
  workoutMonitor: "Monitor de treino",
  aiEdit: "Editar com IA",
  offlineForce: "Forçar offline",
};

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
  const [notifTitle, setNotifTitle] = useState("");
  const [notifBody, setNotifBody] = useState("");
  const [verbose, setVerbose] = useState(logConfig.verbose);

  const devFlags = useAppStore((s) => s.devFlags);
  const setFeature = useAppStore((s) => s.setFeature);

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

  // ---- notificacoes ---------------------------------------------------------

  const fireNow = async (type: MealType) => {
    await debugFireReminder(type);
    Alert.alert("Notificação", `"${slotLabel(type)}" disparada`);
  };

  const fireCustom = async () => {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") {
      const { status: reqStatus } =
        await Notifications.requestPermissionsAsync();
      if (reqStatus !== "granted") {
        Alert.alert("Erro", "Permissão de notificação negada");
        return;
      }
    }
    await Notifications.scheduleNotificationAsync({
      content: {
        title: notifTitle || "Teste",
        body: notifBody || "Notificação de teste do dev",
      },
      trigger: null,
    });
    Alert.alert("OK", "Notificação disparada");
  };

  const listScheduled = async () => {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const lines = scheduled.map(
      (n) =>
        `${n.identifier}: ${n.trigger ? JSON.stringify(n.trigger) : "imediato"}`,
    );
    Alert.alert(
      `Agendadas (${scheduled.length})`,
      lines.join("\n").slice(0, 4000) || "Nenhuma",
    );
  };

  const showRoutine = async () => {
    const since = addDays(todayISO(), -ROUTINE_DAYS);
    const entries = await EntryRepository.findSince("food", since);
    const routine = buildRoutine(entries);
    const lines: string[] = [];
    for (const [type, slot] of Object.entries(routine)) {
      lines.push(
        `${slotLabel(type as MealType)}: ${slot.hour}:${String(slot.minute).padStart(2, "0")} (${slot.samples} amostras)`,
      );
    }
    Alert.alert(
      "Rotina aprendida",
      lines.length > 0 ? lines.join("\n") : "Nenhum padrão aprendido ainda",
    );
  };

  const triggerBgTask = async () => {
    try {
      await BackgroundTask.triggerTaskWorkerForTestingAsync();
      Alert.alert("OK", "Background task disparada");
    } catch (e: unknown) {
      Alert.alert(
        "Erro",
        e instanceof Error ? e.message : "Falha ao disparar background task",
      );
    }
  };

  // ---- logs -----------------------------------------------------------------

  const showLogs = () => {
    const buffer = getLogBuffer();
    const last50 = buffer.slice(0, 50);
    const text = last50
      .map((e) => `${e.ts} [${e.category}] ${e.event}${e.meta ? " " + e.meta : ""}`)
      .join("\n");
    Alert.alert(
      `Logs (${buffer.length} total, últimos 50)`,
      text.slice(0, 4000) || "Vazio",
    );
  };

  const copyLogs = () => {
    const buffer = getLogBuffer();
    const text = buffer
      .map((e) => `${e.ts} [${e.category}] ${e.event}${e.meta ? " " + e.meta : ""}`)
      .join("\n");
    // ponytail: no clipboard dep — show in Alert, user copies manually.
    Alert.alert(
      `Logs (${buffer.length} entradas)`,
      text.slice(0, 4000) || "Vazio",
    );
  };

  const clearLogs = () => {
    clearLogBuffer();
    Alert.alert("OK", "Logs limpos");
  };

  const toggleVerbose = (v: boolean) => {
    logConfig.verbose = v;
    setVerbose(v);
  };

  // ---- estado ---------------------------------------------------------------

  const showEstado = async () => {
    const pending = await EntryRepository.findPending();
    const offline = useAppStore.getState().isOffline;
    const tz = await getStoredTimeZone();
    const locale = getLang();
    const version = Constants.expoConfig?.version ?? "?";
    const flagsOn = FEATURE_FLAGS.filter((f) => devFlags[f]);
    const flagsOff = FEATURE_FLAGS.filter((f) => !devFlags[f]);
    const text = [
      `Fila pendente: ${pending.length}`,
      `Offline: ${offline}`,
      `Timezone: ${tz}`,
      `Locale: ${locale}`,
      `Versão: ${version}`,
      `Flags ON: ${flagsOn.join(", ") || "(todas off)"}`,
      `Flags OFF: ${flagsOff.join(", ") || "(todas on)"}`,
    ].join("\n");
    Alert.alert("Estado", text);
  };

  // ---- time travel ----------------------------------------------------------

  const adjustDay = (delta: number) => {
    const next = getOffset() + delta;
    setDevDayOffset(next);
    // Force re-render so the label updates — useState setter on a plain number
    // won't trigger without a state variable, so we use a dummy state.
    setTravelTick((t) => t + 1);
  };

  const resetToToday = () => {
    setDevDayOffset(0);
    setTravelTick((t) => t + 1);
  };

  const [travelTick, setTravelTick] = useState(0);

  return (
    <PageSheet
      visible={visible}
      title="Developer"
      onClose={onClose}
      keyboardAwareScroll
    >
      {/* ---- Mock Data (existing) ---- */}
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

      {/* ---- Phase 3: Notificacoes ---- */}
      <Section label="Notificações">
        {MEAL_TYPES.map((type) => (
          <SettingsRow
            key={type}
            title={`Disparar ${slotLabel(type)}`}
            trailing={
              <AppIcon name="bell" color={colors.accent} size={18} />
            }
            onPress={() => fireNow(type)}
          />
        ))}

        <Divider />

        <View style={[styles.notifInputs, { borderColor: colors.border }]}>
          <TextInput
            value={notifTitle}
            onChangeText={setNotifTitle}
            placeholder="Título"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            style={[
              styles.textInput,
              { backgroundColor: colors.surfaceMuted, color: colors.text },
            ]}
          />
          <TextInput
            value={notifBody}
            onChangeText={setNotifBody}
            placeholder="Corpo"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            style={[
              styles.textInput,
              { backgroundColor: colors.surfaceMuted, color: colors.text },
            ]}
          />
        </View>

        <SettingsRow
          title="Disparar custom"
          trailing={
            <AppIcon name="bell" color={colors.accent} size={18} />
          }
          onPress={fireCustom}
        />

        <Divider />

        <SettingsRow
          title="Ver agendadas"
          trailing={
            <AppIcon name="fileText" color={colors.accent} size={18} />
          }
          onPress={listScheduled}
        />

        <Divider />

        <SettingsRow
          title="Rotina aprendida"
          subtitle="Horários que o learner detectou"
          trailing={
            <AppIcon name="clock" color={colors.accent} size={18} />
          }
          onPress={showRoutine}
        />

        <Divider />

        <SettingsRow
          title="Rodar background task"
          subtitle="Dispara enrich-drain + refreshSchedule + nudge"
          trailing={
            <AppIcon name="send" color={colors.success} size={18} />
          }
          onPress={triggerBgTask}
        />
      </Section>

      {/* ---- Phase 4: Features ---- */}
      <Section label="Features">
        {FEATURE_FLAGS.map((flag) => (
          <SettingsRow
            key={flag}
            title={FEATURE_LABELS[flag]}
            trailing={
              <Toggle
                value={devFlags[flag]}
                onValueChange={(v) => setFeature(flag, v)}
                label={FEATURE_LABELS[flag]}
              />
            }
          />
        ))}
      </Section>

      {/* ---- Phase 5: Logs ---- */}
      <Section label="Logs">
        <SettingsRow
          title="Verbose"
          subtitle="Logs de input e scroll (barulhentos)"
          trailing={
            <Toggle
              value={verbose}
              onValueChange={toggleVerbose}
              label="Verbose"
            />
          }
        />

        <Divider />

        <SettingsRow
          title="Ver logs"
          subtitle="Últimos 50 (mais recente primeiro)"
          trailing={
            <AppIcon name="fileText" color={colors.accent} size={18} />
          }
          onPress={showLogs}
        />

        <Divider />

        <SettingsRow
          title="Copiar tudo"
          trailing={
            <AppIcon name="fileText" color={colors.accent} size={18} />
          }
          onPress={copyLogs}
        />

        <Divider />

        <SettingsRow
          title="Limpar logs"
          trailing={
            <AppIcon name="trash" color={colors.danger} size={18} />
          }
          onPress={clearLogs}
        />
      </Section>

      {/* ---- Phase 5: Estado ---- */}
      <Section label="Estado">
        <SettingsRow
          title="Ver estado"
          subtitle="Fila, offline, timezone, locale, versão, flags"
          trailing={
            <AppIcon name="info" color={colors.accent} size={18} />
          }
          onPress={showEstado}
        />
      </Section>

      {/* ---- Phase 5: Time Travel ---- */}
      <Section label="Data">
        <SettingsRow
          title="Hoje efetivo"
          subtitle={todayISO()}
        />

        <Divider />

        <SettingsRow
          title="-1 dia"
          trailing={
            <AppIcon name="chevronLeft" color={colors.accent} size={18} />
          }
          onPress={() => adjustDay(-1)}
        />

        <SettingsRow
          title="Hoje (reset)"
          trailing={
            <AppIcon name="target" color={colors.accent} size={18} />
          }
          onPress={resetToToday}
        />

        <SettingsRow
          title="+1 dia"
          trailing={
            <AppIcon name="chevronRight" color={colors.accent} size={18} />
          }
          onPress={() => adjustDay(1)}
        />
      </Section>
    </PageSheet>
  );
}

const styles = StyleSheet.create({
  notifInputs: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    gap: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  textInput: {
    borderRadius: Radii.sm,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 15,
  },
});
