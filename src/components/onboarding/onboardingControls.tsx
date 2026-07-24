import { Picker } from "@react-native-picker/picker";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Modal, ScrollView, StyleSheet, View } from "react-native";

import { LoggedPressable } from "@/components/atoms/Logged";
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

/** Exact by definition, so a round trip kg → lb → kg lands back on itself. */
const LB_PER_KG = 2.2046226218487757;
const KG_PER_LB = 0.45359237;

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
    <LoggedPressable
      style={styles.primaryButton}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}>
      <AppText variant="heading" style={styles.primaryButtonText}>
        {label}
      </AppText>
    </LoggedPressable>
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
  presentation = "modal",
  onClose,
  onPick,
}: {
  lang: "pt-BR" | "en-US";
  text: (typeof copy)["pt-BR"];
  picker: PickerKind | null;
  profile: OnboardingProfile;
  presentation?: "modal" | "overlay";
  onClose: () => void;
  onPick: (kind: PickerKind, value: PickerValue) => void;
}) {
  const { colors, styles } = useOnboardingTheme();
  const activePicker = picker ?? "height";
  const isWeightPicker =
    activePicker === "weight" || activePicker === "goalWeight";
  const [heightUnit, setHeightUnit] = useState<"cm" | "ftin">("cm");
  // Display unit only — the profile always stores kilos, exactly like the
  // height picker offers ft/in while `heightCm` stays centimetres. Converting
  // at the two edges (fill in, read out) keeps one unit in the data.
  const [weightUnit, setWeightUnit] = useState<"kg" | "lb">("kg");
  // Whole part and tenths, in whatever unit is on screen.
  const [weightWholeSelection, setWeightWholeSelection] = useState(0);
  const [weightTenthSelection, setWeightTenthSelection] = useState(0);
  const weightWholeOptions = useMemo(
    () => (weightUnit === "lb" ? range(100, 400, 1) : range(45, 180, 1)),
    [weightUnit],
  );
  const weightTenthOptions = useMemo(() => range(0, 900, 100), []);

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
    const shown = weightUnit === "lb" ? selected * LB_PER_KG : selected;
    const whole = Math.floor(shown);
    setWeightWholeSelection(whole);
    setWeightTenthSelection(Math.round((shown - whole) * 10) * 100);
  }, [isWeightPicker, selected, weightUnit]);

  if (!picker) return null;

  if (IOS_NATIVE_ENABLED && !isWeightPicker && presentation === "modal") {
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

  const content = (
    <View
      style={[
        styles.modalOverlay,
        presentation === "overlay" && StyleSheet.absoluteFill,
      ]}
    >
        <LoggedPressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Fechar"
        />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <AppText variant="heading">{title}</AppText>
            {activePicker === "height" ? (
              <View style={styles.segmented}>
                {(["cm", "ftin"] as const).map((unit) => {
                  const active = heightUnit === unit;
                  return (
                    <LoggedPressable
                      key={unit}
                      onPress={() => setHeightUnit(unit)}
                      accessibilityRole="button"
                      accessibilityLabel={unit}
                      accessibilityState={{ selected: active }}
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
                    </LoggedPressable>
                  );
                })}
              </View>
            ) : null}
            {/* Same affordance the height picker already had — the unit is a
                switch inside the picker, not a question of its own. */}
            {isWeightPicker ? (
              <View style={styles.segmented}>
                {(["kg", "lb"] as const).map((unit) => {
                  const active = weightUnit === unit;
                  return (
                    <LoggedPressable
                      key={unit}
                      onPress={() => setWeightUnit(unit)}
                      accessibilityRole="button"
                      accessibilityLabel={unit}
                      accessibilityState={{ selected: active }}
                      style={[styles.segment, active && styles.segmentActive]}
                    >
                      <AppText
                        variant="label"
                        color={active ? colors.text : colors.textSecondary}
                      >
                        {unit}
                      </AppText>
                    </LoggedPressable>
                  );
                })}
              </View>
            ) : null}
          </View>
          {activePicker !== "goalDate" ? (
            isWeightPicker ? (
              <View style={styles.weightPickerRow}>
                <Picker
                  selectedValue={weightWholeSelection}
                  onValueChange={(value) => setWeightWholeSelection(value)}
                  itemStyle={styles.pickerItem}
                  style={styles.weightPickerColumn}
                >
                  {weightWholeOptions.map((whole) => (
                    <Picker.Item
                      key={whole}
                      label={`${whole} ${weightUnit}`}
                      value={whole}
                      color={colors.text}
                    />
                  ))}
                </Picker>
                <Picker
                  selectedValue={weightTenthSelection}
                  onValueChange={(value) => setWeightTenthSelection(value)}
                  itemStyle={styles.pickerItem}
                  style={styles.weightPickerColumn}
                >
                  {weightTenthOptions.map((tenths) => (
                    <Picker.Item
                      key={tenths}
                      label={weightUnit === "lb" ? `,${tenths / 100}` : `${tenths} g`}
                      value={tenths}
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
                  <LoggedPressable
                    key={String(item.label)}
                    accessibilityRole="button"
                    accessibilityLabel={String(item.label)}
                    accessibilityState={{ selected: active }}
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
                  </LoggedPressable>
                );
              })}
            </ScrollView>
          )}
          <PrimaryButton
            label={text.pickerDone}
            onPress={() => {
              // Back to kilos on the way out, whatever the wheel was showing.
              const shown = weightWholeSelection + weightTenthSelection / 1000;
              const nextValue = isWeightPicker
                ? weightUnit === "lb"
                  ? Math.round(shown * KG_PER_LB * 10) / 10
                  : shown
                : (nativeItems.find((item) => item.nativeValue === iosSelection)
                    ?.value ?? null);
              onPick(activePicker, nextValue);
            }}
          />
        </View>
      </View>
  );

  if (presentation === "overlay") return content;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      {content}
    </Modal>
  );
}

