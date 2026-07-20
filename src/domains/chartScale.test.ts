import { niceDomain, trimLeadingGaps } from './chartScale';

test('values far from zero zoom in instead of flattening against the origin', () => {
  // Loads between 100 and 110 on a 0-120 axis are a straight line; the point
  // of the chart is the 10 kg of movement.
  const domain = niceDomain([100, 105, 110]);

  expect(domain.min).toBeGreaterThan(0);
  expect(domain.min).toBeLessThanOrEqual(100);
  expect(domain.max).toBeGreaterThanOrEqual(110);
  // The data should occupy most of the axis, not a sliver of it.
  expect((110 - 100) / (domain.max - domain.min)).toBeGreaterThan(0.4);
});

test('values that hug zero keep zero as the floor', () => {
  const domain = niceDomain([1, 4, 9]);

  expect(domain.min).toBe(0);
});

test('counts opt out of zooming, because none is a real value', () => {
  const domain = niceDomain([8, 10, 12], { zeroBased: true });

  expect(domain.min).toBe(0);
});

test('a flat series still gets a band around it', () => {
  const domain = niceDomain([300, 300, 300]);

  expect(domain.min).toBeLessThan(300);
  expect(domain.max).toBeGreaterThan(300);
});

test('ticks span the domain evenly and include both ends', () => {
  const domain = niceDomain([0, 50], { tickCount: 4 });

  expect(domain.ticks.length).toBeGreaterThan(1);
  expect(domain.ticks[0]).toBe(domain.min);
  expect(domain.ticks[domain.ticks.length - 1]).toBe(domain.max);

  // Even spacing matters more than a fixed count: the count follows the step so
  // that every tick lands on a round number.
  const gaps = domain.ticks.slice(1).map((tick, i) => tick - domain.ticks[i]);
  gaps.forEach((gap) => expect(gap).toBeCloseTo(gaps[0], 6));
});

test('bounds land on numbers a person would pick', () => {
  const domain = niceDomain([3, 27]);

  // Not 3 and 27: the axis should read in round steps.
  expect(domain.max % 5).toBe(0);
  expect(Number.isInteger(domain.max)).toBe(true);
});

test('an empty series does not produce a broken axis', () => {
  const domain = niceDomain([]);

  expect(domain.min).toBe(0);
  expect(domain.max).toBeGreaterThan(0);
  expect(domain.ticks.length).toBeGreaterThan(1);
});

test('negative or zero values never push the floor below zero', () => {
  // Nothing this app charts can be negative; a stray 0 must not invert the axis.
  expect(niceDomain([0, 5]).min).toBe(0);
  expect(niceDomain([0, 0]).min).toBe(0);
});

test('sparse readings float inside the axis instead of sitting on its edges', () => {
  // Two sessions is the common "just started" case; both landing on the border
  // reads as a clipped chart rather than as two data points.
  const domain = niceDomain([300, 360]);

  expect(domain.min).toBeLessThan(300);
  expect(domain.max).toBeGreaterThan(360);
});

test('a single reading is centred, not pinned to a corner', () => {
  const domain = niceDomain([300]);
  const middle = (domain.min + domain.max) / 2;

  // Within one tick of the centre is close enough to read as centred.
  const tick = (domain.max - domain.min) / 4;
  expect(Math.abs(300 - middle)).toBeLessThanOrEqual(tick);
});

test('a dense series still fits tightly, no wasted axis', () => {
  const domain = niceDomain([100, 102, 104, 106, 108, 110]);
  const used = (110 - 100) / (domain.max - domain.min);

  expect(used).toBeGreaterThan(0.4);
});

test('a time axis steps in units runners read, not in tens', () => {
  // 5:00 to 6:00 per km. A decimal ladder gives 4:48 and 5:25; the time ladder
  // gives half-minutes.
  const domain = niceDomain([300, 360], { scale: 'time' });

  domain.ticks.forEach((tick) => expect(tick % 15).toBe(0));
});

test('every tick is a multiple of the step, not a slice of the range', () => {
  const domain = niceDomain([280, 700], { scale: 'time' });
  const step = domain.ticks[1] - domain.ticks[0];

  domain.ticks.forEach((tick) => expect(tick % step).toBe(0));
});

test('a series only starts on the day it was first logged', () => {
  // First pelvic thrust ever was on the third bucket; drawing it at zero before
  // that says the exercise existed and was skipped.
  expect(trimLeadingGaps([0, 0, 3, 4])).toEqual([null, null, 3, 4]);
});

test('zeros after the first appearance are kept, because they are real', () => {
  expect(trimLeadingGaps([3, 0, 4])).toEqual([3, 0, 4]);
});

test('a series with no data at all is entirely blank', () => {
  expect(trimLeadingGaps([0, 0, 0])).toEqual([null, null, null]);
});
