import { nearbyGapLabel } from './date';

test('shows short gap labels for nearby timestamps', () => {
  expect(nearbyGapLabel(10_000, 9_000)).toBe('+1s');
  expect(nearbyGapLabel(180_000, 120_000)).toBe('+1m');
  expect(nearbyGapLabel(185_000, 120_000)).toBe('+1m 5s');
});

test('ignores distant or invalid gaps', () => {
  expect(nearbyGapLabel(10_000, 10_000)).toBeNull();
  expect(nearbyGapLabel(400_000, 0)).toBeNull();
});
