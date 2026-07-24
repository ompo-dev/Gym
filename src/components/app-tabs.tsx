import type { ComponentProps } from 'react';
import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon, type AppIconName } from '@/components/atoms/AppIcon';
import { AppText } from '@/components/atoms/AppText';
import { GlassSurface } from '@/components/atoms/GlassSurface';
import { LoggedPressable } from '@/components/atoms/Logged';
import { Radii, Spacing } from '@/constants/theme';
import { useColors } from '@/hooks/use-colors';
import { t } from '@/i18n';
import { useAppStore } from '@/store/useAppStore';

// expo-router 57 vendors React Navigation and no longer ships
// @react-navigation/bottom-tabs as a resolvable package, so derive the tab bar
// props straight from the Tabs component instead of importing the type.
type BottomTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

// The lucide equivalents of the SF Symbols the native bar uses (fork.knife /
// dumbbell), so both platforms read as the same tabs.
const TAB_META: Record<string, { icon: AppIconName; label: () => string }> = {
  index: { icon: 'utensils', label: () => t('diet.title') },
  workout: { icon: 'dumbbell', label: () => t('workout.title') },
};

/**
 * iOS-style floating glass tab bar for Android and web. The `GlassSurface` pill
 * already frosts (via expo-blur off iOS), so this reads like the iOS 26 native
 * tab bar instead of the Material bottom bar `NativeTabs` renders on Android.
 * Absolutely positioned so it floats over the scene — `DayTemplate` already
 * reserves the bottom clearance for it, exactly as it does for the native bar.
 */
function IosTabBar({ state, navigation }: BottomTabBarProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[styles.wrap, { paddingBottom: insets.bottom + Spacing.two }]}
      pointerEvents="box-none">
      <GlassSurface glass="regular" isInteractive style={styles.bar}>
        {state.routes.map((route, index) => {
          const meta = TAB_META[route.name];
          if (!meta) return null;
          const focused = state.index === index;
          const color = focused ? colors.accent : colors.textSecondary;
          const label = meta.label();

          return (
            <LoggedPressable
              key={route.key}
              onPress={() => {
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={label}
              style={styles.tab}>
              <AppIcon name={meta.icon} color={color} size={22} />
              <AppText variant="label" color={color}>
                {label}
              </AppText>
            </LoggedPressable>
          );
        })}
      </GlassSurface>
    </View>
  );
}

export default function AppTabs() {
  useAppStore((s) => s.lang); // re-render labels when the language changes
  const colors = useColors();

  return (
    <Tabs
      tabBar={(props) => <IosTabBar {...props} />}
      // Without this the scene sits on React Navigation's default white, which
      // showed as a bright block under the content on Android.
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.background } }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="workout" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
  },
  bar: {
    flexDirection: 'row',
    borderRadius: Radii.pill,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    overflow: 'hidden',
  },
  tab: {
    minWidth: 104,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
});
