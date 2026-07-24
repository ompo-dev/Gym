// Reanimated 4 (SDK 57) eagerly initialises react-native-worklets on import, and
// that native module is absent in the node test env (`loadUnpackers` crashes).
// Reanimated's own bundled mock re-imports the real module, so it crashes too.
// This hand mock covers exactly the reanimated surface the app uses and touches
// no native code, so any component importing reanimated stays testable.
jest.mock('react-native-reanimated', () => {
  const { View, Text } = require('react-native');

  const identity = (value) => value;
  // Chainable stand-in for entering/exiting builders (FadeIn.duration(200)…).
  const chainable = new Proxy(() => chainable, { get: () => () => chainable });

  const Animated = {
    View,
    Text,
    createAnimatedComponent: (Component) => Component,
  };

  return {
    __esModule: true,
    default: Animated,
    Easing: new Proxy({}, { get: () => () => identity }),
    FadeIn: chainable,
    useSharedValue: (initial) => ({ value: initial }),
    useAnimatedStyle: () => ({}),
    useAnimatedProps: () => ({}),
    withTiming: (toValue) => toValue,
    withSequence: (...steps) => steps[steps.length - 1],
    withDelay: (_delay, animation) => animation,
    withSpring: (toValue) => toValue,
    cancelAnimation: () => {},
    interpolate: () => 0,
    runOnJS: (fn) => fn,
  };
});

// expo-linking@57 `parse()` calls getHostUri(), which — when no custom scheme is
// detected — falls back to `Constants.linkingUri`; that is undefined in the node
// test env and `.replace()` throws. Give the test Constants the app's real scheme
// (and a harmless linkingUri) so URL parsing works without touching app code.
try {
  const Constants = require('expo-constants').default ?? require('expo-constants');
  if (Constants) {
    if (Constants.linkingUri == null) Constants.linkingUri = 'gym://';
    if (Constants.expoConfig && Constants.expoConfig.scheme == null) {
      Constants.expoConfig.scheme = 'gym';
    }
  }
} catch {
  // expo-constants not resolvable in this suite — nothing to patch.
}
