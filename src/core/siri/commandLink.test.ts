import { parseCommandLink } from './commandLink';

describe('parseCommandLink', () => {
  it('parses a food add link, defaulting the domain', () => {
    expect(parseCommandLink('gym://add?text=comprei%202%20bananas')).toEqual({
      text: 'comprei 2 bananas',
      domain: 'food',
    });
  });

  it('parses an explicit workout link', () => {
    expect(parseCommandLink('gym://add?domain=workout&text=supino%2080kg%203x10')).toEqual({
      text: 'supino 80kg 3x10',
      domain: 'workout',
    });
  });

  it('accepts the `log` alias and an explicit date', () => {
    expect(parseCommandLink('gym://log?text=agua&date=2026-07-23')).toEqual({
      text: 'agua',
      domain: 'food',
      date: '2026-07-23',
    });
  });

  it('trims dictated whitespace', () => {
    expect(parseCommandLink('gym://add?text=%20%20frango%20%20')?.text).toBe('frango');
  });

  it('rejects an unknown host', () => {
    expect(parseCommandLink('gym://settings?text=x')).toBeNull();
  });

  it('rejects blank text', () => {
    expect(parseCommandLink('gym://add?domain=food')).toBeNull();
  });

  it('rejects an unknown domain rather than guessing', () => {
    expect(parseCommandLink('gym://add?text=x&domain=sleep')).toBeNull();
  });

  it('rejects a malformed date', () => {
    expect(parseCommandLink('gym://add?text=x&date=23-07-2026')).toBeNull();
  });

  it('ignores links from other schemes', () => {
    expect(parseCommandLink('https://example.com/add?text=x')).toBeNull();
  });
});
