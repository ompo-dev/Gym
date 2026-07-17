import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { AppIcon } from '@/components/atoms/AppIcon';
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
import { timeLabel } from '@/core/date';
import type { Entry } from '@/core/types';
import { formatFoodQuantity, formatWaterMl, sumFoodData } from '@/domains/food';
import type { FoodData } from '@/domains/schemas';
import { useColors } from '@/hooks/use-colors';
import { t } from '@/i18n';

import { FoodAiEditSheet } from './FoodAiEditSheet';
import { FoodEntryActionMenu, type FoodEntryActionMenuAnchor } from './FoodEntryActionMenu';
import { DraftPreview } from './FoodMediaDraftTray';
import {
  FoodNutritionEditContent,
  type FoodNutritionEditHandle,
} from './FoodNutritionEditSheet';
import { SheetFrame } from './SheetFrame';

interface FoodEntryDetailSheetProps {
  visible: boolean;
  onClose: () => void;
  entry: Entry | null;
  onDelete?: (entry: Entry) => void;
  onSaveMeal?: (entry: Entry) => Promise<void> | void;
  onSaveNutrition?: (entry: Entry, text: string, data: FoodData) => Promise<void> | void;
  onAiEdit?: (entry: Entry, instruction: string) => Promise<void> | void;
  reasoningLoading?: boolean;
}

