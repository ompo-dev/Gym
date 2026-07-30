import { SettingsRepository } from '@/data/SettingsRepository';

/**
 * The device's IANA timezone, captured so the app (and a future backend) knows
 * where the user is. Scheduling itself is device-LOCAL — a DAILY notification
 * fires at the phone's clock regardless — so v1 does not reschedule on a tz
 * change; the value is stored for the backend and for later travel handling.
 *
 * No `expo-localization`: Hermes ships `Intl`, and this is the one call needed.
 */

const TZ_KEY = 'timezone';
const TZ_AUTO_KEY = 'timezone_auto';

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Auto by default: the stored flag is only ever '0' when the user turned it off. */
export async function isTimeZoneAuto(): Promise<boolean> {
  return (await SettingsRepository.get(TZ_AUTO_KEY)) !== '0';
}

export async function setTimeZoneAuto(auto: boolean): Promise<void> {
  await SettingsRepository.set(TZ_AUTO_KEY, auto ? '1' : '0');
  if (auto) await SettingsRepository.set(TZ_KEY, deviceTimeZone());
}

export async function getStoredTimeZone(): Promise<string> {
  return (await SettingsRepository.get(TZ_KEY)) ?? deviceTimeZone();
}

/** On boot: keep the stored tz current with the device when auto is on. */
export async function syncTimeZone(): Promise<void> {
  if (await isTimeZoneAuto()) {
    await SettingsRepository.set(TZ_KEY, deviceTimeZone());
  }
}
