import DateTimePicker from "@react-native-community/datetimepicker";
import { Picker } from "@react-native-picker/picker";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { AppText } from "@/components/atoms/AppText";
import type { OnboardingProfile } from "@/core/onboarding";
import { copy } from "./onboardingContent";
import {
  IOS_NATIVE_ENABLED,
  SwiftBottomSheet,
  SwiftButton,
  SwiftGroup,
  SwiftHost,
  SwiftPicker,
  SwiftText,
  SwiftVStack,
  presentationDetents,
  presentationDragIndicator,
  swiftButtonStyle,
  swiftControlSize,
  swiftFont,
  swiftForegroundStyle,
  swiftFrame,
  swiftPadding,
  swiftPickerStyle,
  swiftTag,
  swiftTint,
} from "./onboardingNative";
import { useOnboardingTheme } from "./onboardingTheme";
import {
  PICKER_NONE,
  formatHeightFeetInches,
  formatISODate,
  goalDateOptions,
  isoToDate,
  range,
  type PickerKind,
  type PickerValue,
} from "./onboardingUtils";

export function PrimaryButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  const { colors, styles } = useOnboardingTheme();

  if (IOS_NATIVE_ENABLED) {
    return (
      <SwiftHost style={styles.nativePrimaryButtonHost} colorScheme={colors.scheme}>
        <SwiftButton
          label={label}
          onPress={onPress}
          modifiers={[
            swiftButtonStyle("borderedProminent"),
            swiftControlSize("large"),
            swiftTint(colors.accent),
            swiftFrame({ minHeight: 64, maxWidth: 2400 }),
          ]}
        />
      </SwiftHost>
    );
  }

  return (
    <Pressable style={styles.primaryButton} onPress={onPress}>
      <AppText variant="heading" style={styles.primaryButtonText}>
        {label}
      </AppText>
    </Pressable>
  );
}

export function IOSNativeBottomSheet({
  visible,
  title,
  height = 380,
  doneLabel,
  onClose,
  onDone,
  children,
}: {
  visible: boolean;
  title: string;
  height?: number;
  doneLabel: string;
  onClose: () => void;
  onDone: () => void;
  children: ReactNode;
}) {
  const { colors, styles } = useOnboardingTheme();

  if (!visible) return null;

  return (
    <SwiftHost
      style={styles.nativeSheetHost}
      colorScheme={colors.scheme}
      useViewportSizeMeasurement
    >
      <SwiftBottomSheet
        isPresented={visible}
        onIsPresentedChange={(isPresented: boolean) => {
          if (!isPresented) onClose();
        }}
      >
        <SwiftGroup
          modifiers={[
            presentationDetents([{ height }]),
            presentationDragIndicator("visible"),
          ]}
        >
          <SwiftVStack
            spacing={18}
            modifiers={[
              swiftPadding({ top: 10, bottom: 18, leading: 20, trailing: 20 }),
            ]}
          >
            <SwiftText
              modifiers={[
                swiftFont({ size: 17, weight: "bold", design: "rounded" }),
                swiftForegroundStyle(colors.text),
              ]}
            >
              {title}
            </SwiftText>
            {children}
            <SwiftButton
              label={doneLabel}
              onPress={onDone}
              modifiers={[
                swiftButtonStyle("borderedProminent"),
                swiftControlSize("large"),
                swiftTint(colors.accent),
                swiftFrame({ minHeight: 56, maxWidth: 2400 }),
              ]}
            />
          </SwiftVStack>
        </SwiftGroup>
      </SwiftBottomSheet>
    </SwiftHost>
  );
}

