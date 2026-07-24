import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';

import { t } from '@/i18n';
import { useAppStore } from '@/store/useAppStore';

// iOS keeps the real native tab bar (SF Symbols + Liquid Glass on iOS 26).
// Android/web resolve `app-tabs.tsx`, a custom glass bar that mirrors this look.
export default function AppTabs() {
  useAppStore((s) => s.lang); // re-render labels when the language changes

  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Label>{t('diet.title')}</Label>
        <Icon sf={{ default: 'fork.knife', selected: 'fork.knife' }} />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="workout">
        <Label>{t('workout.title')}</Label>
        <Icon sf={{ default: 'dumbbell', selected: 'dumbbell.fill' }} />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
