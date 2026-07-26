import { redirectSystemPath } from '@/app/+native-intent';

test('redirectSystemPath sends add links to the right tab', () => {
  expect(redirectSystemPath({ path: 'gym://add?domain=food', initial: true })).toBe('/');
  expect(redirectSystemPath({ path: 'gym://add?domain=workout', initial: true })).toBe('/workout');
  expect(redirectSystemPath({ path: 'add?domain=workout', initial: true })).toBe('/workout');
});