export function PickerSheet({
  lang,
  text,
  picker,
  profile,
  onClose,
  onPick,
}: {
  lang: "pt-BR" | "en-US";
  text: (typeof copy)["pt-BR"];
  picker: PickerKind | null;
  profile: OnboardingProfile;
  onClose: () => void;
  onPick: (kind: PickerKind, value: PickerValue) => void;
}) {
  const { colors, styles } = useOnboardingTheme();
  const activePicker = picker ?? "height";
  const isWeightPicker =
    activePicker === "weight" || activePicker === "goalWeight";
  const [heightUnit, setHeightUnit] = useState<"cm" | "ftin">("cm");
  const [weightKgSelection, setWeightKgSelection] = useState(0);
  const [weightGramSelection, setWeightGramSelection] = useState(0);
  const weightKgOptions = useMemo(() => range(45, 180, 1), []);
  const weightGramOptions = useMemo(() => range(0, 900, 100), []);

  const items = useMemo(
    () =>
      activePicker === "height"
        ? range(140, 220, 1).map((value) => ({
            label:
              heightUnit === "cm"
                ? `${value} cm`
                : formatHeightFeetInches(value),
            value,
          }))
        : activePicker === "goalDate"
          ? [
              ...goalDateOptions.map((option) => ({
                label:
                  lang === "pt-BR"
                    ? `Em ${Math.round(option.days / 7)} semanas`
                    : `In ${Math.round(option.days / 7)} weeks`,
                value: option.value,
              })),
              {
                label:
                  lang === "pt-BR" ? "Sem data específica" : "No exact date",
                value: null,
              },
            ]
          : range(45, 180, 0.5).map((value) => ({
              label: `${value.toFixed(1)} kg`,
              value,
            })),
    [activePicker, heightUnit, lang],
  );

  const selected =
    activePicker === "height"
      ? profile.heightCm
      : activePicker === "weight"
        ? profile.weightKg
        : activePicker === "goalWeight"
          ? profile.goalWeightKg
          : profile.goalDate;

  const nativeItems = useMemo(
    () =>
      items.map((item) => ({
        ...item,
        nativeValue: item.value === null ? PICKER_NONE : item.value,
      })),
    [items],
  );

  const title =
    activePicker === "height"
      ? lang === "pt-BR"
        ? "Sua altura"
        : "Your height"
      : activePicker === "weight"
        ? lang === "pt-BR"
          ? "Seu peso"
          : "Your weight"
        : activePicker === "goalWeight"
          ? lang === "pt-BR"
            ? "Seu peso-meta"
            : "Your goal weight"
          : lang === "pt-BR"
            ? "Data-alvo"
            : "Target date";

  const [iosSelection, setIosSelection] = useState<string | number>(
    nativeItems[0]?.nativeValue ?? PICKER_NONE,
  );

  useEffect(() => {
    const nextValue =
      nativeItems.find((item) => item.value === selected)?.nativeValue ??
      nativeItems[0]?.nativeValue ??
      PICKER_NONE;
    setIosSelection(nextValue);
  }, [nativeItems, selected]);

  useEffect(() => {
    if (activePicker !== "height") return;
    setHeightUnit("cm");
  }, [activePicker]);

  useEffect(() => {
    if (!isWeightPicker || typeof selected !== "number") return;
    const kg = Math.floor(selected);
    const grams = Math.round((selected - kg) * 10) * 100;
    setWeightKgSelection(kg);
    setWeightGramSelection(grams);
  }, [isWeightPicker, selected]);

  if (!picker) return null;

  if (IOS_NATIVE_ENABLED && !isWeightPicker) {
    return (
      <IOSNativeBottomSheet
        visible
        title={title}
        height={activePicker === "height" ? 430 : 380}
        doneLabel={text.pickerDone}
        onClose={onClose}
        onDone={() => {
          const nextValue =
            nativeItems.find((item) => item.nativeValue === iosSelection)
              ?.value ?? null;
          onPick(activePicker, nextValue);
        }}
      >
        {activePicker === "height" ? (
          <SwiftPicker
            selection={heightUnit}
            onSelectionChange={(next: string) =>
              setHeightUnit(next as "cm" | "ftin")
            }
            modifiers={[swiftPickerStyle("segmented")]}
          >
            <SwiftText modifiers={[swiftTag("cm")]}>cm</SwiftText>
            <SwiftText modifiers={[swiftTag("ftin")]}>ft/in</SwiftText>
          </SwiftPicker>
        ) : null}
        <SwiftPicker
          selection={iosSelection}
          onSelectionChange={setIosSelection}
          modifiers={[
            swiftPickerStyle("wheel"),
            swiftFrame({ minHeight: 220, maxWidth: 2400 }),
          ]}
        >
          {nativeItems.map((item) => (
            <SwiftText
              key={`${picker}-${item.label}`}
              modifiers={[swiftTag(item.nativeValue)]}
            >
              {item.label}
            </SwiftText>
          ))}
        </SwiftPicker>
      </IOSNativeBottomSheet>
    );
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <AppText variant="heading">{title}</AppText>
            {activePicker === "height" ? (
              <View style={styles.segmented}>
                {(["cm", "ftin"] as const).map((unit) => {
                  const active = heightUnit === unit;
                  return (
                    <Pressable
                      key={unit}
                      onPress={() => setHeightUnit(unit)}
                      style={[styles.segment, active && styles.segmentActive]}
                    >
                      <AppText
                        variant="label"
                        color={
                          active ? colors.text : colors.textSecondary
                        }
                      >
                        {unit === "cm" ? "cm" : "ft/in"}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>
          {activePicker !== "goalDate" ? (
            isWeightPicker ? (
              <View style={styles.weightPickerRow}>
                <Picker
                  selectedValue={weightKgSelection}
                  onValueChange={(value) => setWeightKgSelection(value)}
                  itemStyle={styles.pickerItem}
                  style={styles.weightPickerColumn}
                >
                  {weightKgOptions.map((kg) => (
                    <Picker.Item
                      key={kg}
                      label={`${kg} kg`}
                      value={kg}
                      color={colors.text}
                    />
                  ))}
                </Picker>
                <Picker
                  selectedValue={weightGramSelection}
                  onValueChange={(value) => setWeightGramSelection(value)}
                  itemStyle={styles.pickerItem}
                  style={styles.weightPickerColumn}
                >
                  {weightGramOptions.map((grams) => (
                    <Picker.Item
                      key={grams}
                      label={`${grams} g`}
                      value={grams}
                      color={colors.text}
                    />
                  ))}
                </Picker>
              </View>
            ) : (
              <Picker
                selectedValue={iosSelection}
                onValueChange={(value) => setIosSelection(value)}
                itemStyle={styles.pickerItem}
              >
                {nativeItems.map((item) => (
                  <Picker.Item
                    key={String(item.nativeValue)}
                    label={item.label}
                    value={item.nativeValue}
                    color={colors.text}
                  />
                ))}
              </Picker>
            )
          ) : (
            <ScrollView
              showsVerticalScrollIndicator={false}
              style={styles.sheetScroll}
            >
              {nativeItems.map((item) => {
                const active = item.nativeValue === iosSelection;
                return (
                  <Pressable
                    key={String(item.label)}
                    style={[styles.sheetItem, active && styles.sheetItemActive]}
                    onPress={() => setIosSelection(item.nativeValue)}
                  >
                    <AppText
                      variant="heading"
                      color={
                        active ? colors.text : colors.textSecondary
                      }
                    >
                      {item.label}
                    </AppText>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
          <PrimaryButton
            label={text.pickerDone}
            onPress={() => {
              const nextValue = isWeightPicker
                ? weightKgSelection + weightGramSelection / 1000
                : (nativeItems.find((item) => item.nativeValue === iosSelection)
                    ?.value ?? null);
              onPick(activePicker, nextValue);
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

export function DatePickerSheet({
  visible,
  title,
  lang,
  buttonLabel,
  value,
  minimumDate,
  maximumDate,
  onChange,
  onClose,
  onSave,
}: {
  visible: boolean;
  title: string;
  lang: "pt-BR" | "en-US";
  buttonLabel: string;
  value: string;
  minimumDate?: Date;
  maximumDate?: Date;
  onChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const { colors, styles } = useOnboardingTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <AppText variant="heading">{title}</AppText>
          </View>
          <DateTimePicker
            value={isoToDate(value)}
            mode="date"
            display="spinner"
            themeVariant={colors.scheme}
            locale={lang}
            minimumDate={minimumDate}
            maximumDate={maximumDate}
            onChange={(_event, date) => {
              if (date) onChange(formatISODate(date));
            }}
            style={styles.nativePicker}
          />
          <PrimaryButton label={buttonLabel} onPress={onSave} />
        </View>
      </View>
    </Modal>
  );
}
