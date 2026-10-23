import * as Clipboard from 'expo-clipboard';
import * as Crypto from 'expo-crypto';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Platform, StyleSheet, TextInput, View } from 'react-native';

import { AppIcon } from '@/components/atoms/AppIcon';
import { AppText } from '@/components/atoms/AppText';
import { LoggedPressable } from '@/components/atoms/Logged';
import { AGENTS, AgentLogo, AgentLogos, type AgentId } from '@/components/molecules/AgentLogos';
import { SettingsRow } from '@/components/molecules/SettingsRow';
import { Fonts, Spacing } from '@/constants/theme';
import { connectionSchema } from '@/core/connect/protocol';
import { buildAgentSetupPrompt, importAgentConnection, toolTokenFor } from '@/core/connect/setupPrompt';
import { useColors } from '@/hooks/use-colors';
import { getLang, t } from '@/i18n';
import { useAgentConnectionStore } from '@/store/useAgentConnectionStore';
import { useAgentSettingsStore } from '@/store/useAgentSettingsStore';

import { SheetFrame } from '../SheetFrame';
import { AgentAccountPanel } from './AgentAccountPanel';
import { Toggle } from './primitives';

function CopyField({ label, value, secret = false }: { label: string; value: string; secret?: boolean }) {
  const colors = useColors();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return <View style={[styles.copyField, { backgroundColor: colors.backgroundElement }]}>
    <View style={styles.grow}>
      <AppText variant="label">{label}</AppText>
      <AppText variant="secondary" selectable={!secret} style={styles.code}>
        {secret ? '********************************' : value}
      </AppText>
    </View>
    <LoggedPressable style={styles.iconButton} accessibilityRole="button" accessibilityLabel={`${t('connect.copy')} ${label}`}
      onPress={async () => {
        try {
          await Clipboard.setStringAsync(value);
          setCopied(true);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => setCopied(false), 1800);
        } catch { Alert.alert(t('common.error')); }
      }}>
      <AppIcon name={copied ? 'check' : 'copy'} color={copied ? colors.success : colors.textSecondary} size={20} />
    </LoggedPressable>
  </View>;
}

