import { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import AppTabs from '@/components/app-tabs';
import { OnboardingTemplate } from '@/components/templates/OnboardingTemplate';
import { Colors } from '@/constants/theme';
import { useAppStore } from '@/store/useAppStore';

export default function RootLayout() {
  const hydratePrefs = useAppStore((s) => s.hydratePrefs);
  const prefsLoaded = useAppStore((s) => s.prefsLoaded);
  const onboardingDone = useAppStore((s) => s.onboardingDone);

  useEffect(() => {
    void hydratePrefs();
  }, [hydratePrefs]);

  return (
    <SafeAreaProvider>
      {!prefsLoaded ? (
        <View style={{ flex: 1, backgroundColor: Colors.dark.background }} />
      ) : onboardingDone ? (
        <AppTabs />
      ) : (
        <OnboardingTemplate />
      )}
    </SafeAreaProvider>
  );
}
