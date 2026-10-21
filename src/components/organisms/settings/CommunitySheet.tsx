import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native';

import { AppIcon } from '@/components/atoms/AppIcon';
import { AppText } from '@/components/atoms/AppText';
import { LoggedPressable } from '@/components/atoms/Logged';
import { NativeSegmented } from '@/components/molecules/NativeSegmented';
import { SettingsRow } from '@/components/molecules/SettingsRow';
import { Fonts, Spacing } from '@/constants/theme';
import { CHANGELOG, addCommunityComment, addCommunityFeedback, issueCategory, issueStatus, loadCommunityComments,
  loadCommunityIssues, toggleCommunityVote, type CommunityComment, type CommunityIssue, type FeedbackCategory } from '@/core/community';
import { SettingsRepository } from '@/data/SettingsRepository';
import { useColors } from '@/hooks/use-colors';
import { getLang, t } from '@/i18n';

import { SheetFrame } from '../SheetFrame';
import { Divider } from './primitives';

type Tab = 'updates' | 'roadmap' | 'feedback';
const DRAFT_KEY = 'gymnotes.feedback-draft.v1';
const dateLabel = (date: string) => new Date(date.length === 10 ? `${date}T12:00:00` : date).toLocaleDateString(getLang(), {
  day: 'numeric', month: 'long', year: 'numeric',
});

