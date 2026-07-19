import { normalizeForEnrich } from './normalize';

test('resolves addition and multiplication chains before enrich', () => {
  expect(normalizeForEnrich('2 vezes 50 + 10')).toBe('110');
  expect(normalizeForEnrich('100 + 50 / 2')).toBe('125');
});

test('keeps workout shorthand like 95x7 untouched', () => {
  expect(normalizeForEnrich('supino 95x7')).toBe('supino 95x7');
});

test('resolves subtraction when it is written as arithmetic', () => {
  expect(normalizeForEnrich('arroz 300 - 50')).toBe('arroz 250');
});

test('expands common en-US workout abbreviations before enrich', () => {
  expect(normalizeForEnrich('bp\n100x8', { domain: 'workout', locale: 'en-US' })).toBe(
    'bench press\n100x8',
  );
  expect(normalizeForEnrich('inc db press\n70x10', { domain: 'workout', locale: 'en-US' })).toBe(
    'incline dumbbell press\n70x10',
  );
});

test('expands common pt-BR workout abbreviations before enrich', () => {
  expect(normalizeForEnrich('sup\n100x8', { domain: 'workout', locale: 'pt-BR' })).toBe(
    'supino\n100x8',
  );
  expect(normalizeForEnrich('desenv halter\n26x10', { domain: 'workout', locale: 'pt-BR' })).toBe(
    'desenvolvimento halter\n26x10',
  );
  expect(normalizeForEnrich('LP\n100x8', { domain: 'workout', locale: 'pt-BR' })).toBe(
    'leg press\n100x8',
  );
  expect(normalizeForEnrich('Sipini reto', { domain: 'workout', locale: 'pt-BR' })).toBe(
    'supino reto',
  );
});