export function ConnectSheet({ onClose, nested }: {
  onClose: () => void; nested?: ReactNode;
}) {
  const colors = useColors();
  const connection = useAgentConnectionStore((s) => s.connection);
  const status = useAgentConnectionStore((s) => s.status);
  const issue = useAgentConnectionStore((s) => s.issue);
  const textAgent = useAgentSettingsStore((s) => s.text?.provider);
  const pairedAgent = connection?.agent ?? textAgent ?? 'mcp';
  const [advanced, setAdvanced] = useState(false);
  const [accountVisible, setAccountVisible] = useState(true);
  const [hydrated, setHydrated] = useState(Platform.OS === 'web');
  const [toolToken, setToolToken] = useState('');
  const [agent, setAgent] = useState<AgentId>(connection ? pairedAgent : 'claude');
  const [customURL, setURL] = useState<string | null>(null);
  const url = (advanced ? customURL : null) ?? connection?.url ?? 'ws://127.0.0.1:3847/app';
  const [draftToken, setToken] = useState(connection?.token ?? '');
  const token = !advanced && connection ? connection.token : draftToken;
  const [draftWrites, setAllowWrites] = useState(connection?.allowWrites ?? false);
  const allowWrites = !advanced && connection ? connection.allowWrites : draftWrites;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<'connect.invalid' | 'connect.invalidCode' | 'connect.wrongInvite' | 'connect.missingInvite' | 'common.error' | null>(null);
  const [prepared, setPrepared] = useState<{ signature: string; prompt: string } | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState('');
  const signature = JSON.stringify([agent, url, token, allowWrites, getLang()]);
  const prompt = prepared?.signature === signature ? prepared.prompt : '';
  const copied = !!prompt && copiedPrompt === prompt;
  const mounted = useRef(true);
  const working = useRef(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const provider = agent === 'claude' || agent === 'claudecode' ? 'claude' :
    agent === 'chatgpt' || agent === 'codex' ? 'codex' : agent === 'gemini' ? 'gemini' : null;
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; if (copyTimer.current) clearTimeout(copyTimer.current); };
  }, []);
  useEffect(() => {
    let active = true;
    void useAgentConnectionStore.getState().hydrate().then(() => {
      if (active) {
        const saved = useAgentConnectionStore.getState().connection;
        if (saved) setAgent(saved.agent ?? useAgentSettingsStore.getState().text?.provider ?? 'mcp');
        setHydrated(true);
      }
    }).catch(() => { if (active) setError('common.error'); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    if (connection) return;
    let active = true;
    void Crypto.getRandomBytesAsync(32).then((bytes) => {
      if (active) setToken((current) => current || Array.from(bytes, (v) => v.toString(16).padStart(2, '0')).join(''));
    }).catch(() => { if (active) setError('common.error'); });
    return () => { active = false; };
  }, [connection, hydrated]);
  useEffect(() => {
    let active = true;
    if (!hydrated || !token) return;
    void (async () => {
      const grant = connectionSchema.parse({ url, token, allowWrites });
      const [ready, tools] = await Promise.all([buildAgentSetupPrompt(agent, grant, getLang()), toolTokenFor(token)]);
      if (active) { setPrepared({ signature, prompt: ready }); setToolToken(tools); }
    })().catch(() => {});
    return () => { active = false; };
  }, [agent, url, token, allowWrites, signature, hydrated]);
  const copyPrompt = async (): Promise<boolean> => {
    if (working.current || !prompt) return false;
    working.current = true; setBusy(true); setError(null);
    try {
      const next = connectionSchema.parse({ url, token, allowWrites, agent });
      const current = useAgentConnectionStore.getState().connection;
      // Native must save before leaving for the agent; WebKit needs the clipboard within the gesture.
      if (Platform.OS === 'web') await Clipboard.setStringAsync(prompt);
      if (!current || current.url !== next.url || current.token !== next.token || current.allowWrites !== next.allowWrites || current.agent !== next.agent) {
        await useAgentConnectionStore.getState().configure(next);
      }
      const saved = useAgentConnectionStore.getState().connection;
      if (!saved || saved.token !== next.token || saved.url !== next.url || saved.allowWrites !== next.allowWrites) {
        throw new Error('invite-replaced');
      }
      if (Platform.OS !== 'web') await Clipboard.setStringAsync(prompt);
      if (mounted.current) {
        setCopiedPrompt(prompt);
        if (copyTimer.current) clearTimeout(copyTimer.current);
        copyTimer.current = setTimeout(() => { if (mounted.current) setCopiedPrompt(''); }, 2400);
      }
      return true;
    } catch { if (mounted.current) setError('common.error'); return false; }
    finally { working.current = false; if (mounted.current) setBusy(false); }
  };
  const pasteConnection = async () => {
    if (working.current) return;
    working.current = true; setBusy(true); setError(null);
    try {
      const code = await Clipboard.getStringAsync();
      const current = useAgentConnectionStore.getState().connection;
      if (!current) throw new Error('connect.missingInvite');
      const next = await importAgentConnection(code, current);
      await useAgentConnectionStore.getState().configure(next);
      if (mounted.current) { setURL(null); setToken(next.token); setAllowWrites(next.allowWrites); }
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error &&
        ['connect.invalidCode', 'connect.wrongInvite', 'connect.missingInvite'].includes(cause.message)
        ? cause.message as 'connect.invalidCode' | 'connect.wrongInvite' | 'connect.missingInvite' : 'common.error');
    }
    finally { working.current = false; if (mounted.current) setBusy(false); }
  };
  const changeWrites = async (value: boolean) => {
    if (working.current) return;
    working.current = true; setBusy(true); setError(null);
    const before = allowWrites; setAllowWrites(value);
    try {
      const current = useAgentConnectionStore.getState().connection;
      if (current) await useAgentConnectionStore.getState().configure({ ...current, allowWrites: value });
    } catch { if (mounted.current) { setAllowWrites(before); setError('common.error'); } }
    finally { working.current = false; if (mounted.current) setBusy(false); }
  };
  const connect = async () => {
    if (working.current) return;
    working.current = true; setBusy(true); setError(null);
    try {
      await useAgentConnectionStore.getState().configure(connectionSchema.parse({ url, token, allowWrites, agent }));
    } catch { if (mounted.current) setError('connect.invalid'); }
    finally { working.current = false; if (mounted.current) setBusy(false); }
  };
  let baseURL = 'http://127.0.0.1:3847';
  try { const parsed = new URL(url); baseURL = `${parsed.protocol === 'wss:' ? 'https:' : 'http:'}//${parsed.host}`; } catch { /* Draft can be incomplete. */ }
  return <SheetFrame visible title={t('connect.title')} onClose={onClose} size="full" nested={nested} keyboardAwareScroll>
    <View style={styles.content}>
      <AgentLogos />
      <View style={styles.status}>
        {status === 'waiting' || status === 'connecting' ? <ActivityIndicator color={colors.accent} /> :
          <AppIcon name={status === 'connected' ? 'check' : 'circleDot'} color={status === 'connected' ? colors.success : colors.textTertiary} />}
        <AppText variant="secondary" style={styles.grow}>{t(`connect.${status}`)}</AppText>
      </View>
      {status === 'error' && issue ? <>
        <AppText variant="secondary" color={colors.danger}>{t(`connect.${issue}`)}</AppText>
        {connection ? <SettingsRow title={t('connect.retry')} icon="refresh" disabled={busy} onPress={() => {
          void useAgentConnectionStore.getState().configure(connection).catch(() => setError('common.error'));
        }} /> : null}
      </> : null}
      <AppText variant="heading" style={styles.heading}>{t('connect.choose')}</AppText>
      <View style={styles.agents}>{AGENTS.map((item) => <LoggedPressable key={item.id}
          accessibilityRole="radio" accessibilityState={{ checked: item.id === agent }} accessibilityLabel={item.label}
          disabled={busy}
          onPress={() => { setAgent(item.id); setAccountVisible(true); }}
          style={[styles.agent, { borderColor: status === 'connected' && item.id === pairedAgent ? colors.success : item.id === agent ? colors.accent : colors.border,
            backgroundColor: colors.backgroundElement }]}>
          <AgentLogo agent={item.id} size={32} /><AppText variant="secondary" style={styles.grow}>{item.label}</AppText>
        </LoggedPressable>)}</View>
      <SettingsRow title={t('connect.writes')} trailing={<Toggle value={allowWrites} disabled={busy}
        onValueChange={(value) => { void changeWrites(value); }} label={t('connect.writes')} />} />
      <LoggedPressable accessibilityRole="button" accessibilityLabel={t(copied ? 'connect.copied' : 'connect.copyPrompt')}
        accessibilityState={{ disabled: busy || !prompt }} disabled={busy || !prompt}
        style={({ pressed }) => [styles.primary, { backgroundColor: colors.accent, opacity: pressed || busy || !prompt ? 0.6 : 1 }]}
        onPress={() => { void copyPrompt(); }}>
        {busy ? <ActivityIndicator color={colors.background} /> : <AppIcon name={copied ? 'check' : 'copy'} color={colors.background} size={22} />}
        <AppText variant="label" color={colors.background} style={styles.primaryLabel}>{t(copied ? 'connect.copied' : 'connect.copyPrompt')}</AppText>
      </LoggedPressable>
      {error ? <AppText variant="secondary" color={colors.danger}>{t(error)}</AppText> : null}
      {provider && status === 'connected' ? <>
        <SettingsRow title={t('connect.accountModels')} icon="sparkles" onPress={() => setAccountVisible((value) => !value)} />
        {accountVisible ? <AgentAccountPanel key={provider} provider={provider} onPrepare={async () => true} /> : null}
      </> : null}
      <SettingsRow title={t('connect.details')} icon="sliders" onPress={() => {
        if (!advanced) { setToken(token); setAllowWrites(allowWrites); setURL(url); }
        setAdvanced((value) => !value);
      }} />
      {advanced ? <>
      <AppText variant="heading" style={styles.heading}>{t('connect.local')}</AppText>
      <SettingsRow title={t('connect.pasteConnection')} icon="clipboard" disabled={busy || !connection}
        onPress={() => { void pasteConnection(); }} />
      <View style={styles.field}>
        <AppText variant="label">{t('connect.url')}</AppText>
        <TextInput value={url} onChangeText={setURL} autoCapitalize="none" autoCorrect={false}
          accessibilityLabel={t('connect.url')} placeholder="ws://192.168.1.10:3847/app" placeholderTextColor={colors.textTertiary}
          style={[styles.input, { color: colors.text, backgroundColor: colors.backgroundElement }]} />
      </View>
      <View style={styles.field}>
        <AppText variant="label">{t('connect.key')}</AppText>
        <TextInput value={token} onChangeText={setToken} autoCapitalize="none" autoCorrect={false} secureTextEntry
          accessibilityLabel={t('connect.key')} maxLength={64}
          style={[styles.input, { color: colors.text, backgroundColor: colors.backgroundElement }]} />
        <SettingsRow title={t('connect.createKey')} icon="key" disabled={busy} onPress={async () => {
          setBusy(true);
          try {
            const bytes = await Crypto.getRandomBytesAsync(32);
            setToken(Array.from(bytes, (v) => v.toString(16).padStart(2, '0')).join(''));
          } catch { setError('common.error'); } finally { setBusy(false); }
        }} />
        {token ? <CopyField label={t('connect.key')} value={token} secret /> : null}
      </View>
      <AppText variant="caption">{t('connect.readOnly')}</AppText>
      <SettingsRow title={t('connect.connect')} icon="check" disabled={busy || !token || status === 'connecting'} onPress={connect} />
      <AppText variant="caption" color={colors.textTertiary}>{t('connect.network')}</AppText>
        {connection && toolToken ? <CopyField label={t('connect.toolKey')} value={toolToken} secret /> : null}
        <CopyField label="REST" value={`${baseURL}/api/v1`} />
      {connection ? <SettingsRow title={t('connect.disconnect')} icon="x" iconColor={colors.danger} disabled={busy} onPress={async () => {
        try { await useAgentConnectionStore.getState().disconnect(); setToken(''); setAllowWrites(false); setAccountVisible(false); }
        catch { setError('common.error'); }
      }} /> : null}
      </> : null}
    </View>
  </SheetFrame>;
}

const styles = StyleSheet.create({
  content: { gap: Spacing.four, paddingBottom: Spacing.seven },
  heading: { fontSize: 21, letterSpacing: 0 },
  status: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 36 },
  primary: { minHeight: 56, padding: Spacing.four, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
  primaryLabel: { flexShrink: 1, textAlign: 'center' },
  agents: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  agent: { flexBasis: '47%', flexGrow: 1, minWidth: 128, minHeight: 64, padding: Spacing.three,
    flexDirection: 'row', gap: Spacing.two, alignItems: 'center', borderWidth: 1, borderRadius: 8 },
  grow: { flex: 1, minWidth: 0 },
  field: { gap: Spacing.two },
  input: { borderRadius: 8, padding: Spacing.three, minHeight: 48, fontSize: 15, fontFamily: Fonts.regular },
  copyField: { flexDirection: 'row', gap: Spacing.two, padding: Spacing.three, borderRadius: 8, alignItems: 'flex-start' },
  code: { fontFamily: Fonts.regular, fontSize: 12, marginTop: Spacing.two, flexShrink: 1 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
