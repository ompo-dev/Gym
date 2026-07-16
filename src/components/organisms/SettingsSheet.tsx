import Constants from 'expo-constants';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { AppIcon } from '@/components/atoms/AppIcon';
import { AppText } from '@/components/atoms/AppText';
import { SettingsRow } from '@/components/molecules/SettingsRow';
import { Metrics, Radii, Spacing } from '@/constants/theme';
import { defaultOnboardingProfile } from '@/core/onboarding';
import { SavedMealRepository } from '@/data/SavedMealRepository';
import { formatWaterMl } from '@/domains/food';
import { useColors } from '@/hooks/use-colors';
import { useFoodGoals } from '@/hooks/useFoodGoals';
import { t } from '@/i18n';
import { type ThemeMode, useAppStore } from '@/store/useAppStore';

import { SheetFrame } from './SheetFrame';

// Tints pulled from the reference screenshots (no theme token for these).
const TINT = { blue: '#2E9BFF', purple: '#8B5CF6', indigo: '#6366F1', magenta: '#E45AC0' };
const UPGRADE_BG = '#FFC933';
const UPGRADE_FG = '#151312';
// ponytail: placeholder app logos — real brand marks are out of scope for the clone.
const CLUSTER = ['#D97757', '#F5F5F5', '#0B0B0B', '#6C5CE7', '#4285F4'];
// ponytail: static placeholder — the app has no account/auth concept yet.
const ACCOUNT_NAME = 'Maicon Pereira Barbosa';
const ACCOUNT_EMAIL = 'maiconpb85@gmail.com';
const APPLE_HEALTH = 'Apple Health';
const THEME_ORDER: ThemeMode[] = ['system', 'light', 'dark'];

const noop = () => {};

function formatWeight(kg: number): string {
  return `${kg.toFixed(1)} kg`;
}

function formatThousands(value: number): string {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  const colors = useColors();
  return (
    <View style={styles.section}>
      <AppText variant="caption" color={colors.textTertiary} style={styles.sectionLabel}>
        {label}
      </AppText>
      <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>{children}</View>
    </View>
  );
}

function Divider() {
  const colors = useColors();
  return <View style={[styles.divider, { backgroundColor: colors.border }]} />;
}

function Chevron() {
  const colors = useColors();
  return <AppIcon name="chevronRight" color={colors.textTertiary} size={18} />;
}

function ValueTrailing({ label }: { label: string }) {
  const colors = useColors();
  return (
    <View style={styles.value}>
      <AppText variant="secondary" color={colors.textSecondary}>
        {label}
      </AppText>
      <AppIcon name="chevronDown" color={colors.textTertiary} size={16} />
    </View>
  );
}

function Toggle({ value, onValueChange }: { value: boolean; onValueChange: (v: boolean) => void }) {
  const colors = useColors();
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      trackColor={{ true: colors.success, false: colors.backgroundSelected }}
      thumbColor="#FFFFFF"
      ios_backgroundColor={colors.backgroundSelected}
    />
  );
}

function AccountCard() {
  const colors = useColors();
  return (
    <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
      <View style={styles.accountRow}>
        <AppText variant="body" color={colors.textSecondary}>
          {t('settings.account.name')}
        </AppText>
        <AppText variant="body" numberOfLines={1} style={styles.accountValue}>
          {ACCOUNT_NAME}
        </AppText>
      </View>
      <Divider />
      <View style={styles.accountRow}>
        <AppText variant="body" color={colors.textSecondary}>
          {t('settings.account.email')}
        </AppText>
        <AppText variant="body" numberOfLines={1} style={styles.accountValue}>
          {ACCOUNT_EMAIL}
        </AppText>
      </View>
    </View>
  );
}

function GoalsSummary() {
  const colors = useColors();
  const profile = useAppStore((s) => s.onboardingProfile) ?? defaultOnboardingProfile();
  const goals = useFoodGoals();

  return (
    <View style={styles.summary}>
      <View style={styles.summaryIcon}>
        <AppIcon name="target" color={TINT.blue} size={20} />
      </View>
      <View style={styles.summaryText}>
        <AppText style={styles.weight}>{formatWeight(profile.goalWeightKg)}</AppText>
        <View style={styles.macroLine}>
          <AppIcon name="flame" color={colors.calories} size={13} />
          <AppText variant="secondary" color={colors.textSecondary}>
            {` ${formatThousands(goals.calories)} cal  •  `}
            <AppText variant="secondary" color={colors.protein}>
              {'P '}
            </AppText>
            {`${goals.protein}g  •  `}
            <AppText variant="secondary" color={colors.carbs}>
              {'C '}
            </AppText>
            {`${goals.carbs}g  •  `}
            <AppText variant="secondary" color={colors.fat}>
              {'F '}
            </AppText>
            {`${goals.fat}g  •  `}
            <AppText variant="secondary" color={colors.water}>
              {'H '}
            </AppText>
            {formatWaterMl(goals.waterMl)}
          </AppText>
        </View>
      </View>
    </View>
  );
}

