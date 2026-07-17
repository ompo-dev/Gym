import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';

import { AppIcon } from '@/components/atoms/AppIcon';
import { AppText } from '@/components/atoms/AppText';
import { GlassSurface } from '@/components/atoms/GlassSurface';
import { Radii, Spacing } from '@/constants/theme';
import type { EntryMediaAttachment } from '@/core/types';
import { formatFoodQuantity } from '@/domains/food';
import type { FoodData, FoodItem } from '@/domains/schemas';
import { useColors } from '@/hooks/use-colors';
import { t } from '@/i18n';

import { DraftPreview } from './FoodMediaDraftTray';
import { SheetFrame } from './SheetFrame';

interface EditableItem {
  label: string;
  mediaId?: string;
  quantity?: number;
  unit?: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  waterMl: string;
}

type EditableTotals = Omit<EditableItem, 'label'>;

interface FoodNutritionEditSheetProps {
  visible: boolean;
  text: string;
  data: FoodData;
  media?: EntryMediaAttachment[];
  saveUnchanged?: boolean;
  onClose: () => void;
  onSave: (text: string, data: FoodData) => Promise<void> | void;
}

export interface FoodNutritionEditHandle {
  save: () => void;
}

function fromItem(item: FoodItem): EditableItem {
  return {
    label: item.label,
    mediaId: item.mediaId,
    quantity: item.quantity,
    unit: item.unit,
    calories: String(Math.round(item.calories)),
    protein: String(item.protein),
    carbs: String(item.carbs),
    fat: String(item.fat),
    waterMl: String(item.waterMl ?? 0),
  };
}

function readNumber(value: string): number {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function toItem(item: EditableItem): FoodItem {
  return {
    label: item.label.trim() || t('details.itemName'),
    mediaId: item.mediaId,
    quantity: item.quantity,
    unit: item.unit,
    calories: readNumber(item.calories),
    protein: readNumber(item.protein),
    carbs: readNumber(item.carbs),
    fat: readNumber(item.fat),
    waterMl: readNumber(item.waterMl),
  };
}

function fromTotals(item: EditableTotals): FoodItem {
  return {
    label: t('details.totalNutrition'),
    calories: readNumber(item.calories),
    protein: readNumber(item.protein),
    carbs: readNumber(item.carbs),
    fat: readNumber(item.fat),
    waterMl: readNumber(item.waterMl),
  };
}

function sameFoodEdit(a: { text: string; items: FoodItem[] }, b: { text: string; items: FoodItem[] }): boolean {
  return a.text.trim() === b.text.trim() && JSON.stringify(a.items) === JSON.stringify(b.items);
}

function macroCalories(item: Pick<EditableItem, 'protein' | 'carbs' | 'fat'>): string {
  return String(Math.round(readNumber(item.protein) * 4 + readNumber(item.carbs) * 4 + readNumber(item.fat) * 9));
}

function scaleAmount(value: string, ratio: number, decimals = 1): string {
  const scaled = readNumber(value) * ratio;
  return String(Number(scaled.toFixed(decimals)));
}

function formatHydrationDisplay(value: string): { value: string; unit: string } {
  const waterMl = readNumber(value);
  if (waterMl < 1000) return { value, unit: 'ml' };
  const liters = waterMl / 1000;
  return { value: String(Number(liters.toFixed(2))), unit: 'L' };
}

function TextField({
  value,
  onChangeText,
  onBlur,
  onFocus,
  keyboardType = 'default',
  multiline = false,
  editable = true,
  inline = false,
}: {
  value: string;
  onChangeText: (value: string) => void;
  onBlur?: () => void;
  onFocus?: () => void;
  keyboardType?: 'default' | 'numeric';
  multiline?: boolean;
  editable?: boolean;
  inline?: boolean;
}) {
  const colors = useColors();
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      onBlur={onBlur}
      onFocus={onFocus}
      editable={editable}
      keyboardType={keyboardType}
      multiline={multiline}
      numberOfLines={multiline ? 4 : 1}
      textAlignVertical={multiline ? 'top' : 'center'}
      style={[
        inline ? styles.inlineInput : styles.input,
        multiline && styles.textArea,
        {
          backgroundColor: inline ? 'transparent' : colors.backgroundElement,
          color: colors.text,
        },
      ]}
      placeholderTextColor={colors.textTertiary}
      selectionColor={colors.accent}
    />
  );
}

