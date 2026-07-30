import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { addDays, todayISO } from '@/core/date';
import { log } from '@/core/log';
import { syncTimeZone } from '@/core/timezone';
import { EntryRepository } from '@/data/EntryRepository';
import { SettingsRepository } from '@/data/SettingsRepository';
import {
  buildRoutine,
  ROUTINE_DAYS,
  type ScheduledSlot,
  SCHEDULED_SLOTS,
  slotTimes,
} from '@/domains/mealTiming';
import type { MealType } from '@/domains/schemas';
import { t } from '@/i18n';

import { shouldNudgeLapsed } from './reminderPrefs';

const ENABLED_KEY = 'reminders_enabled';
const NUDGE_KEY = 'reminders_last_nudge';
const CHANNEL_ID = 'reminders';
/** One stable id per slot → rescheduling replaces its own notification, never stacks. */
const slotId = (type: MealType): string => `gym.reminder.${type}`;

const isNative = Platform.OS !== 'web';

// Module scope: a scheduled reminder that arrives while the app is foregrounded
// must still surface as a banner. Native only — no handler to install on web.
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

// The three scheduled slots are breakfast/lunch/dinner; each maps to its own copy
// and short label. A switch (not dynamic `t(`reminders.${type}...`)`) so the keys
// stay statically checkable — MealType has eight values, only three have keys.
function slotCopy(type: MealType): { title: string; body: string } {
  switch (type) {
    case 'lunch':
      return { title: t('reminders.lunch.title'), body: t('reminders.lunch.body') };
    case 'dinner':
      return { title: t('reminders.dinner.title'), body: t('reminders.dinner.body') };
    default:
      return { title: t('reminders.breakfast.title'), body: t('reminders.breakfast.body') };
  }
}

export function slotLabel(type: MealType): string {
  switch (type) {
    case 'lunch':
      return t('reminders.slot.lunch');
    case 'dinner':
      return t('reminders.slot.dinner');
    default:
      return t('reminders.slot.breakfast');
  }
}

export async function remindersEnabled(): Promise<boolean> {
  return (await SettingsRepository.get(ENABLED_KEY)) === '1';
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

/** The learned (or default) time of each of the three scheduled slots. */
export async function getScheduledSlots(): Promise<ScheduledSlot[]> {
  const since = addDays(todayISO(), -ROUTINE_DAYS);
  const entries = await EntryRepository.findSince('food', since);
  return slotTimes(buildRoutine(entries));
}

/**
 * Re-assert the whole schedule from scratch: cancel each slot by id, then, if
 * enabled, reschedule all three at their learned times. Idempotent — every path
 * (toggle on, boot, background wake) calls this, and calling it twice never
 * stacks duplicates. The lapsed nudge fires with `trigger: null`, so it is not a
 * *scheduled* notification and this never touches it.
 *
 * DAILY (repeating), not DATE: reliable and dead simple. It cannot suppress a
 * single day's ping when the user already logged that meal — that needs a DATE
 * horizon and refill bookkeeping.
 * ponytail: DAILY now; upgrade to DATE + "already logged → skip today" if the
 * suppression is actually wanted.
 */
async function rescheduleAll(enabled: boolean): Promise<void> {
  await Promise.all(
    SCHEDULED_SLOTS.map((slot) =>
      Notifications.cancelScheduledNotificationAsync(slotId(slot.type)).catch(() => {}),
    ),
  );
  if (!enabled) return;
  const slots = await getScheduledSlots();
  for (const slot of slots) {
    await Notifications.scheduleNotificationAsync({
      identifier: slotId(slot.type),
      content: slotCopy(slot.type),
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: slot.hour,
        minute: slot.minute,
        channelId: CHANNEL_ID,
      },
    });
  }
  log.note('reminders scheduled', {
    slots: slots.map((s) => `${s.type} ${s.hour}:${s.minute}${s.learned ? '*' : ''}`),
  });
}

/**
 * Turn reminders on/off. Returns false when permission was denied so the caller
 * can revert its toggle rather than show an on switch that does nothing.
 */
export async function setRemindersEnabled(enabled: boolean): Promise<boolean> {
  if (enabled && !(await ensurePermission())) return false;
  await SettingsRepository.set(ENABLED_KEY, enabled ? '1' : '0');
  await rescheduleAll(enabled);
  return true;
}

/**
 * Recompute the routine and re-assert the schedule. Called from the background
 * task after the enrich drain, so today's new notes feed tomorrow's timing.
 * Cheap no-op when reminders are off or on web.
 */
export async function refreshSchedule(): Promise<void> {
  if (!isNative) return;
  try {
    await rescheduleAll(await remindersEnabled());
  } catch (error) {
    log.error('reminder refresh failed', { error: errText(error) });
  }
}

/** On boot: capture the device timezone, then re-assert the stored schedule. */
export async function initReminders(): Promise<void> {
  if (!isNative) return;
  try {
    await syncTimeZone();
    await rescheduleAll(await remindersEnabled());
  } catch (error) {
    log.error('reminder init failed', { error: errText(error) });
  }
}

/**
 * Lapsed-user nudge, fired from the background task. If reminders are on and no
 * food/workout note landed in the last LAPSE_DAYS days, fire a one-off local
 * notification, deduped to once per calendar day. Distinct copy and trigger from
 * the meal reminders, so they never collide.
 */
export async function maybeNudgeLapsed(): Promise<boolean> {
  if (!isNative) return false;
  if (!(await remindersEnabled())) return false;
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
