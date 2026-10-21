import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { AppIcon } from '@/components/atoms/AppIcon';
import { AppText } from '@/components/atoms/AppText';
import { LoggedPressable } from '@/components/atoms/Logged';
import { SettingsRow } from '@/components/molecules/SettingsRow';
import { Fonts, Spacing } from '@/constants/theme';
import { requestAgent, type AgentProvider, type AgentRequest } from '@/core/connect/agentRPC';
import { useColors } from '@/hooks/use-colors';
import { t } from '@/i18n';
import { useAgentConnectionStore } from '@/store/useAgentConnectionStore';
import { agentStateSchema, useAgentSettingsStore, type AgentPurpose, type AgentState } from '@/store/useAgentSettingsStore';
import { useAppStore } from '@/store/useAppStore';

function AgentOption({ option, disabled, onChange }: {
  option: AgentState['options'][number]; disabled: boolean; onChange: (value: string | boolean) => void;
}) {
  const colors = useColors();
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState('');
  if (option.type === 'boolean') return <SettingsRow title={option.name} disabled={disabled}
    trailing={<AppIcon name={option.currentValue ? 'check' : 'circleDot'} />} onPress={() => onChange(!option.currentValue)} />;
  const options = (option.options ?? []).map((item) => ({ value: item.value, label: item.name }));
  return <View>
    <SettingsRow title={option.name} disabled={disabled}
      select={{ value: String(option.currentValue), options, onSelect: onChange }} onPress={() => setExpanded((value) => !value)} />
    {expanded && !disabled ? <View style={styles.options}>
      {options.length > 8 ? <TextInput value={search} onChangeText={setSearch} accessibilityLabel={t('agent.search')}
        placeholder={t('agent.search')} placeholderTextColor={colors.textTertiary} style={[styles.search, { color: colors.text }]} /> : null}
      <ScrollView style={styles.list} nestedScrollEnabled>
        {options.filter((item) => item.label.toLowerCase().includes(search.toLowerCase())).map((item) =>
          <LoggedPressable key={item.value} accessibilityRole="radio" accessibilityLabel={item.label}
            accessibilityState={{ checked: item.value === option.currentValue }} style={styles.option}
            onPress={() => { setExpanded(false); onChange(item.value); }}>
            <AppText style={styles.grow}>{item.label}</AppText>
            {item.value === option.currentValue ? <AppIcon name="check" color={colors.accent} size={18} /> : null}
          </LoggedPressable>)}
      </ScrollView>
    </View> : null}
  </View>;
}

