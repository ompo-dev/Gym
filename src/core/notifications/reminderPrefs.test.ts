import {
  DEFAULT_REMINDER_HOUR,
  DEFAULT_REMINDER_MINUTE,
  formatReminderTime,
  normalizeReminderPrefs,
  shouldNudgeLapsed,
} from './reminderPrefs';

describe('normalizeReminderPrefs', () => {
  test('parses valid stored strings', () => {
    expect(normalizeReminderPrefs('1', '7', '30')).toEqual({
      enabled: true,
      hour: 7,
      minute: 30,
    });
  });

  test('enabled is true only for "1"', () => {
    expect(normalizeReminderPrefs('0', '7', '30').enabled).toBe(false);
    expect(normalizeReminderPrefs(null, '7', '30').enabled).toBe(false);
  });

  test('falls back to defaults on missing or out-of-range values', () => {
    expect(normalizeReminderPrefs(null, null, null)).toEqual({
      enabled: false,
      hour: DEFAULT_REMINDER_HOUR,
      minute: DEFAULT_REMINDER_MINUTE,
    });
    // 25h / 70min are impossible clock values; junk is not a number.
    expect(normalizeReminderPrefs('1', '25', '70')).toEqual({
      enabled: true,
      hour: DEFAULT_REMINDER_HOUR,
      minute: DEFAULT_REMINDER_MINUTE,
    });
    expect(normalizeReminderPrefs('1', '-1', 'x')).toEqual({
      enabled: true,
      hour: DEFAULT_REMINDER_HOUR,
      minute: DEFAULT_REMINDER_MINUTE,
    });
  });
});

describe('formatReminderTime', () => {
  test('zero-pads hours and minutes', () => {
    expect(formatReminderTime(7, 5)).toBe('07:05');
    expect(formatReminderTime(20, 0)).toBe('20:00');
    expect(formatReminderTime(0, 0)).toBe('00:00');
  });
});

describe('shouldNudgeLapsed', () => {
  const today = '2026-07-30';

  test('never logged → nudge', () => {
    expect(shouldNudgeLapsed(null, today)).toBe(true);
  });

  test('logged today or yesterday → stay quiet (daily reminder covers it)', () => {
    expect(shouldNudgeLapsed('2026-07-30', today)).toBe(false);
    expect(shouldNudgeLapsed('2026-07-29', today)).toBe(false);
  });

  test('last log at least LAPSE_DAYS ago → nudge', () => {
    expect(shouldNudgeLapsed('2026-07-28', today)).toBe(true); // exactly 2 days
    expect(shouldNudgeLapsed('2026-07-20', today)).toBe(true);
  });

  test('respects a custom lapse window', () => {
    expect(shouldNudgeLapsed('2026-07-28', today, 3)).toBe(false); // 2 < 3
    expect(shouldNudgeLapsed('2026-07-27', today, 3)).toBe(true); // 3 >= 3
  });
});
