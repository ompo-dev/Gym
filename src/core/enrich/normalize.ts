import type { Domain } from '@/core/types';

const EXPR_RE = /\b\d+(?:[.,]\d+)?(?:(?:\s*(?:\+|\*|\/|vezes)\s*|\s+-\s+)\d+(?:[.,]\d+)?)+\b/gi;
const EN_WORKOUT_REPLACERS: readonly (readonly [RegExp, string])[] = [
  [/\bbp\b(?!\s*press)/gi, 'bench press'],
  [/\bohp\b/gi, 'overhead press'],
  [/\brdl\b/gi, 'romanian deadlift'],
  [/\binc\b/gi, 'incline'],
  [/\bdecl\b/gi, 'decline'],
  [/\bdb\b/gi, 'dumbbell'],
  [/\bbb\b/gi, 'barbell'],
  [/\blp\b/gi, 'leg press'],
  [/\blat\s*pd\b/gi, 'lat pulldown'],
];
const PT_WORKOUT_REPLACERS: readonly (readonly [RegExp, string])[] = [
  [/\bsup\b(?!\s*ino)/gi, 'supino'],
  [/\bdesenv\b/gi, 'desenvolvimento'],
  [/\bagach\b/gi, 'agachamento'],
  [/\brem\b(?!\s*ada)/gi, 'remada'],
];

interface NormalizeOptions {
  domain?: Domain;
  locale?: string;
}

function toNumber(token: string): number {
  return Number(token.replace(',', '.'));
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
}

function evaluateExpression(expression: string): string | null {
  const tokens = expression
    .toLowerCase()
    .replace(/vezes/g, '*')
    .match(/\d+(?:[.,]\d+)?|[+\-*/]/g);
  if (!tokens || tokens.length < 3) return null;

  const numbers = [toNumber(tokens[0])];
  const operators: string[] = [];

  for (let i = 1; i < tokens.length; i += 2) {
    const operator = tokens[i];
    const next = tokens[i + 1];
    if (!operator || !next) return null;
    operators.push(operator);
    numbers.push(toNumber(next));
  }

  const reducedNumbers = [numbers[0]];
  const reducedOperators: string[] = [];

  for (let i = 0; i < operators.length; i++) {
    const operator = operators[i];
    const next = numbers[i + 1];
    if (operator === '*') {
      reducedNumbers[reducedNumbers.length - 1] *= next;
      continue;
    }
    if (operator === '/') {
      if (next === 0) return null;
      reducedNumbers[reducedNumbers.length - 1] /= next;
      continue;
    }
    reducedOperators.push(operator);
    reducedNumbers.push(next);
  }

  let total = reducedNumbers[0];
  for (let i = 0; i < reducedOperators.length; i++) {
    total =
      reducedOperators[i] === '+'
        ? total + reducedNumbers[i + 1]
        : total - reducedNumbers[i + 1];
  }

  return formatNumber(total);
}

function expandWorkoutAbbreviations(text: string, locale?: string): string {
  const replacers = locale?.toLowerCase().startsWith('en')
    ? EN_WORKOUT_REPLACERS
    : PT_WORKOUT_REPLACERS;

  return replacers.reduce((current, [pattern, replacement]) => {
    return current.replace(pattern, replacement);
  }, text);
}

export function normalizeForEnrich(text: string, options: NormalizeOptions = {}): string {
  const expanded =
    options.domain === 'workout' ? expandWorkoutAbbreviations(text, options.locale) : text;
  return expanded.replace(EXPR_RE, (match) => evaluateExpression(match) ?? match);
}