function MacroStat({
  icon,
  color,
  label,
  value,
}: {
  icon: 'beef' | 'wheat' | 'droplet' | 'glassWater';
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
  onDelete,
  onSaveMeal,
  onSaveNutrition,
  onAiEdit,
  reasoningLoading = false,
}: FoodEntryDetailSheetProps) {
  const colors = useColors();
  const data =
    entry?.status === 'done' && entry.data && 'items' in entry.data
      ? (entry.data as FoodData)
      : null;
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<FoodEntryActionMenuAnchor | null>(null);
  const [manualVisible, setManualVisible] = useState(false);
  const [aiVisible, setAiVisible] = useState(false);
  const [aiScrollInset, setAiScrollInset] = useState(0);
  const [savedVisible, setSavedVisible] = useState(false);
  const [mealSaved, setMealSaved] = useState(false);
  const menuButtonRef = useRef<View>(null);
  const manualEditorRef = useRef<FoodNutritionEditHandle>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deferredSheetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    setMealSaved(false);
    setAiVisible(false);
    setAiScrollInset(0);
    setManualVisible(false);
    setMenuVisible(false);
    setMenuAnchor(null);
  }, [entry?.id]);

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
    await onSaveMeal?.(entry);
    setMealSaved(true);
    showSavedToast();
  };

  const handleDelete = () => {
    onDelete?.(entry);
    onClose();
  };

  const openMenu = () => {
    if (!menuButtonRef.current) {
      setMenuAnchor(null);
      setMenuVisible(true);
      return;
    }

    menuButtonRef.current?.measureInWindow((x, y, width, height) => {
      setMenuAnchor({ x, y, width, height });
      setMenuVisible(true);
    });
  };

  const closeMenu = () => {
    setMenuVisible(false);
    setMenuAnchor(null);
  };

  const openAfterMenu = (open: () => void) => {
    closeMenu();
    if (deferredSheetTimer.current) clearTimeout(deferredSheetTimer.current);
    deferredSheetTimer.current = setTimeout(open, 300);
  };

  const openManualEditor = () => {
    setManualVisible(true);
  };

  const saveManualEditor = () => {
    void manualEditorRef.current?.save();
  };

  const useNativeMenu = IOS_NATIVE_ENABLED && SwiftHost && SwiftMenu && SwiftButton;
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
            label={t('details.saveMeal')}
            systemImage={mealSaved ? 'bookmark.fill' : 'bookmark'}
            modifiers={[swiftMenuActionDismissBehavior?.('disabled')].filter(Boolean)}
            onPress={handleSaveMeal}
          />
        </SwiftGroup>
      ) : (
        <SwiftButton
          label={t('details.saveMeal')}
          systemImage={mealSaved ? 'bookmark.fill' : 'bookmark'}
          modifiers={[swiftMenuActionDismissBehavior?.('disabled')].filter(Boolean)}
          onPress={handleSaveMeal}
        />
      )}
      <SwiftMenu label={t('details.editNutrition')} systemImage="pencil">
        <SwiftButton
          label={t('details.editWithAi')}
          systemImage="sparkles"
          onPress={() => openAfterMenu(() => setAiVisible(true))}
        />
        <SwiftButton
          label={t('details.editManually')}
          systemImage="slider.horizontal.3"
          onPress={() => openAfterMenu(openManualEditor)}
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
  const menuButton = useNativeMenu ? (
    <SwiftHost matchContents style={styles.nativeMenuHost}>
      {nativeMenu}
    </SwiftHost>
  ) : menuVisible ? (
    <View style={styles.headerButton} />
  ) : (
    <Pressable
      onPress={openMenu}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={t('details.actions')}>
      <View ref={menuButtonRef} collapsable={false}>
        <GlassSurface glass="regular" isInteractive style={styles.headerButton}>
          <AppIcon name="ellipsis" color={colors.textSecondary} size={20} />
        </GlassSurface>
      </View>
    </Pressable>
  );
  const manualSaveButton = (
    <Pressable
      onPress={saveManualEditor}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={t('settings.done')}>
      <View style={[styles.editSaveButton, { backgroundColor: colors.success }]}>
        <AppIcon name="check" color="#FFFFFF" size={22} />
      </View>
    </Pressable>
  );
  const manualCloseButton = (
    <Pressable
      onPress={saveManualEditor}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={t('common.close')}>
      <GlassSurface glass="regular" isInteractive style={styles.editHeaderButton}>
        <AppIcon name="x" color={colors.textSecondary} size={28} />
      </GlassSurface>
    </Pressable>
  );

  return (
    <>
      <SheetFrame
        visible={visible}
        title={manualVisible ? t('details.editManually') : t('details.nutrition')}
        onClose={manualVisible ? saveManualEditor : onClose}
        size="full"
        centerTitle={manualVisible}
        keyboardAwareScroll={manualVisible}
        contentBottomInset={!manualVisible ? Math.max(aiScrollInset, Spacing.eight) : 0}
        headerLeading={manualVisible ? manualCloseButton : undefined}
        hideDefaultClose={manualVisible}
        overlay={!manualVisible ? (
          <>
            {!useNativeMenu ? (
              <FoodEntryActionMenu
                visible={menuVisible}
                anchor={menuAnchor}
                mealSaved={mealSaved}
                onClose={closeMenu}
                onSaveMeal={handleSaveMeal}
                onEditWithAi={() => openAfterMenu(() => setAiVisible(true))}
                onEditManually={() => openAfterMenu(openManualEditor)}
                onDelete={handleDelete}
              />
            ) : null}
            <FoodAiEditSheet
              visible={aiVisible}
              onClose={() => setAiVisible(false)}
              onSubmit={(instruction) => onAiEdit?.(entry, instruction)}
              onOcclusionChange={setAiScrollInset}
            />
          </>
        ) : null}
        headerTrailing={manualVisible ? manualSaveButton : menuButton}>
        {manualVisible ? (
          <FoodNutritionEditContent
            ref={manualEditorRef}
            text={entry.text}
            data={data}
            media={entry.media}
            onClose={() => setManualVisible(false)}
            onSave={(text, nextData) => onSaveNutrition?.(entry, text, nextData)}
          />
        ) : (
          <>
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
              </GlassSurface>
            </View>

            <View style={styles.section}>
              <AppText variant="heading">{t('details.items')}</AppText>

              <View style={styles.items}>
                {data.items.map((item, index) => {
                  const isOpen = expanded[index] ?? false;
                  const quantity = formatFoodQuantity(item);
                  const itemMedia = mediaForItem(entry.media, item);
                  return (
                    <GlassSurface key={`${item.label}-${index}`} glass="regular" style={styles.itemCard}>
                      <Pressable
                        onPress={() =>
                          setExpanded((current) => ({ ...current, [index]: !current[index] }))
                        }
                        accessibilityRole="button"
                        accessibilityLabel={isOpen ? t('details.collapseItem') : t('details.expandItem')}>
                        <View style={styles.itemHeader}>
                          <View style={styles.itemTitleRow}>
                            {itemMedia ? <DraftPreview draft={itemMedia} size={34} /> : null}
                            <View style={styles.itemNameText}>
                              <AppText variant="body" style={styles.itemLabel}>
                                {item.label}
                              </AppText>
                              {itemMedia?.description.trim() ? (
                                <AppText variant="caption" color={colors.textSecondary}>
                                  {itemMedia.description.trim()}
                                </AppText>
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
                            <AppText variant="value" color={colors.calories}>
                              {Math.round(item.calories)} cal
                            </AppText>
                            <AppIcon
                              name={isOpen ? 'chevronUp' : 'chevronDown'}
                              color={colors.textSecondary}
                              size={18}
                            />
                          </View>
                        </View>
                      </Pressable>

                      {isOpen ? (
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
                      ) : null}
                    </GlassSurface>
                  );
                })}
              </View>
            </View>

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
          </>
        )}
      </SheetFrame>

    </>
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
  editSaveButton: {
    width: Metrics.iconButton,
    height: Metrics.iconButton,
    borderRadius: Radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editHeaderButton: {
    width: Metrics.iconButton,
    height: Metrics.iconButton,
    borderRadius: Radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
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
    gap: Spacing.three,
  },
  itemLabel: {
    flex: 1,
  },
  itemNameText: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.half,
  },
  itemTitleRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  quantityPill: {
    borderRadius: Radii.pill,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
  itemHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  itemBreakdown: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingTop: Spacing.three,
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