function IssueDetail({ issue, onClose, onChange }: { issue: CommunityIssue; onClose: () => void; onChange: (issue: CommunityIssue) => void }) {
  const colors = useColors();
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [comment, setComment] = useState('');
  useEffect(() => {
    let active = true;
    loadCommunityComments(issue.number).then((value) => { if (active) setComments(value); })
      .catch(() => { if (active) setError(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [issue.number, attempt]);
  return <SheetFrame visible title={`#${issue.number}`} onClose={onClose} size="full">
    <View style={styles.content}>
      <AppText variant="heading" style={styles.heading}>{issue.title}</AppText>
      <AppText variant="caption">{`${issue.user.login} · ${dateLabel(issue.created_at)} · ${t(`community.${issueStatus(issue)}`)}`}</AppText>
      <AppText selectable>{issue.body?.slice(0, 12_000)}</AppText>
      <View style={styles.actions}>
        <SettingsRow title={`${t('community.vote')} (${issue.votes})`} icon={issue.voted ? 'check' : 'chevronUp'}
          iconColor={issue.voted ? colors.accent : colors.textSecondary} onPress={() => onChange(toggleCommunityVote(issue.number))} />
      </View>
      <Divider />
      {loading ? <ActivityIndicator color={colors.accent} /> : null}
      {error ? <SettingsRow title={t('community.error')} icon="refresh" onPress={() => {
        setLoading(true); setError(false); setAttempt((value) => value + 1);
      }} /> : null}
      {!loading && !error && !comments.length ? <AppText variant="secondary">{t('community.noComments')}</AppText> : null}
      {comments.map((comment) => <View key={comment.id} style={[styles.post, { borderColor: colors.border }]}>
        <AppText variant="label">{comment.user.login}</AppText>
        <AppText variant="caption">{dateLabel(comment.created_at)}</AppText>
        <AppText selectable variant="secondary">{comment.body.slice(0, 8000)}</AppText>
      </View>)}
      <TextInput value={comment} onChangeText={setComment} maxLength={1800} multiline
        accessibilityLabel={t('community.comment')} placeholder={t('community.comment')} placeholderTextColor={colors.textTertiary}
        style={[styles.commentInput, { color: colors.text, borderColor: colors.border }]} />
      <SettingsRow title={t('community.comment')} icon="message" disabled={!comment.trim()} onPress={() => {
        const next = addCommunityComment(issue.number, comment);
        setComments((current) => [...current, next]); setComment('');
        onChange({ ...issue, comments: issue.comments + 1 });
      }} />
    </View>
  </SheetFrame>;
}

function FeedbackComposer({ onClose, onCreate }: { onClose: () => void; onCreate: (issue: CommunityIssue) => void }) {
  const colors = useColors();
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [category, setCategory] = useState<FeedbackCategory>('feature');
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    void SettingsRepository.get(DRAFT_KEY).then((raw) => {
      if (!raw || !active) return;
      const draft = JSON.parse(raw);
      if (typeof draft.title === 'string') setTitle(draft.title.slice(0, 120));
      if (typeof draft.details === 'string') setDetails(draft.details.slice(0, 1800));
      if (['feature', 'bug', 'other'].includes(draft.category)) setCategory(draft.category);
    }).catch(() => {}).finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!loaded) return;
    const timer = setTimeout(() => { void SettingsRepository.set(DRAFT_KEY, JSON.stringify({ title, details, category })).catch(() => {}); }, 300);
    return () => clearTimeout(timer);
  }, [title, details, category, loaded]);
  const close = () => {
    if (loaded) void SettingsRepository.set(DRAFT_KEY, JSON.stringify({ title, details, category })).catch(() => {});
    onClose();
  };
  return <SheetFrame visible title={t('community.new')} onClose={close} size="full" keyboardAwareScroll>
    <View style={styles.content}>
      <NativeSegmented value={category} onChange={setCategory} options={[
        { value: 'feature', label: t('community.feature') }, { value: 'bug', label: t('community.bug') }, { value: 'other', label: t('community.other') },
      ]} />
      <TextInput value={title} onChangeText={setTitle} maxLength={120} multiline
        accessibilityLabel={t('community.titleField')} placeholder={t('community.titleField')} placeholderTextColor={colors.textTertiary}
        style={[styles.titleInput, { color: colors.text }]} />
      <TextInput value={details} onChangeText={setDetails} maxLength={1800} multiline textAlignVertical="top"
        accessibilityLabel={t('community.details')} placeholder={t('community.details')} placeholderTextColor={colors.textTertiary}
        style={[styles.detailsInput, { color: colors.text }]} />
      <AppText variant="caption">{`${details.length}/1800`}</AppText>
      <AppText variant="secondary">{t('community.publishHint')}</AppText>
      <SettingsRow title={t('community.publish')} icon="check" disabled={!loaded || !title.trim() || !details.trim()}
        onPress={() => {
          const issue = addCommunityFeedback(title, details, category);
          void SettingsRepository.set(DRAFT_KEY, '').catch(() => {});
          onCreate(issue);
        }} />
    </View>
  </SheetFrame>;
}

export function CommunitySheet({ initialTab = 'updates', onClose }: { initialTab?: Tab; onClose: () => void }) {
  const colors = useColors();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [issues, setIssues] = useState<CommunityIssue[]>([]);
  const [loading, setLoading] = useState(initialTab !== 'updates');
  const [error, setError] = useState(false);
  const [category, setCategory] = useState<FeedbackCategory | 'all'>('all');
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [newest, setNewest] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<CommunityIssue | null>(null);
  const [composing, setComposing] = useState(false);
  const request = useRef(0);
  const refresh = () => { setLoading(true); setError(false); setAttempt((value) => value + 1); };
  useEffect(() => {
    if (tab === 'updates') return;
    const current = ++request.current;
    loadCommunityIssues().then((data) => { if (request.current === current) setIssues(data); })
      .catch(() => { if (request.current === current) setError(true); })
      .finally(() => { if (request.current === current) setLoading(false); });
    return () => { request.current += 1; };
  }, [tab, attempt]);
  const filtered = issues.filter((issue) => (category === 'all' || issueCategory(issue) === category) &&
    (tab !== 'roadmap' || ['planned', 'progress'].includes(issueStatus(issue))))
    .sort((a, b) => newest ? Date.parse(b.created_at) - Date.parse(a.created_at) :
      b.votes - a.votes);
  const update = (issue: CommunityIssue) => {
    setIssues((current) => current.map((item) => item.number === issue.number ? issue : item));
    setSelected((current) => current?.number === issue.number ? issue : current);
  };
  const nested = composing ? <FeedbackComposer onClose={() => setComposing(false)} onCreate={(issue) => {
    setIssues((current) => [issue, ...current]); setCategory('all'); setNewest(true); setTab('feedback'); setComposing(false);
  }} /> : selected ? <IssueDetail issue={selected} onChange={update} onClose={() => setSelected(null)} /> : null;
  return <SheetFrame visible title={t('community.title')} onClose={onClose} size="full" nested={nested}>
    <View style={styles.content}>
      <AppText variant="caption" color={colors.accent}>{t('community.demo')}</AppText>
      <NativeSegmented value={tab} onChange={(next) => {
        if (next === tab) return;
        setLoading(next !== 'updates'); setError(false); setTab(next);
      }} options={[
        { value: 'updates', label: t('community.updates') }, { value: 'roadmap', label: t('community.roadmap') },
        { value: 'feedback', label: t('community.feedback') },
      ]} />
      {tab === 'updates' ? CHANGELOG.map((release) => {
        const text = getLang() === 'pt-BR' ? release.pt : release.en;
        return <View key={release.version} style={[styles.post, { borderColor: colors.border }]}>
          <AppText variant="caption">{`${dateLabel(release.date)} · v${release.version}`}</AppText>
          <AppText variant="heading" style={styles.heading}>{text.title}</AppText>
          {text.details.map((detail) => <AppText key={detail} variant="secondary">{detail}</AppText>)}
        </View>;
      }) : <>
        <View style={styles.filters}>
          <View style={styles.grow}><SettingsRow title={t('community.category')}
            select={{ value: category, options: ['all', 'feature', 'bug', 'other'].map((value) => ({ value, label: t(`community.${value as typeof category}`) })),
              onSelect: (value) => { setCategory(value as typeof category); setCategoryOpen(false); } }}
            onPress={() => setCategoryOpen((value) => !value)} /></View>
          <LoggedPressable accessibilityRole="button" accessibilityLabel={t(newest ? 'community.newest' : 'community.top')}
            style={styles.iconButton} onPress={() => setNewest((value) => !value)}>
            <AppIcon name={newest ? 'clock' : 'chevronUp'} />
          </LoggedPressable>
          <LoggedPressable accessibilityRole="button" accessibilityLabel={t('community.refresh')}
            style={styles.iconButton} onPress={refresh}><AppIcon name="refresh" /></LoggedPressable>
        </View>
        {categoryOpen ? <View>{(['all', 'feature', 'bug', 'other'] as const).map((value) => <SettingsRow key={value}
          title={t(`community.${value}`)} icon={category === value ? 'check' : undefined}
          onPress={() => { setCategory(value); setCategoryOpen(false); }} />)}</View> : null}
        {loading ? <ActivityIndicator color={colors.accent} /> : null}
        {error ? <SettingsRow title={t('community.error')} icon="refresh" onPress={refresh} /> : null}
        {!loading && !error && !filtered.length ? <AppText variant="secondary" style={styles.empty}>
          {t(tab === 'roadmap' ? 'community.noRoadmap' : 'community.empty')}
        </AppText> : null}
        {filtered.map((issue) => <View key={issue.number} style={[styles.post, { borderColor: colors.border }]}>
          <View style={styles.author}>
            <View style={[styles.avatar, { backgroundColor: colors.backgroundElement }]}>
              <AppText variant="caption">{issue.user.login.slice(0, 2).toUpperCase()}</AppText>
            </View>
            <AppText variant="caption" style={styles.grow}>{issue.user.login}</AppText>
            <LoggedPressable accessibilityRole="button" accessibilityLabel={`${t('community.vote')}: ${issue.title}`}
              accessibilityState={{ selected: issue.voted }} onPress={() => update(toggleCommunityVote(issue.number))}
              style={[styles.vote, { borderColor: issue.voted ? colors.accent : colors.border }]}>
              <AppIcon name="chevronUp" size={16} color={issue.voted ? colors.accent : colors.textSecondary} />
              <AppText variant="caption">{issue.votes}</AppText>
            </LoggedPressable>
          </View>
          <LoggedPressable accessibilityRole="button" accessibilityLabel={issue.title} onPress={() => setSelected(issue)} style={styles.issueBody}>
          <AppText variant="body" style={styles.issueTitle}>{issue.title}</AppText>
          <AppText variant="secondary" numberOfLines={3}>{issue.body?.slice(0, 300)}</AppText>
          <View style={styles.author}>
            <AppIcon name="circleDot" size={14} color={issueStatus(issue) === 'done' ? colors.success : colors.accent} />
            <AppText variant="caption">{t(`community.${issueStatus(issue)}`)}</AppText>
            <AppIcon name="message" size={14} /><AppText variant="caption">{issue.comments}</AppText>
          </View>
          </LoggedPressable>
        </View>)}
      </>}
      <SettingsRow title={t('community.new')} icon="message" onPress={() => setComposing(true)} />
    </View>
  </SheetFrame>;
}

const styles = StyleSheet.create({
  content: { gap: Spacing.four, paddingBottom: Spacing.seven },
  heading: { fontSize: 22, letterSpacing: 0 },
  post: { gap: Spacing.three, paddingVertical: Spacing.five, borderBottomWidth: StyleSheet.hairlineWidth },
  actions: { gap: Spacing.one },
  author: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  grow: { flex: 1, minWidth: 0 },
  avatar: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  vote: { minWidth: 64, minHeight: 44, paddingHorizontal: Spacing.three, borderWidth: 1, borderRadius: 8,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
  issueBody: { gap: Spacing.three },
  issueTitle: { fontWeight: '600' },
  filters: { flexDirection: 'row', alignItems: 'center' },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  empty: { paddingVertical: Spacing.seven },
  titleInput: { fontSize: 22, minHeight: 64, padding: Spacing.two, textAlignVertical: 'top', fontFamily: Fonts.regular },
  detailsInput: { fontSize: 17, minHeight: 180, padding: Spacing.two, lineHeight: 25, fontFamily: Fonts.regular },
  commentInput: { fontSize: 16, minHeight: 80, padding: Spacing.three, borderWidth: 1, borderRadius: 8, fontFamily: Fonts.regular },
});
