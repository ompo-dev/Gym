import { getLang, t } from '@/i18n';

import type { PurchaseData } from './schemas';

/**
 * Purchase vs. consumption, decided locally and before anything is sent.
 *
 * The model gets no vote here on purpose: a note misread as a purchase silently
 * drops a real meal out of the day's calories, and there is no screen on which
 * that failure is visible. A regex that is wrong is wrong the same way every
 * time, and has a test.
 */

/** Acquisition verbs. Tight on purpose — see `classifyFoodNote`. */
const BOUGHT_RE =
  /\b(comprei|compramos|comprado|comprada|comprados|compradas|paguei|pagamos|bought|purchased|paid)\b/;

/**
 * Consumption verbs.
 *
 * English "ate" is deliberately absent: unaccented "ate" is how a huge share of
 * Brazilians type "até", so "comprei arroz ate sexta" would read as a meal and
 * silently drop the purchase. "I ate" is rare in a log people write as "chicken
 * and rice"; losing it costs far less than misreading every dated purchase.
 */
const ATE_RE = /\b(comi|comemos|almocei|jantei|lanchei|tomei|bebi|ingeri|eaten|drank)\b/;

/** Lower-cased but NOT accent-folded, for the same "até" reason. */
export function classifyFoodNote(text: string): 'parse' | 'purchase' {
  const lowered = text.toLowerCase();
  // Eating wins over buying: "comprei um pastel e comi" is a meal. Counting
  // food that was only bought is a smaller lie than hiding food that was eaten,
  // and the user can already fix it by editing the note — an edit re-enriches.
  if (ATE_RE.test(lowered)) return 'parse';
  return BOUGHT_RE.test(lowered) ? 'purchase' : 'parse';
}

export function isPurchaseData(data: unknown): data is PurchaseData {
  return Boolean(data && typeof data === 'object' && 'purchase' in data);
}

/**
 * No `Intl`: Hermes ships it unevenly across platforms, and two locales do not
 * justify finding that out on a user's phone.
 * ponytail: the symbol follows the UI language, not the currency the money was
 * actually spent in. Store a currency on the line if the app ever travels.
 */
export function formatMoney(value: number): string {
  const fixed = value.toFixed(2);
  return getLang() === 'en-US' ? `$${fixed}` : `R$ ${fixed.replace('.', ',')}`;
}

export function purchaseTotalPrice(data: PurchaseData): number {
  return data.purchase.reduce((sum, item) => sum + (item.price ?? 0), 0);
}

/** The one-line summary on the note row, where a meal shows "620 cal". */
export function formatPurchaseTotal(data: PurchaseData): string {
  const total = purchaseTotalPrice(data);
  return total > 0 ? formatMoney(total) : t('purchase.noPrice');
}

/**
 * Price per kilo, derived rather than stored — so it can never drift from the
 * amount actually paid. Undefined when the note lacks either half.
 */
export function pricePerKg(item: { price?: number; grams?: number }): number | undefined {
  if (!item.price || !item.grams) return undefined;
  return (item.price / item.grams) * 1000;
}
