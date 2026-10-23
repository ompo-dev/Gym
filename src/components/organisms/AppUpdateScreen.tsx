import { useEffect, useState } from 'react';
import { Image } from 'expo-image';
import { ActivityIndicator, Animated, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/atoms/AppIcon';
import { AppText } from '@/components/atoms/AppText';
import { LoggedPressable } from '@/components/atoms/Logged';
import type { AppUpdatePhase } from '@/hooks/useOTAStartupUpdate';
import { useColors } from '@/hooks/use-colors';
import { t } from '@/i18n';

export function AppUpdateScreen({ phase, progress, onContinue, onRetry }: {
  phase: AppUpdatePhase;
  progress?: number;
  onContinue: () => void;
  onRetry: () => void;
}) {
  const colors = useColors();
  const amount = typeof progress === 'number' && Number.isFinite(progress)
    ? Math.max(0, Math.min(1, progress)) : undefined;
  const [animatedProgress] = useState(() => new Animated.Value(amount ?? 0));
  useEffect(() => {
    const animation = Animated.timing(animatedProgress, {
      toValue: phase === 'applying' ? 1 : amount ?? 0,
      duration: 220, useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [amount, phase, animatedProgress]);
  if (phase === 'idle') return null;
  const title = t(`updates.${phase}`);
  const determinate = phase === 'applying' || (phase === 'downloading' && amount !== undefined);
  const percentage = phase === 'applying' ? 100 : amount === undefined ? undefined : Math.round(amount * 100);

  return <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]} accessibilityViewIsModal>
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content} bounces={false}>
      <Image source={require('../../../assets/images/gym/mark.svg')} style={styles.mark} contentFit="contain" accessibilityLabel="GymNotes" />
      <AppText variant="title" style={styles.title} accessibilityLiveRegion="polite">{title}</AppText>
      <View style={styles.progressArea}>
        {determinate ? <View style={[styles.track, { backgroundColor: colors.backgroundElement }]}
          accessible accessibilityRole="progressbar" accessibilityLabel={t('updates.progress')}
          accessibilityValue={{ min: 0, max: 100, now: percentage }}>
          <Animated.View style={[styles.fill, { backgroundColor: colors.accent, width: animatedProgress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
        </View> : phase === 'error' ? <AppIcon name="cloudOff" size={28} color={colors.textSecondary} />
          : <ActivityIndicator color={colors.accent} accessibilityLabel={title} />}
        {percentage !== undefined ? <AppText variant="caption" style={{ fontVariant: ['tabular-nums'] }}>{percentage}%</AppText> : null}
      </View>
      <View style={styles.actions}>
        {phase === 'error' ? <LoggedPressable onPress={onRetry} accessibilityRole="button" accessibilityLabel={t('status.retry')} style={styles.button}>
          <AppIcon name="cloudOff" size={18} color={colors.accent} />
          <AppText variant="label" color={colors.accent}>{t('status.retry')}</AppText>
        </LoggedPressable> : null}
        {phase !== 'applying' ? <LoggedPressable onPress={onContinue} accessibilityRole="button" accessibilityLabel={t('updates.continue')} style={styles.button}>
          <AppText variant="body" color={colors.textSecondary}>{t('updates.continue')}</AppText>
          <AppIcon name="chevronRight" color={colors.textSecondary} />
        </LoggedPressable> : null}
      </View>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { ...StyleSheet.absoluteFill, zIndex: 1000 },
  content: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 28, gap: 28 },
  mark: { width: 112, height: 112 },
  title: { textAlign: 'center', maxWidth: 360, fontSize: 22, letterSpacing: 0 },
  progressArea: { width: '100%', maxWidth: 280, minHeight: 44, alignItems: 'center', gap: 12 },
  track: { width: '100%', height: 5, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  actions: { alignItems: 'center', gap: 12, minHeight: 100, maxWidth: '100%' },
  button: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
});