interface SettingsSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function SettingsSheet({ visible, onClose }: SettingsSheetProps) {
  const colors = useColors();
  useAppStore((s) => s.lang); // re-render strings when language changes
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const signOut = useAppStore((s) => s.signOut);
  const profile = useAppStore((s) => s.onboardingProfile) ?? defaultOnboardingProfile();

  // ponytail: visual-only toggles — no feature consumes these yet.
  const [water, setWater] = useState(false);
  const [location, setLocation] = useState(false);
  const [reminders, setReminders] = useState(false);
  const [summarize, setSummarize] = useState(false);
  const [appleHealth, setAppleHealth] = useState(false);
  const [autoTimezone, setAutoTimezone] = useState(true);
  const [savedMealsCount, setSavedMealsCount] = useState(0);

  useEffect(() => {
    if (!visible) return;
    void SavedMealRepository.count().then(setSavedMealsCount);
  }, [visible]);

  const cycleTheme = () => {
    const next = THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length];
    void setTheme(next);
  };

  // Close the sheet, then drop the onboarding flag → RootLayout shows onboarding.
  const handleSignOut = () => {
    onClose();
    void signOut();
  };

  return (
    <SheetFrame visible={visible} title={t('settings.title')} onClose={onClose} size="full">
      <AccountCard />

      <Section label={t('settings.section.goals')}>
        <GoalsSummary />
        <Divider />
        <SettingsRow title={t('settings.goals.manage')} trailing={<Chevron />} onPress={noop} />
      </Section>

      <Section label={t('settings.section.health')}>
        <SettingsRow
          icon="asterisk"
          iconColor={colors.danger}
          title={`${formatWeight(profile.weightKg)} ${t('settings.health.currentSuffix')}`}
          subtitle={t(`activity.${profile.activity}`)}
          trailing={<Chevron />}
          onPress={noop}
        />
        <Divider />
        <SettingsRow title={t('settings.health.manage')} trailing={<Chevron />} onPress={noop} />
      </Section>

      <Section label={t('settings.section.weight')}>
        <SettingsRow
          icon="scale"
          iconColor={TINT.purple}
          title={formatWeight(profile.weightKg)}
          subtitle={t('settings.weight.hint')}
          trailing={<Chevron />}
          onPress={noop}
        />
      </Section>

      <Section label={t('settings.section.water')}>
        <SettingsRow
          icon="droplet"
          iconColor={TINT.blue}
          title={t('settings.water.title')}
          subtitle={t('settings.water.hint')}
          trailing={<Toggle value={water} onValueChange={setWater} />}
        />
      </Section>

      <Section label={t('settings.section.meals')}>
        <SettingsRow
          icon="utensils"
          iconColor={colors.carbs}
          title={t('settings.meals.manage')}
          subtitle={`${savedMealsCount} ${t('settings.meals.saved')}`}
          trailing={<Chevron />}
          onPress={noop}
        />
      </Section>

      <Section label={t('settings.section.prefs')}>
        <SettingsRow
          icon="flame"
          iconColor={colors.calories}
          title={t('settings.prefs.bias')}
          subtitle={t(`bias.${profile.estimationBias}`)}
          trailing={<Chevron />}
          onPress={noop}
        />
        <Divider />
        <SettingsRow
          icon="sliders"
          iconColor={TINT.blue}
          title={t('settings.prefs.goalBar')}
          trailing={<Chevron />}
          onPress={noop}
        />
        <Divider />
        <SettingsRow
          icon="navigation"
          iconColor={colors.success}
          title={t('settings.prefs.location')}
          trailing={<Toggle value={location} onValueChange={setLocation} />}
        />
        <Divider />
        <SettingsRow
          icon="bell"
          iconColor={TINT.blue}
          title={t('settings.prefs.reminders')}
          trailing={<Toggle value={reminders} onValueChange={setReminders} />}
        />
        <Divider />
        <SettingsRow
          icon="sparkles"
          iconColor={colors.carbs}
          title={t('settings.prefs.summarize')}
          subtitle={`ⓘ ${t('settings.prefs.whatIsThis')}`}
          trailing={<Toggle value={summarize} onValueChange={setSummarize} />}
        />
      </Section>

      <Section label={APPLE_HEALTH}>
        <SettingsRow
          icon="heart"
          iconColor={colors.danger}
          title={APPLE_HEALTH}
          subtitle={t('settings.appleHealth.hint')}
          trailing={<Toggle value={appleHealth} onValueChange={setAppleHealth} />}
        />
      </Section>

      <Section label={t('settings.section.device')}>
        <SettingsRow
          icon="contrast"
          iconColor={TINT.indigo}
          title={t('settings.device.appearance')}
          trailing={<ValueTrailing label={t(`theme.${theme}`)} />}
          onPress={cycleTheme}
        />
        <Divider />
        <SettingsRow
          icon="globe"
          iconColor={TINT.magenta}
          title={t('settings.device.autoTimezone')}
          trailing={<Toggle value={autoTimezone} onValueChange={setAutoTimezone} />}
        />
        <Divider />
        <SettingsRow
          icon="mic"
          iconColor={TINT.blue}
          title={t('settings.device.dictation')}
          trailing={<ValueTrailing label={t('settings.device.dictationValue')} />}
          onPress={noop}
        />
      </Section>

      <Section label={t('settings.section.subscription')}>
        <View style={styles.subRow}>
          <View style={styles.summaryIcon}>
            <AppIcon name="crown" color={colors.textTertiary} size={20} />
          </View>
          <View style={styles.subText}>
            <AppText variant="body" style={styles.bold}>
              {t('settings.sub.none')}
            </AppText>
            <AppText variant="secondary" color={colors.textSecondary}>
              {t('settings.sub.hint')}
            </AppText>
          </View>
          <Pressable
            onPress={noop}
            accessibilityRole="button"
            style={({ pressed }) => [styles.upgrade, pressed && styles.pressed]}>
            <AppText variant="label" color={UPGRADE_FG}>
              {t('settings.sub.upgrade')}
            </AppText>
          </Pressable>
        </View>
      </Section>

      <Section label={t('settings.section.connect')}>
        <View style={styles.connectTop}>
          <View style={styles.cluster}>
            {CLUSTER.map((c, i) => (
              <View
                key={c}
                style={[
                  styles.logo,
                  { backgroundColor: c, borderColor: colors.backgroundElement },
                  i > 0 && styles.logoOverlap,
                ]}
              />
            ))}
          </View>
          <AppText variant="secondary" color={colors.textSecondary}>
            {t('settings.connect.desc')}
          </AppText>
        </View>
        <Divider />
        <SettingsRow
          title={t('settings.connect.instructions')}
          trailing={<Chevron />}
          onPress={noop}
        />
        <Divider />
        <SettingsRow
          title={t('settings.connect.api')}
          trailing={<ValueTrailing label={t('settings.connect.apiKeys')} />}
          onPress={noop}
        />
      </Section>

      <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
        <SettingsRow
          icon="star"
          iconColor={TINT.blue}
          title={t('settings.feedback')}
          trailing={<Chevron />}
          onPress={noop}
        />
      </View>

      <Section label={t('settings.section.legal')}>
        <SettingsRow title={t('settings.legal.terms')} trailing={<Chevron />} onPress={noop} />
        <Divider />
        <SettingsRow title={t('settings.legal.privacy')} trailing={<Chevron />} onPress={noop} />
      </Section>

      <Pressable
        onPress={handleSignOut}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.signOut,
          { backgroundColor: colors.backgroundElement },
          pressed && styles.pressed,
        ]}>
        <AppText variant="body" color={colors.danger} style={styles.bold}>
          {t('settings.signOut')}
        </AppText>
      </Pressable>

      <AppText variant="caption" color={colors.textTertiary} style={styles.version}>
        {`GymNotes ${Constants.expoConfig?.version ?? ''}`}
      </AppText>
    </SheetFrame>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.two,
  },
  sectionLabel: {
    fontSize: 14,
    marginLeft: Spacing.four,
  },
  card: {
    borderRadius: Radii.lg,
    overflow: 'hidden',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: Spacing.four,
  },
  value: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  accountRow: {
    minHeight: Metrics.rowMinHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  accountValue: {
    flexShrink: 1,
    textAlign: 'right',
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  summaryIcon: {
    width: 26,
    alignItems: 'center',
  },
  summaryText: {
    flex: 1,
    gap: Spacing.half,
  },
  weight: {
    fontSize: 19,
    fontWeight: '600',
  },
  macroLine: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.four,
  },
  subText: {
    flex: 1,
    gap: Spacing.half,
  },
  bold: {
    fontWeight: '700',
  },
  upgrade: {
    backgroundColor: UPGRADE_BG,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: Radii.pill,
  },
  pressed: {
    opacity: 0.6,
  },
  connectTop: {
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.four,
  },
  cluster: {
    flexDirection: 'row',
  },
  logo: {
    width: 36,
    height: 36,
    borderRadius: Radii.pill,
    borderWidth: 2,
  },
  logoOverlap: {
    marginLeft: -8,
  },
  signOut: {
    minHeight: Metrics.rowMinHeight,
    borderRadius: Radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  version: {
    textAlign: 'center',
  },
});
