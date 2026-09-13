import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming, type SharedValue } from 'react-native-reanimated';

import { AppIcon } from '@/components/atoms/AppIcon';
import { AppText } from '@/components/atoms/AppText';
import { FoodCutout } from '@/components/atoms/FoodCutout';
import { LoggedPressable } from '@/components/atoms/Logged';
import { Fonts } from '@/constants/theme';
import { cutoutGeometry } from '@/core/food/photo-cutouts';
import { prepareFoodPhoto, scanFoodPhoto, type CapturedFoodPhoto, type PreparedFoodPhoto } from '@/core/food/scan-photo';
import type { FoodPhotoCutout } from '@/core/types';
import { useColors } from '@/hooks/use-colors';
import { getLang, t } from '@/i18n';

function CutoutItem({ item, photo, index, areaWidth, selected, progress, onToggle, onRename }: {
  item: FoodPhotoCutout;
  photo: PreparedFoodPhoto;
  index: number;
  areaWidth: number;
  selected: boolean;
  progress: SharedValue<number>;
  onToggle: () => void;
  onRename: (label: string) => void;
}) {
  const colors = useColors();
  const cellWidth = (areaWidth - 36) / 2;
  const x = 12 + (index % 2) * (cellWidth + 12);
  const y = Math.floor(index / 2) * 206 + 8;
  const frameScale = Math.min(areaWidth / photo.width, 260 / photo.height);
  const geometry = cutoutGeometry(item, photo.width, photo.height);
  const startX = (areaWidth - photo.width * frameScale) / 2 + geometry.x * frameScale;
  const startY = (260 - photo.height * frameScale) / 2 + geometry.y * frameScale;
  const motion = useAnimatedStyle(() => ({
    left: startX + (x - startX) * progress.value,
    top: startY + (y - startY) * progress.value,
    width: geometry.width * frameScale + (cellWidth - geometry.width * frameScale) * progress.value,
    height: geometry.height * frameScale + (146 - geometry.height * frameScale) * progress.value,
    opacity: selected ? 1 : 0.35,
  }));
  const controls = useAnimatedStyle(() => ({ opacity: Math.max(0, (progress.value - 0.7) / 0.3) }));
  return <>
    <Animated.View style={[styles.cutout, motion]} pointerEvents="none">
      <FoodCutout uri={photo.uri} imageWidth={photo.width} imageHeight={photo.height} cutout={item} width="100%" height="100%" />
    </Animated.View>
    <Animated.View style={[styles.itemControls, { left: x, top: y, width: cellWidth }, controls]}>
      <LoggedPressable onPress={onToggle} accessibilityRole="checkbox" accessibilityState={{ checked: selected }}
        accessibilityLabel={item.label} style={styles.selectionTarget}>
        <View style={[styles.check, { borderColor: selected ? colors.success : colors.textSecondary, backgroundColor: selected ? colors.success : colors.background }]}>
          {selected ? <AppIcon name="check" size={16} color="#FFFFFF" /> : null}
        </View>
      </LoggedPressable>
      <TextInput value={item.label} onChangeText={onRename} maxLength={120} multiline numberOfLines={2}
        accessibilityLabel={t('photoScan.itemName')} placeholder={t('photoScan.itemName')}
        placeholderTextColor={colors.textTertiary}
        style={[styles.name, { color: colors.text, borderColor: colors.border, fontFamily: Fonts.regular }]} />
    </Animated.View>
  </>;
}