function NutrientInput({
  initial,
  color,
  value,
  onChangeText,
  unit,
  disabled = false,
}: {
  initial: string;
  color: string;
  value: string;
  onChangeText: (value: string) => void;
  unit?: string;
  disabled?: boolean;
}) {
  const colors = useColors();
  const [focused, setFocused] = useState(false);
  const hydrationDisplay = unit === 'ml' && !focused ? formatHydrationDisplay(value) : null;
  const shownValue = hydrationDisplay?.value ?? value;
  const shownUnit = hydrationDisplay?.unit ?? unit;

  return (
    <View style={[styles.nutrientField, disabled && styles.disabledField]}>
      <AppText variant="label" color={color} style={styles.nutrientInitial}>
        {initial}
      </AppText>
      <AppText variant="caption" color={color} style={styles.nutrientDot}>
        {'•'}
      </AppText>
      <View style={[styles.nutrientInputBox, { backgroundColor: colors.backgroundElement }]}>
        <TextField
          value={shownValue}
          onChangeText={onChangeText}
          onBlur={() => setFocused(false)}
          onFocus={() => setFocused(true)}
          keyboardType="numeric"
          editable={!disabled}
          inline
        />
        {shownUnit ? (
          <AppText variant="caption" color={color} style={styles.unitLabel}>
            {shownUnit}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

function mediaForItem(media: EntryMediaAttachment[] | undefined, item: EditableItem) {
  if (!media?.length || !item.mediaId) return null;
  return media.find((attachment) => attachment.id === item.mediaId) ?? null;
}

export const FoodNutritionEditContent = forwardRef<FoodNutritionEditHandle, Omit<FoodNutritionEditSheetProps, 'visible'>>(
function FoodNutritionEditContent({
  text,
  data,
  media,
  saveUnchanged = false,
  onClose,
  onSave,
}, ref) {
  const colors = useColors();
  const [description, setDescription] = useState(text);
  const [items, setItems] = useState<EditableItem[]>(() => data.items.map(fromItem));
  const [autoCalculateTotal, setAutoCalculateTotal] = useState(true);
  const [autoAdjustCalories, setAutoAdjustCalories] = useState(true);
  const totals = useMemo(
    () =>
      items.map(toItem).reduce(
        (sum, item) => ({
          calories: sum.calories + item.calories,
          protein: sum.protein + item.protein,
          carbs: sum.carbs + item.carbs,
          fat: sum.fat + item.fat,
          waterMl: sum.waterMl + item.waterMl,
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0, waterMl: 0 },
      ),
    [items],
  );
  const [manualTotals, setManualTotals] = useState<EditableTotals>({
    calories: String(Math.round(totals.calories)),
    protein: totals.protein.toFixed(1),
    carbs: totals.carbs.toFixed(1),
    fat: totals.fat.toFixed(1),
    waterMl: String(Math.round(totals.waterMl)),
  });
  const shownTotals = autoCalculateTotal
    ? {
        calories: String(Math.round(totals.calories)),
        protein: totals.protein.toFixed(1),
        carbs: totals.carbs.toFixed(1),
        fat: totals.fat.toFixed(1),
        waterMl: String(Math.round(totals.waterMl)),
      }
    : manualTotals;

  useEffect(() => {
    setDescription(text);
    setItems(data.items.map(fromItem));
  }, [data, text]);

  useEffect(() => {
    if (!autoCalculateTotal) return;
    setManualTotals({
      calories: String(Math.round(totals.calories)),
      protein: totals.protein.toFixed(1),
      carbs: totals.carbs.toFixed(1),
      fat: totals.fat.toFixed(1),
      waterMl: String(Math.round(totals.waterMl)),
    });
  }, [autoCalculateTotal, totals]);

  const updateItem = (index: number, patch: Partial<EditableItem>) => {
    setItems((current) =>
      current.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        const next = { ...item, ...patch };
        if (
          autoAdjustCalories &&
          ('protein' in patch || 'carbs' in patch || 'fat' in patch)
        ) {
          next.calories = macroCalories(next);
        }
        return next;
      }),
    );
  };

  const updateManualTotals = (patch: Partial<EditableTotals>) => {
    setManualTotals((current) => ({ ...current, ...patch }));
  };

  const removeItem = (index: number) => {
    setItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const incrementItemQuantity = (index: number) => {
    setItems((current) =>
      current.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        const currentQuantity = item.quantity ?? 1;
        const nextQuantity = currentQuantity + 1;
        const ratio = nextQuantity / currentQuantity;
        return {
          ...item,
          quantity: nextQuantity,
          calories: scaleAmount(item.calories, ratio, 0),
          protein: scaleAmount(item.protein, ratio),
          carbs: scaleAmount(item.carbs, ratio),
          fat: scaleAmount(item.fat, ratio),
          waterMl: scaleAmount(item.waterMl, ratio, 0),
        };
      }),
    );
  };

  const decrementItemQuantity = (index: number) => {
    setItems((current) =>
      current.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        const currentQuantity = item.quantity ?? 1;
        if (currentQuantity <= 1) return item;
        const nextQuantity = currentQuantity - 1;
        const ratio = nextQuantity / currentQuantity;
        return {
          ...item,
          quantity: nextQuantity > 1 ? nextQuantity : undefined,
          calories: scaleAmount(item.calories, ratio, 0),
          protein: scaleAmount(item.protein, ratio),
          carbs: scaleAmount(item.carbs, ratio),
          fat: scaleAmount(item.fat, ratio),
          waterMl: scaleAmount(item.waterMl, ratio, 0),
        };
      }),
    );
  };

  const addItem = () => {
    setItems((current) => [
      ...current,
      { label: '', calories: '0', protein: '0', carbs: '0', fat: '0', waterMl: '0' },
    ]);
  };

  const handleSave = useCallback(async () => {
    const nextText = description.trim() || text;
    const nextItems = autoCalculateTotal
      ? items.map(toItem).filter((item) => item.label.trim().length > 0)
      : [{ ...fromTotals(manualTotals), label: nextText }];
    const savedItems = nextItems;

    const originalItems = data.items.map((item) => toItem(fromItem(item)));
    if (!saveUnchanged && sameFoodEdit({ text, items: originalItems }, { text: nextText, items: savedItems })) {
      onClose();
      return;
    }

    await onSave(nextText, {
      ...data,
      items: savedItems,
      reasoning: undefined,
      confidence: undefined,
    });
    onClose();
  }, [autoCalculateTotal, data, description, items, manualTotals, onClose, onSave, saveUnchanged, text]);

  useImperativeHandle(ref, () => ({ save: handleSave }), [handleSave]);

  return (
    <>
      <View style={styles.section}>
        <AppText variant="heading" color={colors.textSecondary}>
          {t('details.foodDescription')}
        </AppText>
        <TextField value={description} onChangeText={setDescription} multiline />
      </View>

      <GlassSurface glass="regular" style={styles.toggleCard}>
        <View style={styles.toggleRow}>
          <AppText variant="body">{t('details.autoCalculateTotal')}</AppText>
          <Switch
            value={autoCalculateTotal}
            onValueChange={setAutoCalculateTotal}
            trackColor={{ true: colors.success, false: colors.backgroundSelected }}
          />
        </View>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <View style={styles.toggleRow}>
          <View style={styles.toggleText}>
            <AppText variant="body">{t('details.autoAdjustItemCalories')}</AppText>
            <AppText variant="secondary" color={colors.textSecondary}>
              {t('details.autoAdjustItemCaloriesHint')}
            </AppText>
          </View>
          <Switch
            value={autoAdjustCalories}
            onValueChange={setAutoAdjustCalories}
            trackColor={{ true: colors.success, false: colors.backgroundSelected }}
          />
        </View>
      </GlassSurface>

      <View style={styles.section}>
        <AppText variant="heading" color={colors.textSecondary}>
          {t('details.totalNutrition')}
        </AppText>
        <GlassSurface
          glass="regular"
          style={[styles.card, autoCalculateTotal && styles.disabledCard]}>
          <View style={styles.pairedGrid}>
            <NutrientInput
              initial="C"
              color={colors.calories}
              value={shownTotals.calories}
              onChangeText={(value) => updateManualTotals({ calories: value })}
              disabled={autoCalculateTotal}
            />
            <NutrientInput
              initial="H"
              color={colors.water}
              value={shownTotals.waterMl}
              onChangeText={(value) => updateManualTotals({ waterMl: value })}
              unit="ml"
              disabled={autoCalculateTotal}
            />
          </View>
          <View style={styles.macroGrid}>
            <NutrientInput
              initial="P"
              color={colors.protein}
              value={shownTotals.protein}
              onChangeText={(value) => updateManualTotals({ protein: value })}
              unit="g"
              disabled={autoCalculateTotal}
            />
            <NutrientInput
              initial="C"
              color={colors.carbs}
              value={shownTotals.carbs}
              onChangeText={(value) => updateManualTotals({ carbs: value })}
              unit="g"
              disabled={autoCalculateTotal}
            />
            <NutrientInput
              initial="G"
              color={colors.fat}
              value={shownTotals.fat}
              onChangeText={(value) => updateManualTotals({ fat: value })}
              unit="g"
              disabled={autoCalculateTotal}
            />
          </View>
        </GlassSurface>
        <AppText variant="secondary" color={colors.textSecondary}>
          {t('details.calculatedFromItems')}
        </AppText>
      </View>

      <View style={styles.section}>
        <AppText variant="heading">{t('details.items')}</AppText>
        {items.map((item, index) => {
          const quantity = formatFoodQuantity(toItem(item));
          const canDecrease = (item.quantity ?? 1) > 1;
          const itemMedia = mediaForItem(media, item);
          return (
          <GlassSurface key={index} glass="regular" style={styles.card}>
            <View style={styles.itemNameHeader}>
              <AppText variant="secondary" color={colors.textSecondary}>
                {t('details.itemName')}
              </AppText>
              {quantity ? (
                <View style={[styles.quantityPill, { backgroundColor: colors.backgroundSelected }]}>
                  <AppText variant="caption" color={colors.textSecondary}>
                    {quantity}
                  </AppText>
                </View>
              ) : null}
            </View>
            <View style={styles.nameInputRow}>
              {itemMedia ? <DraftPreview draft={itemMedia} size={48} /> : null}
              <View style={styles.nameInput}>
                <TextField
                  value={item.label}
                  onChangeText={(value) => updateItem(index, { label: value })}
                />
              </View>
            </View>
            <View style={styles.pairedGrid}>
              <NutrientInput
                initial="C"
                color={colors.calories}
                value={item.calories}
                onChangeText={(value) => updateItem(index, { calories: value })}
              />
              <NutrientInput
                initial="H"
                color={colors.water}
                value={item.waterMl}
                onChangeText={(value) => updateItem(index, { waterMl: value })}
                unit="ml"
              />
            </View>
            <View style={styles.macroGrid}>
              <NutrientInput
                initial="P"
                color={colors.protein}
                value={item.protein}
                onChangeText={(value) => updateItem(index, { protein: value })}
                unit="g"
              />
              <NutrientInput
                initial="C"
                color={colors.carbs}
                value={item.carbs}
                onChangeText={(value) => updateItem(index, { carbs: value })}
                unit="g"
              />
              <NutrientInput
                initial="G"
                color={colors.fat}
                value={item.fat}
                onChangeText={(value) => updateItem(index, { fat: value })}
                unit="g"
              />
            </View>
            <View style={styles.itemActions}>
              <Pressable
                onPress={() => removeItem(index)}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.removeButton,
                  { backgroundColor: `${colors.danger}24` },
                  pressed && styles.pressed,
                ]}>
                <AppText variant="label" color={colors.danger}>
                  {t('details.removeItem')}
                </AppText>
              </Pressable>

              <Pressable
                onPress={() => decrementItemQuantity(index)}
                accessibilityRole="button"
                accessibilityLabel={t('details.removeQuantity')}
                disabled={!canDecrease}
                style={({ pressed }) => [
                  styles.quantityButton,
                  { backgroundColor: `${colors.textSecondary}18` },
                  !canDecrease && styles.disabledAction,
                  pressed && styles.pressed,
                ]}>
                <AppIcon name="minus" color={colors.textSecondary} size={20} />
              </Pressable>

              <Pressable
                onPress={() => incrementItemQuantity(index)}
                accessibilityRole="button"
                accessibilityLabel={t('details.addQuantity')}
                style={({ pressed }) => [
                  styles.quantityButton,
                  { backgroundColor: `${colors.accent}24` },
                  pressed && styles.pressed,
                ]}>
                <AppIcon name="plus" color={colors.accent} size={20} />
              </Pressable>
            </View>
          </GlassSurface>
          );
        })}
        <Pressable
          onPress={addItem}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.addButton,
            { backgroundColor: colors.backgroundElement },
            pressed && styles.pressed,
          ]}>
          <AppIcon name="plus" color={colors.accent} size={18} />
          <AppText variant="label" color={colors.accent}>
            {t('details.addItem')}
          </AppText>
        </Pressable>
      </View>
    </>
  );
});

