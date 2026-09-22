/**
 * Integer-cents money handling, shared by web and api.
 *
 * CLAUDE.md's first non-negotiable: money is NEVER a float. The dangerous moment
 * is the browser form, where a person types `12.34` and the obvious conversion —
 * `parseFloat(input) * 100` — is exactly the float maths that rule forbids. It
 * is also wrong: `parseFloat('1.15') * 100` is `114.99999999999999`, and
 * `Math.round` only papers over it until a value lands on a different boundary.
 *
 * So parsing here is STRING work: split on the decimal point and read each half
 * as an integer. No float ever exists.
 */

/**
 * Largest amount we accept, in cents — the maximum of Postgres `integer`, the
 * column type behind `amount_cents`. Rejecting at the boundary turns a database
 * overflow error into a clear validation message.
 */
export const MAX_AMOUNT_CENTS = 2_147_483_647;

/** `12`, `12.3`, `12.34` — with optional surrounding whitespace. Nothing else. */
const AMOUNT_PATTERN = /^(\d+)(?:\.(\d{1,2}))?$/;

/**
 * Parse a major-unit amount typed by a human into integer cents.
 *
 * Returns null rather than throwing, because every caller is a form that wants
 * to show a message rather than handle an exception. Deliberately strict: no
 * thousands separators, no currency symbols, no scientific notation, no more
 * than two decimal places — silently rounding `1.999` to `2.00` would be money
 * quietly changing behind the user's back.
 */
export function parseAmountToCents(input: string): number | null {
  const match = AMOUNT_PATTERN.exec(input.trim());

  if (!match) {
    return null;
  }

  const [, whole = '0', fraction = ''] = match;

  // `padEnd` so '12.3' reads as 30 cents, not 3.
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));

  if (!Number.isSafeInteger(cents) || cents > MAX_AMOUNT_CENTS) {
    return null;
  }

  return cents;
}

/**
 * Render integer cents as a major-unit string: `1234` becomes `'12.34'`.
 *
 * No currency symbol and no thousands separator — this is the inverse of
 * `parseAmountToCents`, so its output can go straight back into an input field
 * and survive the round trip. Show the currency code alongside it.
 */
export function formatCents(cents: number): string {
  const negative = cents < 0;
  const absolute = Math.abs(cents);
  const major = Math.floor(absolute / 100);
  const minor = absolute % 100;

  return `${negative ? '-' : ''}${String(major)}.${String(minor).padStart(2, '0')}`;
}

/**
 * Split a total into `count` shares that sum back to exactly the total.
 *
 * The remainder is the whole point: 1000 cents across 3 people is 333.33 each,
 * which does not exist. Everyone gets the floor, then the leftover cents are
 * handed out one each from the front, giving `[334, 333, 333]`. Dropping them
 * would lose money on most splits.
 *
 * Returns an empty array for a non-positive count so callers can render "no
 * participants" instead of dividing by zero.
 */
export function splitEvenly(totalCents: number, count: number): number[] {
  if (count <= 0) {
    return [];
  }

  const base = Math.floor(totalCents / count);
  const remainder = totalCents - base * count;

  return Array.from({ length: count }, (_, index) => (index < remainder ? base + 1 : base));
}

/** Sum of a list of shares. One place, so no caller reimplements the reduce. */
export function sumCents(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