export function FoodPhotoReview({ photo, onConfirm, onDiscard, remaining }: {
  photo: CapturedFoodPhoto;
  onConfirm: (photo: CapturedFoodPhoto) => void;
  onDiscard: () => void;
  remaining: number;
}) {
  const colors = useColors();
  const [prepared, setPrepared] = useState<PreparedFoodPhoto>();
  const [items, setItems] = useState<FoodPhotoCutout[]>([]);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<'scanning' | 'ready' | 'empty' | 'failed'>('scanning');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [areaWidth, setAreaWidth] = useState(300);
  const confirmed = useRef(false);
  const preparedRef = useRef<PreparedFoodPhoto | undefined>(undefined);
  const abortRef = useRef<AbortController | undefined>(undefined);
  const progress = useSharedValue(0);
  const original = useAnimatedStyle(() => ({ opacity: 1 - Math.min(1, progress.value * 3) }));

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    let disposed = false;
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 55_000);
    void (async () => {
      try {
        const source = preparedRef.current ?? await prepareFoodPhoto(photo);
        if (disposed) return;
        preparedRef.current = source;
        setPrepared(source);
        const detected = await scanFoodPhoto(source, getLang(), controller.signal);
        if (disposed || controller.signal.aborted) return;
        setItems(detected);
        setStatus(detected.length ? 'ready' : 'empty');
        if (detected.length) progress.value = withDelay(180, withTiming(1, { duration: 760 }));
      } catch (e) {
        if (disposed) return;
        setError(timedOut ? 'photoScan.failed' : e instanceof Error ? e.message : 'photoScan.failed');
        setStatus('failed');
      } finally {
        clearTimeout(timeout);
      }
    })();
    return () => { disposed = true; clearTimeout(timeout); controller.abort(); };
  }, [attempt, photo, progress]);

  const selected = items.filter((item) => !excluded.has(item.id));
  const confirm = (useCutouts: boolean) => {
    if (confirmed.current || (useCutouts && !selected.length)) return;
    confirmed.current = true;
    abortRef.current?.abort();
    const source = preparedRef.current ?? photo;
    onConfirm({
      ...source,
      cutouts: useCutouts ? selected.map((item) => ({
        ...item,
        label: item.label.trim() || t('media.foodPhoto'),
        description: `${item.label.trim() || t('media.foodPhoto')}. ${item.description}`.slice(0, 350),
      })) : undefined,
      description: '',
    });
  };

  return <View style={[styles.root, { backgroundColor: colors.background }]}>
    <View style={styles.header}>
      <LoggedPressable onPress={onDiscard} accessibilityRole="button" accessibilityLabel={t('photoScan.discard')} style={styles.iconButton}>
        <AppIcon name="x" size={22} />
      </LoggedPressable>
      <AppText variant="label">{t('media.foodPhoto')}{remaining > 1 ? ` (${remaining})` : ''}</AppText>
      <LoggedPressable onPress={() => confirm(false)} accessibilityRole="button" accessibilityLabel={t('photoScan.keepPhoto')} style={styles.iconButton}>
        <AppIcon name="images" size={22} />
      </LoggedPressable>
    </View>
    <ScrollView contentInsetAdjustmentBehavior="automatic" style={styles.body} onLayout={(event) => setAreaWidth(event.nativeEvent.layout.width)}>
      <View style={{ height: status === 'ready' ? Math.max(260, Math.ceil(items.length / 2) * 206) : 260 }}>
        <Animated.View pointerEvents="none" style={[styles.original, original]}>
          <Image source={{ uri: prepared?.uri ?? photo.uri }} style={StyleSheet.absoluteFill} contentFit="contain" />
        </Animated.View>
        {prepared && status === 'ready' && items.map((item, index) => <CutoutItem
          key={item.id} item={item} photo={prepared} index={index} areaWidth={areaWidth} selected={!excluded.has(item.id)} progress={progress}
          onToggle={() => setExcluded((current) => {
            const next = new Set(current);
            if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
            return next;
          })}
          onRename={(label) => setItems((current) => current.map((value) => value.id === item.id ? { ...value, label } : value))}
        />)}
      </View>
    </ScrollView>
    <View style={[styles.footer, { borderTopColor: colors.border }]}>
      {status === 'scanning' ? <View style={styles.status}>
        <ActivityIndicator color={colors.accent} />
        <AppText variant="caption">{t('photoScan.scanning')}</AppText>
      </View> : status === 'ready' ? <LoggedPressable onPress={() => confirm(true)} disabled={!selected.length}
        accessibilityRole="button" accessibilityLabel={`${t('photoScan.keep')} ${selected.length}`}
        style={[styles.confirm, { backgroundColor: colors.accent, opacity: selected.length ? 1 : 0.4 }]}>
        <AppIcon name="check" size={19} color={colors.background} />
        <AppText variant="label" color={colors.background}>{t('photoScan.keep')} {selected.length}</AppText>
      </LoggedPressable> : <>
        <AppText variant="caption" color={colors.textSecondary} style={styles.error}>
          {status === 'empty' ? t('photoScan.empty') : error === 'photoScan.unsupported' || error === 'photoScan.unconfigured' ? t('photoScan.needsVision') : t('photoScan.failed')}
        </AppText>
        <View style={styles.errorActions}>
          <LoggedPressable onPress={() => { setStatus('scanning'); setAttempt((value) => value + 1); }} accessibilityRole="button" accessibilityLabel={t('status.retry')}>
            <AppText variant="label" color={colors.accent}>{t('status.retry')}</AppText>
          </LoggedPressable>
          <LoggedPressable onPress={() => confirm(false)} accessibilityRole="button" accessibilityLabel={t('photoScan.keepPhoto')}>
            <AppText variant="label" color={colors.accent}>{t('photoScan.keepPhoto')}</AppText>
          </LoggedPressable>
        </View>
      </>}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { height: 52, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1 },
  original: { position: 'absolute', top: 0, left: 0, right: 0, height: 260 },
  cutout: { position: 'absolute' },
  itemControls: { position: 'absolute', height: 196 },
  selectionTarget: { height: 146, alignItems: 'flex-end', padding: 4 },
  check: { width: 27, height: 27, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  name: { height: 46, fontSize: 13, textAlign: 'center', padding: 3, borderBottomWidth: StyleSheet.hairlineWidth },
  footer: { minHeight: 82, padding: 12, gap: 8, borderTopWidth: StyleSheet.hairlineWidth, justifyContent: 'center' },
  status: { flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center' },
  confirm: { minHeight: 44, borderRadius: 8, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  error: { textAlign: 'center' },
  errorActions: { flexDirection: 'row', justifyContent: 'space-around', gap: 12 },
});
