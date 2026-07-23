import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { LoggedPressable } from '@/components/atoms/Logged';

import { AppIcon, type AppIconName } from '@/components/atoms/AppIcon';
import { ProgressRing } from '@/components/atoms/ProgressRing';
import { AppText } from '@/components/atoms/AppText';
import { GlassSurface } from '@/components/atoms/GlassSurface';
import {
  IOS_NATIVE_ENABLED,
  SwiftButton,
  SwiftDivider,
  SwiftGroup,
  SwiftHost,
  SwiftMenu,
  swiftButtonStyle,
  swiftControlSize,
  swiftFrame,
  swiftLabelStyle,
  swiftMenuActionDismissBehavior,
} from '@/components/onboarding/onboardingNative';
import { Metrics, Radii, Spacing } from '@/constants/theme';
import {
  APP_MODAL_TRANSITION_MS,
  type AppModalAnchor,
  canOpenAppModal,
} from '@/core/appModals';
import { timeLabel } from '@/core/date';
import type { Domain, Entry } from '@/core/types';
import {
  defaultOnboardingProfile,
  enabledMicronutrients,
  type OnboardingMicronutrient,
} from '@/core/onboarding';
import { PantryRepository } from '@/data/PantryRepository';
import { useRepositoryData } from '@/hooks/useRepositoryData';
import { formatFoodQuantity, formatWaterMl, sumFoodData } from '@/domains/food';
import { formatPantryGrams } from '@/domains/pantry';
import type { FoodData } from '@/domains/schemas';
import { useColors } from '@/hooks/use-colors';
import { t } from '@/i18n';
import { useAppModalStore } from '@/store/useAppModalStore';
import { useAppStore } from '@/store/useAppStore';

import { FoodAiEditSheet } from './FoodAiEditSheet';
import { FoodEntryActionMenu } from './FoodEntryActionMenu';
import { DraftPreview } from './FoodMediaDraftTray';
import { FoodRecipeCard } from './FoodRecipeCard';
import { SheetFrame } from './SheetFrame';

type FoodEntryDetailModalScope = 'food' | 'savedMeal';
type FoodEntryChildModal =
  | 'food.aiEdit'
  | 'food.nutritionEdit'
  | 'settings.savedMealAiEdit'
  | 'settings.savedMealNutritionEdit';

interface FoodEntryDetailSheetProps {
  visible: boolean;
  onClose: () => void;
  entry: Entry | null;
  modalScope?: FoodEntryDetailModalScope;
  modalDomain?: Domain;
  onDelete?: (entry: Entry) => void;
  onSaveMeal?: (entry: Entry) => Promise<void> | void;
  onSaveNutrition?: (entry: Entry, text: string, data: FoodData) => Promise<void> | void;
  onAiEdit?: (entry: Entry, instruction: string) => Promise<void> | void;
  reasoningLoading?: boolean;
  initialMealSaved?: boolean;
  /**
   * Rendered straight under the nutrition block. A slot rather than a branch:
   * the pantry puts a price history here, and this sheet has no business
   * knowing what a pantry is.
   */
  belowNutrition?: ReactNode;
}

function MacroStat({
  icon,
  color,
  label,
  value,
}: {
  icon: AppIconName;
  color: string;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.macroStat}>
      <AppText variant="value" style={styles.macroValue}>
        {value}
      </AppText>
      <View style={styles.macroLabel}>
        <AppIcon name={icon} color={color} size={14} />
        <AppText variant="caption" color={color} style={styles.macroLabelText}>
          {label}
        </AppText>
      </View>
    </View>
  );
}

/** Shared by the per-item rows and the meal totals card — both carry the same
 *  three micronutrient fields, so one definition drives both. */
interface MicroSource {
  sugarG: number;
  fiberG: number;
  sodiumMg: number;
}

// `key` doubles as the theme colour token — sugar/fiber/sodium live in the
// palette now, so the row resolves `colors[stat.key]` and no hex is repeated.
const MICRO_STATS: {
  key: OnboardingMicronutrient;
  icon: AppIconName;
  labelKey: 'goals.sugar' | 'goals.fiber' | 'goals.sodium';
  value: (item: MicroSource) => string;
}[] = [
  { key: 'sugar', icon: 'squareStack', labelKey: 'goals.sugar', value: (item) => `${item.sugarG.toFixed(1)} g` },
  { key: 'fiber', icon: 'apple', labelKey: 'goals.fiber', value: (item) => `${item.fiberG.toFixed(1)} g` },
  { key: 'sodium', icon: 'asterisk', labelKey: 'goals.sodium', value: (item) => `${Math.round(item.sodiumMg)} mg` },
];

