import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/atoms/AppText';
import { Spacing } from '@/constants/theme';
import { SettingsRow } from '@/components/molecules/SettingsRow';
import { getAppSettings, setAutomaticUpdates } from '@/core/updates/preferences';
import { checkForOTAUpdateNow, type OTAUpdateCheckResult } from '@/hooks/useOTAUpdates';
import { useColors } from '@/hooks/use-colors';
import { t } from '@/i18n';

import { Divider, Section, Toggle } from './primitives';

function resultLabel(result: OTAUpdateCheckResult): string {
  if (result.status === 'not-applicable') return t(result.reason === 'runtime-version-mismatch' ? 'updates.newBuild' : 'updates.unavailable');
  const labels = { disabled: 'updates.disabled', 'window-inactive': 'updates.inactive',
    'restart-required': 'updates.restart', 'up-to-date': 'updates.current', downloaded: 'updates.downloaded',
    'download-failed': 'updates.error', deferred: 'updates.deferred', error: 'updates.error' } as const;
  return t(labels[result.status]);
}

export function DeveloperUpdatesSection() {
  const colors = useColors();
  const [automatic, setAutomatic] = useState(true);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const saving = useRef(false);
  const [savingPreference, setSavingPreference] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'checking' | 'downloading' | 'applying'>('idle');
  const [result, setResult] = useState<OTAUpdateCheckResult | null>(null);
  const mounted = useRef(true);
  const inFlight = useRef(false);
  useEffect(() => {
    mounted.current = true;
    void getAppSettings().then((settings) => {
      if (mounted.current) { setAutomatic(settings.automaticUpdates); setPreferencesReady(true); }
    }).catch(() => { if (mounted.current) setResult({ status: 'error', stage: 'check' }); });
    return () => { mounted.current = false; };
  }, []);
  const check = async () => {
    if (inFlight.current) return;
    inFlight.current = true; setPhase('checking'); setResult(null);
    try {
      const next = await checkForOTAUpdateNow('manual', () => mounted.current, {
        onDownloading: () => { if (mounted.current) setPhase('downloading'); },
      });
      if (mounted.current) setResult(next);
    } catch { if (mounted.current) setResult({ status: 'error', stage: 'check' }); }
    finally { inFlight.current = false; if (mounted.current) setPhase('idle'); }
  };
  return <Section label={t('updates.title')}>
    <SettingsRow title={t(phase === 'idle' ? 'updates.checkNow' : `updates.${phase}`)} icon="refresh"
      disabled={phase !== 'idle'} trailing={phase !== 'idle' ? <ActivityIndicator color={colors.accent} /> : undefined}
      onPress={() => { void check(); }} />
    {result ? <View accessibilityLiveRegion="polite" style={styles.message}><AppText variant="secondary">{resultLabel(result)}</AppText></View> : null}
    {result?.status === 'downloaded' ? <SettingsRow title={t('updates.apply')} icon="check" disabled={phase !== 'idle'} onPress={async () => {
      if (inFlight.current) return;
      inFlight.current = true; setPhase('applying');
      try { await Updates.reloadAsync(); }
      catch { if (mounted.current) setResult({ status: 'error', stage: 'fetch' }); }
      finally { inFlight.current = false; if (mounted.current) setPhase('idle'); }
    }} /> : null}
    <Divider />
    <SettingsRow title={t('updates.automatic')} trailing={<Toggle value={automatic} label={t('updates.automatic')}
      disabled={!preferencesReady || savingPreference} onValueChange={async (value) => {
        if (saving.current) return;
        saving.current = true; setSavingPreference(true);
        const before = automatic; setAutomatic(value);
        try { await setAutomaticUpdates(value); }
        catch { if (mounted.current) { setAutomatic(before); setResult({ status: 'error', stage: 'check' }); } }
        finally { saving.current = false; if (mounted.current) setSavingPreference(false); }
      }} />} />
    <View style={styles.message}>
      <AppText variant="caption">{`GymNotes ${Constants.expoConfig?.version ?? '?'} · runtime ${Updates.runtimeVersion ||
        (typeof Constants.expoConfig?.runtimeVersion === 'string' ? Constants.expoConfig.runtimeVersion : '-')} · ${Updates.channel || 'local'}`}</AppText>
      {Updates.updateId ? <AppText variant="caption" selectable>{Updates.updateId}</AppText> : null}
    </View>
  </Section>;
}

const styles = StyleSheet.create({ message: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.three, gap: Spacing.one } });
