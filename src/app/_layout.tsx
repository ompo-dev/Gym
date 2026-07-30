import { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import AppTabs from '@/components/app-tabs';
import { OnboardingTemplate } from '@/components/templates/OnboardingTemplate';
import { Colors } from '@/constants/theme';
// Side-effect import: TaskManager.defineTask must run at bundle init so the task
// exists on a cold background launch, not only after a component mounts.
import { registerEnrichDrain } from '@/core/background/enrichDrain';
import { bus } from '@/core/command/bus';
import { installErrorLogging, log } from '@/core/log';
import { initReminders } from '@/core/notifications/reminders';
import { useCommandLink } from '@/core/siri/useCommandLink';
import { useWidgetSync } from '@/core/widgets/useWidgetSync';
import { useAppStore } from '@/store/useAppStore';

// Once, at import: every uncaught error and rejection now flows through the
// same logger as the rest of the app, in the Metro terminal.
installErrorLogging();

export default function RootLayout() {
  const hydratePrefs = useAppStore((s) => s.hydratePrefs);
  const prefsLoaded = useAppStore((s) => s.prefsLoaded);
  const onboardingDone = useAppStore((s) => s.onboardingDone);

  // Siri / Shortcuts commands. Only once the app is past onboarding, so a
  // cold-start command has real tabs to land on.
  useCommandLink(prefsLoaded && onboardingDone);

  // Mirror today's diet/workout totals into the App Group for the home/lock
  // screen widgets (iOS, dev/standalone build only).
  useWidgetSync(prefsLoaded && onboardingDone);

  useEffect(() => {
    log.nav('app start');
    void hydratePrefs();
  }, [hydratePrefs]);

  // Once the app is hydrated and past onboarding: drain any note the in-memory
  // retry queue lost to an app kill, hand the same job to the OS for when the
  // app is never reopened, and re-assert the daily reminder. Runs when the gate
  // flips true; each call is idempotent.
  const backgroundReady = prefsLoaded && onboardingDone;
  useEffect(() => {
    if (!backgroundReady) return;
    void bus.resumePending();
    void registerEnrichDrain();
    void initReminders();
  }, [backgroundReady]);

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