const MONTH_LABELS: Record<'pt-BR' | 'en-US', string[]> = {
  'pt-BR': ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'],
  'en-US': ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Day / month / year wheels using the same inline `Picker` as the weight and
 * height sheets — so the date question feels identical instead of popping the
 * native Android calendar dialog. Composed dates are clamped to the month's
 * real length (no Feb 30) and to min/max.
 */
function DateWheels({
  value,
  lang,
  minimumDate,
  maximumDate,
  onChange,
}: {
  value: string;
  lang: 'pt-BR' | 'en-US';
  minimumDate?: Date;
  maximumDate?: Date;
  onChange: (value: string) => void;
}) {
  const { colors, styles } = useOnboardingTheme();
  const current = isoToDate(value);
  const year = current.getFullYear();
  const month = current.getMonth();
  const day = current.getDate();

  const minYear = minimumDate ? minimumDate.getFullYear() : year - 100;
  const maxYear = maximumDate ? maximumDate.getFullYear() : year + 8;
  const years = Array.from({ length: Math.max(1, maxYear - minYear + 1) }, (_, i) => minYear + i);
  const days = Array.from({ length: daysInMonth(year, month) }, (_, i) => i + 1);

  const commit = (y: number, m: number, d: number) => {
    const clampedDay = Math.min(d, daysInMonth(y, m));
    let next = new Date(y, m, clampedDay);
    if (minimumDate && next < minimumDate) next = minimumDate;
    if (maximumDate && next > maximumDate) next = maximumDate;
    onChange(formatISODate(next));
  };

  return (
    <View style={styles.weightPickerRow}>
      <Picker
        selectedValue={day}
        onValueChange={(v) => commit(year, month, Number(v))}
        itemStyle={styles.pickerItem}
        style={styles.weightPickerColumn}>
        {days.map((d) => (
          <Picker.Item key={d} label={String(d)} value={d} color={colors.text} />
        ))}
      </Picker>
      <Picker
        selectedValue={month}
        onValueChange={(v) => commit(year, Number(v), day)}
        itemStyle={styles.pickerItem}
        style={styles.weightPickerColumn}>
        {MONTH_LABELS[lang].map((name, i) => (
          <Picker.Item key={name} label={name} value={i} color={colors.text} />
        ))}
      </Picker>
      <Picker
        selectedValue={year}
        onValueChange={(v) => commit(Number(v), month, day)}
        itemStyle={styles.pickerItem}
        style={styles.weightPickerColumn}>
        {years.map((y) => (
          <Picker.Item key={y} label={String(y)} value={y} color={colors.text} />
        ))}
      </Picker>
    </View>
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
  presentation = "modal",
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
  presentation?: "modal" | "overlay";
  onChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const { colors, styles } = useOnboardingTheme();

  if (!visible) return null;

  const content = (
    <View
      style={[
        styles.modalOverlay,
        presentation === "overlay" && StyleSheet.absoluteFill,
      ]}
    >
        <LoggedPressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Fechar"
        />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <AppText variant="heading">{title}</AppText>
          </View>
          <DateWheels
            value={value}
            lang={lang}
            minimumDate={minimumDate}
            maximumDate={maximumDate}
            onChange={onChange}
          />
          <PrimaryButton label={buttonLabel} onPress={onSave} />
        </View>
      </View>
  );

  if (presentation === "overlay") return content;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      {content}
    </Modal>
  );
}