function ConfidenceRing({ value, color, track }: { value: number; color: string; track: string }) {
  return (
    <ProgressRing progress={Math.max(0, Math.min(100, value)) / 100} color={color} trackColor={track}>
      <View>
        <AppText variant="value">{Math.round(value)}</AppText>
      </View>
    </ProgressRing>
  );
}

function mediaForItem(media: Entry['media'], item: FoodData['items'][number]) {
  if (!media?.length || !item.mediaId) return null;
  return media.find((attachment) => attachment.id === item.mediaId) ?? null;
}

export function FoodEntryDetailSheet({
  visible,
  onClose,
  entry,
  modalScope = 'food',
  modalDomain = 'food',
  onDelete,
  onSaveMeal,
  onSaveNutrition,
  onAiEdit,
  reasoningLoading = false,
  initialMealSaved = false,
  belowNutrition,
}: FoodEntryDetailSheetProps) {
  const colors = useColors();
  const profile = useAppStore((s) => s.onboardingProfile) ?? defaultOnboardingProfile();
  const enabledMicros = enabledMicronutrients(profile);
  const microStats = MICRO_STATS.filter((item) => enabledMicros.includes(item.key));
  const data =
    entry?.status === 'done' && entry.data && 'items' in entry.data
      ? (entry.data as FoodData)
      : null;
  const activeModal = useAppModalStore((s) => s.stack.at(-1));
  const openAppModal = useAppModalStore((s) => s.openAppModal);
  const closeAppModal = useAppModalStore((s) => s.closeAppModal);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [aiScrollInset, setAiScrollInset] = useState(0);
  const [savedVisible, setSavedVisible] = useState(false);
  const [mealSaved, setMealSaved] = useState(initialMealSaved);
  const drawsFromPantry = data?.items.some((item) => item.from) ?? false;
  // What is left of each pantry product a drawn item came from. Read on open,
  // like the pantry sheet — provenance itself is in the item's stored `from`,
  // this only adds the live "how much is left" beside it.
  const remainingByKey = useRepositoryData<Record<string, number | undefined>>(
    async () =>
      Object.fromEntries(
        (await PantryRepository.all()).map((item) => [item.key, item.remainingGrams]),
      ),
    {},
    [entry?.id, drawsFromPantry],
    drawsFromPantry,
  );
  const menuButtonRef = useRef<View>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deferredSheetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const detailModalId = modalScope === 'savedMeal' ? 'settings.savedMealDetails' : 'food.entryDetail';
  const actionMenuId = modalScope === 'savedMeal' ? 'settings.savedMealActionMenu' : 'food.actionMenu';
  const aiEditId = modalScope === 'savedMeal' ? 'settings.savedMealAiEdit' : 'food.aiEdit';
  const nutritionEditId =
    modalScope === 'savedMeal' ? 'settings.savedMealNutritionEdit' : 'food.nutritionEdit';
  const activeEntryId =
    activeModal?.id === 'food.actionMenu' ||
    activeModal?.id === 'food.aiEdit' ||
    activeModal?.id === 'food.nutritionEdit'
      ? activeModal.entryId
      : activeModal?.id === 'settings.savedMealActionMenu' ||
          activeModal?.id === 'settings.savedMealAiEdit' ||
          activeModal?.id === 'settings.savedMealNutritionEdit'
        ? activeModal.mealId
        : null;
  const menuVisible = activeModal?.id === actionMenuId && activeEntryId === entry?.id;
  const aiVisible = activeModal?.id === aiEditId && activeEntryId === entry?.id;
  const menuAnchor: AppModalAnchor | null =
    activeModal?.id === actionMenuId && activeEntryId === entry?.id && 'anchor' in activeModal
      ? activeModal.anchor
      : null;

  useEffect(() => {
    if (!entry || !data) {
      setExpanded({});
      return;
    }
    setExpanded(data.items.length === 1 ? { 0: true } : {});
  }, [entry, data]);

  useEffect(() => {
    return () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
      if (deferredSheetTimer.current) clearTimeout(deferredSheetTimer.current);
    };
  }, []);

  useEffect(() => {
    setMealSaved(initialMealSaved);
    setAiScrollInset(0);
  }, [entry?.id, initialMealSaved]);

  useEffect(() => {
    if (!aiVisible) setAiScrollInset(0);
  }, [aiVisible]);

  if (!entry || !data) return null;

  const totals = sumFoodData(data);
  const confidence = data.confidence;
  const level =
    confidence === undefined
      ? null
      : confidence >= 70
        ? { label: t('details.confHigh'), color: colors.success }
        : confidence >= 40
          ? { label: t('details.confMedium'), color: colors.accent }
          : { label: t('details.confLow'), color: colors.danger };

  const showSavedToast = () => {
    setSavedVisible(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSavedVisible(false), 1800);
  };

  const handleSaveMeal = async () => {
    if (mealSaved) {
      showSavedToast();
      return;
    }
    await onSaveMeal?.(entry);
    setMealSaved(true);
    showSavedToast();
  };

  const handleDelete = () => {
    onDelete?.(entry);
    onClose();
  };

  const openMenu = () => {
    if (!canOpenAppModal(detailModalId, actionMenuId)) return;
    if (!entry) return;
    const openActionMenu = (anchor: AppModalAnchor | null) => {
      if (modalScope === 'savedMeal') {
        openAppModal({ id: 'settings.savedMealActionMenu', domain: modalDomain, mealId: entry.id, anchor });
        return;
      }
      openAppModal({ id: 'food.actionMenu', domain: 'food', entryId: entry.id, anchor });
    };

    if (!menuButtonRef.current) {
      openActionMenu(null);
      return;
    }

    menuButtonRef.current?.measureInWindow((x, y, width, height) => {
      openActionMenu({ x, y, width, height });
    });
  };

  const closeMenu = () => {
    closeAppModal(actionMenuId);
  };

  const openAfterMenu = (target: FoodEntryChildModal) => {
    if (!canOpenAppModal(actionMenuId, target)) return;
    if (!entry) return;
    closeMenu();
    if (deferredSheetTimer.current) clearTimeout(deferredSheetTimer.current);
    deferredSheetTimer.current = setTimeout(() => {
      if (target === 'settings.savedMealAiEdit' || target === 'settings.savedMealNutritionEdit') {
        openAppModal({ id: target, domain: modalDomain, mealId: entry.id });
        return;
      }
      openAppModal({ id: target, domain: 'food', entryId: entry.id });
    }, APP_MODAL_TRANSITION_MS);
  };

  const hasActions = Boolean(onDelete || onSaveMeal || onSaveNutrition || onAiEdit);
  const saveMealLabel = mealSaved ? t('details.mealSaved') : t('details.saveMeal');

  const useNativeMenu = hasActions && IOS_NATIVE_ENABLED && SwiftHost && SwiftMenu && SwiftButton;
  const nativeMenu = useNativeMenu ? (
    <SwiftMenu
      label={t('details.actions')}
      systemImage="ellipsis"
      modifiers={[
        swiftFrame?.({ width: Metrics.iconButton, height: Metrics.iconButton }),
        swiftButtonStyle?.('glass'),
        swiftControlSize?.('large'),
        swiftLabelStyle?.('iconOnly'),
      ].filter(Boolean)}>
      {SwiftGroup ? (
        <SwiftGroup modifiers={[swiftMenuActionDismissBehavior?.('disabled')].filter(Boolean)}>
          <SwiftButton
            label={saveMealLabel}
            systemImage={mealSaved ? 'bookmark.fill' : 'bookmark'}
            modifiers={[swiftMenuActionDismissBehavior?.('disabled')].filter(Boolean)}
            onPress={handleSaveMeal}
          />
        </SwiftGroup>
      ) : (
        <SwiftButton
          label={saveMealLabel}
          systemImage={mealSaved ? 'bookmark.fill' : 'bookmark'}
          modifiers={[swiftMenuActionDismissBehavior?.('disabled')].filter(Boolean)}
          onPress={handleSaveMeal}
        />
      )}
      <SwiftMenu label={t('details.editNutrition')} systemImage="pencil">
        <SwiftButton
          label={t('details.editWithAi')}
          systemImage="sparkles"
          onPress={() => openAfterMenu(aiEditId)}
        />
        <SwiftButton
          label={t('details.editManually')}
          systemImage="slider.horizontal.3"
          onPress={() => openAfterMenu(nutritionEditId)}
        />
      </SwiftMenu>
      {SwiftDivider ? <SwiftDivider /> : null}
      <SwiftButton
        label={t('details.deleteMeal')}
        systemImage="trash"
        role="destructive"
        onPress={handleDelete}
      />
    </SwiftMenu>
  ) : null;
  const menuButton = !hasActions ? (
    <View style={styles.headerButton} />
  ) : useNativeMenu ? (
    <SwiftHost matchContents style={styles.nativeMenuHost}>
      {nativeMenu}
    </SwiftHost>
  ) : menuVisible ? (
    <View style={styles.headerButton} />
  ) : (
    <LoggedPressable
      onPress={openMenu}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={t('details.actions')}>
      <View ref={menuButtonRef} collapsable={false}>
        <GlassSurface glass="regular" isInteractive style={styles.headerButton}>
          <AppIcon name="ellipsis" color={colors.textSecondary} size={20} />
        </GlassSurface>
      </View>
    </LoggedPressable>
  );
  return (
    <SheetFrame
        visible={visible}
        title={t('details.nutrition')}
        onClose={onClose}
        size="full"
        contentBottomInset={Math.max(aiScrollInset, Spacing.eight)}
        overlay={hasActions ? (
          <>
            {!useNativeMenu ? (
              <FoodEntryActionMenu
                visible={menuVisible}
                anchor={menuAnchor}
                mealSaved={mealSaved}
                onClose={closeMenu}
                onSaveMeal={handleSaveMeal}
                onEditWithAi={() => openAfterMenu(aiEditId)}
                onEditManually={() => openAfterMenu(nutritionEditId)}
                onDelete={handleDelete}
              />
            ) : null}
            <FoodAiEditSheet
              visible={aiVisible}
              onClose={() => closeAppModal(aiEditId)}
              onSubmit={(instruction) => onAiEdit?.(entry, instruction)}
              onOcclusionChange={setAiScrollInset}
            />
          </>
        ) : null}
        headerTrailing={menuButton}>
          <View style={styles.hero}>
            <View style={styles.heroText}>
              <AppText variant="title">{entry.text}</AppText>
              <AppText variant="secondary" color={colors.textSecondary}>
                {t('details.detectedAt')} {timeLabel(entry.createdAt)}
              </AppText>
            </View>

            <GlassSurface glass="regular" style={styles.totalCard}>
              <View style={styles.totalHeader}>
                <View style={styles.caloriesSummary}>
                  <AppIcon name="flame" color={colors.calories} size={30} />
                  <View style={styles.totalHeaderText}>
                    <AppText variant="metric">{Math.round(totals.calories)}</AppText>
                    <AppText variant="secondary" color={colors.textSecondary}>
                      {t('details.totalCalories')}
                    </AppText>
                  </View>
                </View>
                <MacroStat
                  icon="glassWater"
                  color={colors.water}
                  label={t('goals.water')}
                  value={formatWaterMl(totals.waterMl)}
                />
              </View>

              <View style={styles.macroRow}>
                <MacroStat
                  icon="beef"
                  color={colors.protein}
                  label={t('goals.protein')}
                  value={`${totals.protein.toFixed(1)} g`}
                />
                <MacroStat
                  icon="wheat"
                  color={colors.carbs}
                  label={t('goals.carbs')}
                  value={`${totals.carbs.toFixed(1)} g`}
                />
                <MacroStat
                  icon="droplet"
                  color={colors.fat}
                  label={t('goals.fat')}
                  value={`${totals.fat.toFixed(1)} g`}
                />
              </View>

              {microStats.length ? (
                <View style={styles.macroRow}>
                  {microStats.map((stat) => (
                    <MacroStat
                      key={stat.key}
                      icon={stat.icon}
                      color={colors[stat.key]}
                      label={t(stat.labelKey)}
                      value={stat.value(totals)}
                    />
                  ))}
                </View>
              ) : null}
            </GlassSurface>
          </View>

            {belowNutrition}

            <View style={styles.section}>
              <AppText variant="heading">{t('details.items')}</AppText>

              <View style={styles.items}>
                {data.items.map((item, index) => {
                  const isOpen = expanded[index] ?? false;
                  const quantity = formatFoodQuantity(item);
                  const itemMedia = mediaForItem(entry.media, item);
                  const calorieMetric = (
                    <View style={styles.itemMetric}>
                      <AppIcon name="flame" color={colors.calories} size={16} />
                      <AppText variant="value" style={styles.itemMetricValue}>
                        {Math.round(item.calories)}
                      </AppText>
                    </View>
                  );
                  return (
                    <GlassSurface key={`${item.label}-${index}`} glass="regular" style={styles.itemCard}>
                      <LoggedPressable
                        onPress={() =>
                          setExpanded((current) => ({ ...current, [index]: !current[index] }))
                        }
                        accessibilityRole="button"
                        accessibilityLabel={isOpen ? t('details.collapseItem') : t('details.expandItem')}>
                        <View style={styles.itemHeader}>
                          <View style={styles.itemTitleRow}>
                            {itemMedia ? <DraftPreview draft={itemMedia} size={34} /> : null}
                            <View style={styles.itemNameText}>
                              <AppText
                                variant="body"
                                numberOfLines={isOpen ? undefined : 1}
                                style={styles.itemLabel}>
                                {item.label}
                              </AppText>
                              {/* Where the note says it came from: the fridge,
                                  how much it took, and what is left. Stored in
                                  the item, so deleting the note undoes the draw. */}
                              {item.from ? (
                                <View style={styles.itemSource}>
                                  <AppIcon name="scanBarcode" color={colors.success} size={12} />
                                  <AppText variant="caption" color={colors.success}>
                                    {[
                                      t('pantry.fromFridge'),
                                      formatPantryGrams(item.from.grams),
                                      remainingByKey[item.from.pantryItemId] !== undefined
                                        ? `· ${t('pantry.remaining')} ${formatPantryGrams(remainingByKey[item.from.pantryItemId] as number)}`
                                        : '',
                                    ]
                                      .filter(Boolean)
                                      .join(' ')}
                                  </AppText>
                                </View>
                              ) : null}
                            </View>
                            {quantity ? (
                              <View style={[styles.quantityPill, { backgroundColor: colors.backgroundSelected }]}>
                                <AppText variant="caption" color={colors.textSecondary}>
                                  {quantity}
                                </AppText>
                              </View>
                            ) : null}
                          </View>

                          <View style={styles.itemHeaderRight}>
                            <View style={styles.itemMetrics}>
                              {item.waterMl > 0 ? (
                                <>
                                  {calorieMetric}
                                  <AppText
                                    variant="label"
                                    color={colors.textTertiary}
                                    style={styles.itemMetricSeparator}>
                                    {'\u00b7'}
                                  </AppText>
                                  <View style={[styles.itemMetric, styles.itemHydrationMetric]}>
                                    <AppIcon name="glassWater" color={colors.water} size={16} />
                                    <AppText variant="value" style={styles.itemMetricValue}>
                                      {formatWaterMl(item.waterMl)}
                                    </AppText>
                                  </View>
                                </>
                              ) : (
                                <>
                                  <View style={styles.itemMetric} />
                                  <AppText
                                    variant="label"
                                    color={colors.textTertiary}
                                    style={styles.itemMetricSeparator}>
                                    {''}
                                  </AppText>
                                  <View style={[styles.itemMetric, styles.itemHydrationMetric]}>
                                    {calorieMetric}
                                  </View>
                                </>
                              )}
                            </View>
                            <AppIcon
                              name={isOpen ? 'chevronUp' : 'chevronDown'}
                              color={colors.textSecondary}
                              size={18}
                            />
                          </View>
                        </View>
                      </LoggedPressable>

                      {isOpen ? (
                        <View style={styles.itemExpanded}>
                          {itemMedia?.description.trim() ? (
                            <AppText variant="caption" color={colors.textSecondary}>
                              {itemMedia.description.trim()}
                            </AppText>
                          ) : null}
                          <View style={styles.itemBreakdown}>
                            <MacroStat
                              icon="beef"
                              color={colors.protein}
                              label={t('goals.protein')}
                              value={`${item.protein.toFixed(1)} g`}
                            />
                            <MacroStat
                              icon="wheat"
                              color={colors.carbs}
                              label={t('goals.carbs')}
                              value={`${item.carbs.toFixed(1)} g`}
                            />
                            <MacroStat
                              icon="droplet"
                              color={colors.fat}
                              label={t('goals.fat')}
                              value={`${item.fat.toFixed(1)} g`}
                            />
                          </View>
                          {microStats.length ? (
                            <View style={styles.itemBreakdown}>
                              {microStats.map((stat) => (
                                <MacroStat
                                  key={stat.key}
                                  icon={stat.icon}
                                  color={colors[stat.key]}
                                  label={t(stat.labelKey)}
                                  value={stat.value(item)}
                                />
                              ))}
                            </View>
                          ) : null}
                        </View>
                      ) : null}
                    </GlassSurface>
                  );
                })}
              </View>
            </View>

            {data.recipe ? (
              <View style={styles.section}>
                <FoodRecipeCard recipe={data.recipe} />
              </View>
            ) : null}

            {data.reasoning || level || reasoningLoading ? (
              <View style={styles.section}>
                <AppText variant="heading">{t('details.reasoning')}</AppText>

                <GlassSurface glass="regular" style={styles.reasoningCard}>
                  {level ? (
                    <View style={styles.confidenceRow}>
                      <ConfidenceRing
                        value={confidence ?? 0}
                        color={level.color}
                        track={colors.backgroundElement}
                      />
                      <View style={styles.confidenceText}>
                        <AppText variant="secondary" color={colors.textSecondary}>
                          {t('details.confidence')}
                        </AppText>
                        <AppText variant="heading" color={level.color}>
                          {level.label}
                        </AppText>
                      </View>
                    </View>
                  ) : null}

                  {reasoningLoading ? (
                    <View style={styles.reasoningLoading}>
                      <ActivityIndicator color={colors.textSecondary} />
                      <AppText variant="body" color={colors.textSecondary}>
                        {t('details.reasoningLoading')}
                      </AppText>
                    </View>
                  ) : data.reasoning ? (
                    <AppText variant="body" color={colors.textSecondary}>
                      {data.reasoning}
                    </AppText>
                  ) : null}
                </GlassSurface>
              </View>
            ) : null}

            {savedVisible ? (
              <GlassSurface glass="regular" style={styles.savedToast}>
                <AppIcon name="check" color={colors.success} size={22} />
                <AppText variant="label">{t('details.mealSaved')}</AppText>
              </GlassSurface>
            ) : null}
    </SheetFrame>
  );
}

