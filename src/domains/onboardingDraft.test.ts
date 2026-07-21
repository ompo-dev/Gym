import { parseDraft } from './onboardingDraft';

// The parser is pure; the module it lives in reaches SQLite for load/save.
// jest hoists this above the import, which is why it works from down here.
jest.mock('@/data/SettingsRepository', () => ({ SettingsRepository: {} }));

test('restores what was answered before the app closed', () => {
  const raw = JSON.stringify({
    answers: { gender: 'female', considerations: ['athlete'] },
    notes: 'sem lactose',
  });
  expect(parseDraft(raw)).toEqual({
    answers: { gender: 'female', considerations: ['athlete'] },
    notes: 'sem lactose',
  });
});

test('a missing or empty draft is a fresh start, not a crash', () => {
  expect(parseDraft(null)).toEqual({ answers: {}, notes: '' });
  expect(parseDraft('')).toEqual({ answers: {}, notes: '' });
});

test('corrupt JSON costs the user nothing worse than starting over', () => {
  expect(parseDraft('{not json')).toEqual({ answers: {}, notes: '' });
  expect(parseDraft('"a string"')).toEqual({ answers: {}, notes: '' });
  expect(parseDraft('null')).toEqual({ answers: {}, notes: '' });
});

test('drops keys an app upgrade no longer knows about', () => {
  // A renamed or removed question must not resurrect as a phantom answer.
  const raw = JSON.stringify({ answers: { gender: 'male', favouriteColour: 'blue' }, notes: '' });
  expect(parseDraft(raw).answers).toEqual({ gender: 'male' });
});

test('rejects values of the wrong shape instead of trusting them', () => {
  // A number here would reach profileFromAnswers and become a silent NaN.
  const raw = JSON.stringify({ answers: { weightKg: 98, considerations: [1, 2] }, notes: 7 });
  expect(parseDraft(raw)).toEqual({ answers: {}, notes: '' });
});