export function AgentAccountPanel({ provider, onPrepare, prepareDisabled = false }: {
  provider: AgentProvider; onPrepare: () => Promise<boolean>; prepareDisabled?: boolean;
}) {
  const colors = useColors();
  const status = useAgentConnectionStore((s) => s.status);
  const text = useAgentSettingsStore((s) => s.text);
  const vision = useAgentSettingsStore((s) => s.vision);
  const [state, setState] = useState<AgentState | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancellable, setCancellable] = useState(false);
  const [error, setError] = useState('');
  const [pendingLogin, setPendingLogin] = useState(false);
  const request = useRef<AbortController | null>(null);
  const running = useRef(false);
  const mounted = useRef(true);
  const stopWaiting = useRef<(() => void) | null>(null);
  useEffect(() => {
    mounted.current = true;
    void useAgentSettingsStore.getState().hydrate();
    return () => { mounted.current = false; stopWaiting.current?.(); request.current?.abort(); useAgentConnectionStore.getState().setAuthenticating(false); };
  }, []);
  const run = useCallback(async (action: AgentRequest['action'], extra: Partial<AgentRequest> = {}, login = false) => {
    if (running.current) return;
    running.current = true;
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setCancellable(true); setError('');
    useAgentConnectionStore.getState().setAuthenticating(true);
    try {
      let next = agentStateSchema.parse(await requestAgent({ provider, action, ...extra }, controller.signal));
      if (login && !next.authenticated && next.authMethods.length === 1 && !controller.signal.aborted) {
        next = agentStateSchema.parse(await requestAgent({ provider, action: 'authenticate', methodId: next.authMethods[0].id }, controller.signal));
      }
      if (action === 'logout' && !controller.signal.aborted) await useAgentSettingsStore.getState().unbind(provider);
      if (!controller.signal.aborted) setState(next);
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error && /^agent\.[a-zA-Z]+$/.test(e.message) ? e.message : 'agent.failed');
    } finally {
      running.current = false;
      if (!controller.signal.aborted) setBusy(false);
      if (request.current === controller && !controller.signal.aborted) useAgentConnectionStore.getState().setAuthenticating(false);
    }
  }, [provider]);
  const bind = async (purpose: AgentPurpose) => {
    if (!state?.authenticated || running.current) return;
    running.current = true;
    request.current = null;
    setBusy(true); setCancellable(false); setError('');
    try {
      const choices = Object.fromEntries(state.options.map((option) => [option.id, option.currentValue]));
      await useAgentSettingsStore.getState().bind(purpose, { provider, choices });
      const app = useAppStore.getState();
      if (useAgentSettingsStore.getState().text) await app.setApiKeys({ ...app.apiKeys, mode: 'agent' });
    } catch { if (mounted.current) setError('agent.failed'); }
    finally { running.current = false; if (mounted.current) setBusy(false); }
  };
  const configured = (purpose: AgentPurpose) => {
    const binding = purpose === 'text' ? text : vision;
    return !!state && binding?.provider === provider && JSON.stringify(binding.choices) ===
      JSON.stringify(Object.fromEntries(state.options.map((option) => [option.id, option.currentValue])));
  };
  const knownErrors = ['agent.offline', 'agent.authRequired', 'agent.noVision', 'agent.startWithNpm', 'agent.invalidOption'];
  return <View style={styles.content}>
    <AppText variant="heading" style={styles.heading}>{t('agent.account')}</AppText>
    <AppText variant="secondary">{t(provider === 'claude' ? 'agent.console' : 'agent.loginHint')}</AppText>
    <SettingsRow title={state?.authenticated ? t('agent.refresh') : `${t('agent.signIn')} ${provider === 'codex' ? 'ChatGPT / Codex' : provider === 'claude' ? 'Anthropic Console' : 'Google / Gemini'}`}
      icon={state?.authenticated ? 'refresh' : 'externalLink'} disabled={busy || pendingLogin || (status !== 'connected' && prepareDisabled)}
      onPress={async () => {
        if (status === 'connected') { void run('inspect', {}, true); return; }
        if (await onPrepare() && mounted.current) {
          setPendingLogin(true);
          const connected = () => {
            const current = useAgentConnectionStore.getState();
            if (!current.connection) {
              stopWaiting.current?.(); stopWaiting.current = null; setPendingLogin(false);
              return;
            }
            if (current.status !== 'connected') return;
            stopWaiting.current?.(); stopWaiting.current = null;
            setPendingLogin(false); void run('inspect', {}, true);
          };
          stopWaiting.current = useAgentConnectionStore.subscribe(connected);
          connected();
        }
      }} />
    {busy || pendingLogin ? <View style={styles.pending}><ActivityIndicator color={colors.accent} /><AppText variant="secondary" style={styles.grow}>{t('agent.wait')}</AppText>
      {cancellable || pendingLogin ? <LoggedPressable accessibilityRole="button" accessibilityLabel={t('common.cancel')} style={styles.cancel}
        onPress={() => { stopWaiting.current?.(); stopWaiting.current = null; request.current?.abort(); setPendingLogin(false); setBusy(false); useAgentConnectionStore.getState().setAuthenticating(false); }}>
        <AppIcon name="x" size={20} />
      </LoggedPressable> : null}
    </View> : null}
    {state && !state.authenticated ? state.authMethods.map((method) => <SettingsRow key={method.id} title={method.name}
      subtitle={method.description ?? undefined} icon="externalLink" disabled={busy || status !== 'connected'}
      onPress={() => { void run('authenticate', { methodId: method.id }); }} />) : null}
    {state?.authenticated ? <>
      <AppText variant="caption" color={colors.success}>{t('agent.authenticated')}</AppText>
      {state.options.map((option) => <AgentOption key={option.id} option={option} disabled={busy || status !== 'connected'}
        onChange={(value) => { void run('setOption', { optionId: option.id, value }); }} />)}
      <SettingsRow title={t('agent.useText')} icon={configured('text') ? 'check' : 'message'} disabled={busy || status !== 'connected'}
        onPress={() => { void bind('text'); }} />
      <SettingsRow title={t('agent.useVision')} icon={configured('vision') ? 'check' : 'camera'}
        disabled={busy || status !== 'connected' || !state.imageSupported} onPress={() => { void bind('vision'); }} />
      {!state.imageSupported ? <AppText variant="caption">{t('agent.noVision')}</AppText> : null}
      {state.logoutSupported ? <SettingsRow title={t('agent.logout')} icon="x" iconColor={colors.danger}
        disabled={busy || status !== 'connected'} onPress={() => { void run('logout'); }} /> : null}
    </> : null}
    {error ? <AppText variant="secondary" color={colors.danger}>{t(knownErrors.includes(error) ? error as 'agent.offline' : 'agent.failed')}</AppText> : null}
  </View>;
}

const styles = StyleSheet.create({
  content: { gap: Spacing.two }, heading: { fontSize: 21 },
  pending: { flexDirection: 'row', gap: Spacing.three, alignItems: 'center' }, grow: { flex: 1, minWidth: 0 },
  options: { paddingHorizontal: Spacing.three }, list: { maxHeight: 280 },
  search: { minHeight: 44, padding: Spacing.two, fontSize: 16, fontFamily: Fonts.regular },
  option: { minHeight: 44, flexDirection: 'row', alignItems: 'center', padding: Spacing.two, gap: Spacing.two },
  cancel: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