const styles = StyleSheet.create({
  headerButton: {
    width: Metrics.iconButton,
    height: Metrics.iconButton,
    borderRadius: Radii.pill,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nativeMenuHost: {
    width: Metrics.iconButton,
    height: Metrics.iconButton,
  },
  hero: {
    gap: Spacing.four,
  },
  heroText: {
    gap: Spacing.two,
  },
  totalCard: {
    borderRadius: Radii.xl,
    padding: Spacing.four,
    gap: Spacing.four,
    overflow: 'hidden',
  },
  totalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  caloriesSummary: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  totalHeaderText: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  macroRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  macroStat: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.one,
  },
  macroValue: {
    textAlign: 'center',
  },
  macroLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
  },
  macroLabelText: {
    textAlign: 'center',
  },
  section: {
    gap: Spacing.three,
  },
  items: {
    gap: Spacing.three,
  },
  itemCard: {
    borderRadius: Radii.lg,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    overflow: 'hidden',
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  itemLabel: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    includeFontPadding: false,
  },
  itemNameText: {
    flex: 1,
    minWidth: 0,
    alignSelf: 'stretch',
    justifyContent: 'center',
    gap: Spacing.half,
  },
  itemSource: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  itemTitleRow: {
    flex: 1,
    minWidth: 0,
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  quantityPill: {
    flexShrink: 0,
    borderRadius: Radii.pill,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
  itemHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  itemMetrics: {
    width: 130,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  itemMetric: {
    width: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: Spacing.one,
  },
  itemHydrationMetric: {
    width: 66,
  },
  itemMetricValue: {
    textAlign: 'left',
  },
  itemMetricSeparator: {
    width: 10,
    textAlign: 'center',
  },
  itemExpanded: {
    gap: Spacing.three,
    paddingTop: Spacing.three,
  },
  itemBreakdown: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  reasoningCard: {
    borderRadius: Radii.xl,
    padding: Spacing.four,
    gap: Spacing.four,
    overflow: 'hidden',
  },
  reasoningLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  confidenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
  },
  confidenceText: {
    gap: Spacing.one,
  },
  savedToast: {
    alignSelf: 'center',
    borderRadius: Radii.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    overflow: 'hidden',
  },
});
