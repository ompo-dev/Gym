import { SettingsRepository } from '@/data/SettingsRepository';

export default {
  getItem: (key: string) => SettingsRepository.get(key),
  setItem: (key: string, value: string) => SettingsRepository.set(key, value),
  removeItem: (key: string) => SettingsRepository.set(key, ''),
};
