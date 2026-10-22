import { redirectSystemPath } from '@/app/+native-intent';

test('connection return links open the home route for the dedicated handler', () => {
  expect(redirectSystemPath({ path: 'gym://connect?url=ws%3A%2F%2F192.168.1.10%3A3847%2Fapp&pairingId=public', initial: true })).toBe('/');
});

test('connection routing preserves workout and food shortcuts', () => {
  expect(redirectSystemPath({ path: 'gym://add?domain=workout', initial: true })).toBe('/workout');
  expect(redirectSystemPath({ path: 'gym://add?domain=food', initial: true })).toBe('/');
});
