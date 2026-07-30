import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { todayISO } from '@/core/date';
import { log } from '@/core/log';
import { EntryRepository } from '@/data/EntryRepository';
import { SettingsRepository } from '@/data/SettingsRepository';
import { t } from '@/i18n';

import {
  normalizeReminderPrefs,
  type ReminderPrefs,
  shouldNudgeLapsed,
} from './reminderPrefs';

const ENABLED_KEY = 'reminders_enabled';
const HOUR_KEY = 'reminders_hour';
const MINUTE_KEY = 'reminders_minute';
const NUDGE_KEY = 'reminders_last_nudge';
const CHANNEL_ID = 'reminders';
/** Stable id → rescheduling replaces rather than stacks. */
const DAILY_ID = 'gym.daily-reminder';

const isNative = Platform.OS !== 'web';

// Module scope: a scheduled reminder that arrives while the app is foregrounded
// must still surface as a banner instead of being swallowed. Native only —
// expo-notifications has no handler to install on web.
if (isNative) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

function errText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function getReminderPrefs(): Promise<ReminderPrefs> {
  const [enabled, hour, minute] = await Promise.all([
    SettingsRepository.get(ENABLED_KEY),
    SettingsRepository.get(HOUR_KEY),
    SettingsRepository.get(MINUTE_KEY),
  ]);
  return normalizeReminderPrefs(enabled, hour, minute);
}

async function persist(prefs: ReminderPrefs): Promise<void> {
  await Promise.all([
    SettingsRepository.set(ENABLED_KEY, prefs.enabled ? '1' : '0'),
    SettingsRepository.set(HOUR_KEY, String(prefs.hour)),
    SettingsRepository.set(MINUTE_KEY, String(prefs.minute)),
  ]);
}

async function ensurePermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    // Android 13+ shows no permission prompt until at least one channel exists.
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: t('settings.reminders.title'),
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (
    current.granted ||
    current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  ) {
    return true;
  }
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

/**
 * Re-assert the schedule from scratch: drop the lone daily reminder by id, then
 * reschedule it if enabled. Idempotent — the app only ever schedules this one
 * repeating notification, so calling this twice never stacks duplicates. The
 * lapsed nudge fires immediately (`trigger: null`), so it is not a *scheduled*
 * notification and this never touches it.
 */
async function reschedule(prefs: ReminderPrefs): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(DAILY_ID).catch(() => {});
  if (!prefs.enabled) return;
  await Notifications.scheduleNotificationAsync({
    identifier: DAILY_ID,
    content: { title: t('reminders.dailyTitle'), body: t('reminders.dailyBody') },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: prefs.hour,
      minute: prefs.minute,
      channelId: CHANNEL_ID,
    },
  });
  log.note('reminder scheduled', { hour: prefs.hour, minute: prefs.minute });
}

/**
 * Turn reminders on/off. Returns false when permission was denied so the caller
 * can revert its toggle rather than show an on switch that does nothing.
 */
export async function setRemindersEnabled(enabled: boolean): Promise<boolean> {
  if (enabled && !(await ensurePermission())) return false;
  const prefs: ReminderPrefs = { ...(await getReminderPrefs()), enabled };
  await persist(prefs);
  await reschedule(prefs);
  return true;
}

export async function setReminderTime(hour: number, minute: number): Promise<void> {
  const prefs: ReminderPrefs = { ...(await getReminderPrefs()), hour, minute };
  await persist(prefs);
  await reschedule(prefs);
}

/**
 * On boot: re-assert the stored schedule. A DAILY trigger already survives
 * restarts, but reasserting is idempotent and covers the case where the OS
 * dropped it (permission revoked and re-granted, reinstall). Cheap no-op when
 * reminders are off or on web.
 */
export async function initReminders(): Promise<void> {
  if (!isNative) return;
  try {
    const prefs = await getReminderPrefs();
    if (prefs.enabled) await reschedule(prefs);
  } catch (error) {
    log.error('reminder init failed', { error: errText(error) });
  }
}

/**
 * Phase 3 — lapsed-user nudge, fired from the background task. If reminders are
 * on and no food/workout note landed in the last LAPSE_DAYS days, fire a one-off
 * local notification, deduped to once per calendar day so repeated wakes on the
 * same day never nag twice. Distinct copy and trigger from the daily reminder,
 * so the two do not collide on a normal day.
 */
export async function maybeNudgeLapsed(): Promise<boolean> {
  if (!isNative) return false;
  const prefs = await getReminderPrefs();
  if (!prefs.enabled) return false;
  const today = todayISO();
  const last = await EntryRepository.lastLoggedDate();
  if (!shouldNudgeLapsed(last, today)) return false;
  if ((await SettingsRepository.get(NUDGE_KEY)) === today) return false;
  await SettingsRepository.set(NUDGE_KEY, today);
  await Notifications.scheduleNotificationAsync({
    content: { title: t('reminders.lapsedTitle'), body: t('reminders.lapsedBody') },
    trigger: null,
  });
  log.note('lapsed nudge fired', { last });
  return true;
}
