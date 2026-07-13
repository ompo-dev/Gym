import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';

/**
 * System Liquid Glass tab bar (iOS 26). SDK 54 API: Icon/Label are top-level
 * elements (not NativeTabs.Trigger.Label). No backgroundColor → native glass.
 */
export default function AppTabs() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Label>Diet</Label>
        <Icon sf="fork.knife" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="workout">
        <Label>Workout</Label>
        <Icon sf="dumbbell.fill" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
