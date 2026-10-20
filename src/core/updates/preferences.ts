import { SettingsRepository } from '@/data/SettingsRepository';

const KEY = 'automatic_updates';

export async function getAppSettings() {
  return { automaticUpdates: (await SettingsRepository.get(KEY)) !== '0' };
}

export async function setAutomaticUpdates(enabled: boolean) {
  await SettingsRepository.set(KEY, enabled ? '1' : '0');
}
