import { getAnimatedMarkerIndex } from './WorkoutOutliner';

test('getAnimatedMarkerIndex skips flex animation when reopening resolved rows', () => {
  expect(
    getAnimatedMarkerIndex({
      isInitialSync: true,
      previousStatus: 'done',
      nextStatus: 'done',
      previousResolved: [],
      resolvedNow: [true, true],
      latestResolvedSet: 1,
    }),
  ).toBe(-1);
});

test('getAnimatedMarkerIndex animates the latest resolved set when thinking finishes', () => {
  expect(
    getAnimatedMarkerIndex({
      isInitialSync: false,
      previousStatus: 'thinking',
      nextStatus: 'done',
      previousResolved: [false, false],
      resolvedNow: [true, true],
      latestResolvedSet: 1,
    }),
  ).toBe(1);
});
