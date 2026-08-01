import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { useScopeEnabled } from '@/core/dev/flags';
import { t } from '@/i18n';
import { useAppStore } from '@/store/useAppStore';

// SDK 57 moved these under NativeTabs.Trigger (they were top-level exports on
// SDK 54). Aliasing keeps the JSX below unchanged.
const { Label, Icon } = NativeTabs.Trigger;

// iOS keeps the real native tab bar (SF Symbols + Liquid Glass on iOS 26).
// Android/web resolve `app-tabs.tsx`, a custom glass bar that mirrors this look.
export default function AppTabs() {
  useAppStore((s) => s.lang); // re-render labels when the language changes
  const food = useScopeEnabled('food');
  const workout = useScopeEnabled('workout');

  return (
    <NativeTabs>
      {food && (
        <NativeTabs.Trigger name="index">
          <Label>{t('diet.title')}</Label>
          <Icon sf={{ default: 'fork.knife', selected: 'fork.knife' }} />
        </NativeTabs.Trigger>
      )}

      {workout && (
        <NativeTabs.Trigger name="workout">
          <Label>{t('workout.title')}</Label>
          <Icon sf={{ default: 'dumbbell', selected: 'dumbbell.fill' }} />
        </NativeTabs.Trigger>
      )}
    </NativeTabs>
  );
}