export function FoodNutritionEditSheet({
  visible,
  text,
  data,
  media,
  saveUnchanged,
  onClose,
  onSave,
}: FoodNutritionEditSheetProps) {
  const colors = useColors();
  const editorRef = useRef<FoodNutritionEditHandle>(null);
  const closeButton = (
    <Pressable
      onPress={onClose}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={t('common.close')}>
      <GlassSurface glass="regular" isInteractive style={styles.saveButton}>
        <AppIcon name="x" color={colors.textSecondary} size={24} />
      </GlassSurface>
    </Pressable>
  );

  return (
    <SheetFrame
      visible={visible}
      title={t('details.editManually')}
      onClose={onClose}
      size="full"
      centerTitle
      keyboardAwareScroll
      headerLeading={closeButton}
      hideDefaultClose
      headerTrailing={
        <Pressable
          onPress={() => void editorRef.current?.save()}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t('settings.done')}>
          <View style={[styles.saveButton, { backgroundColor: colors.success }]}>
            <AppIcon name="check" color="#FFFFFF" size={22} />
          </View>
        </Pressable>
      }>
      <FoodNutritionEditContent
        ref={editorRef}
        text={text}
        data={data}
        media={media}
        saveUnchanged={saveUnchanged}
        onClose={onClose}
        onSave={onSave}
      />
    </SheetFrame>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.three,
  },
  card: {
    borderRadius: Radii.lg,
    padding: Spacing.four,
    gap: Spacing.three,
    overflow: 'hidden',
  },
  disabledCard: {
    opacity: 0.55,
  },
  input: {
    minHeight: 48,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.three,
    fontSize: 18,
  },
  inlineInput: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: Spacing.two,
    fontSize: 17,
  },
  textArea: {
    minHeight: 140,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.three,
  },
  pairedGrid: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  macroGrid: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  nutrientField: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  disabledField: {
    opacity: 0.9,
  },
  nutrientInitial: {
    width: 14,
    textAlign: 'center',
  },
  nutrientDot: {
    width: 8,
    textAlign: 'center',
  },
  nutrientInputBox: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radii.sm,
    paddingRight: Spacing.two,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  unitLabel: {
    minWidth: 12,
    textAlign: 'right',
  },
  saveButton: {
    width: 46,
    height: 46,
    borderRadius: Radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleCard: {
    borderRadius: Radii.lg,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    gap: Spacing.three,
    overflow: 'hidden',
  },
  toggleRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  toggleText: {
    flex: 1,
    gap: Spacing.one,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  addButton: {
    minHeight: 58,
    borderRadius: Radii.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  removeButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: Radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemActions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  itemNameHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  nameInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  nameInput: {
    flex: 1,
    minWidth: 0,
  },
  quantityPill: {
    borderRadius: Radii.pill,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
  quantityButton: {
    width: 58,
    minHeight: 52,
    borderRadius: Radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.65,
  },
  disabledAction: {
    opacity: 0.35,
  },
});
