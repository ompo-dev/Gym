import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';

import { t } from '@/i18n';
import { useAppStore } from '@/store/useAppStore';

// Native tabs render platform icons, not React SVG elements: iOS wants SF
// Symbols via `sf`, Android wants a drawable name. Passing a lucide component
// as `src` (the old code) renders nothing — that's why the icons were blank.
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
