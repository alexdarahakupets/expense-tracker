import { describe, expect, it } from 'vitest';
import {
  formatCents,
  parseAmountToCents,
  splitEvenly,
  sumCents,
} from '@expense-tracker/shared';

/**
 * Pure arithmetic, no database. These guard CLAUDE.md's first non-negotiable:
 * money is never a float.
 */
describe('parseAmountToCents', () => {
  it('avoids the float trap that makes 1.15 into 114 cents', () => {
    // The naive conversion is `parseFloat('1.15') * 100`, which is
    // 114.99999999999999 and truncates to 114. This is the reason the parser
    // does string arithmetic instead, so the case is pinned.
    expect(Math.trunc(Number.parseFloat('1.15') * 100)).toBe(114);
    expect(parseAmountToCents('1.15')).toBe(115);
  });

  it('reads a single decimal place as tens of cents', () => {
    expect(parseAmountToCents('12.3')).toBe(1230);
  });

  it.each([
    ['12.34', 1234],
    ['12', 1200],
    ['  12.34  ', 1234],
    ['0.01', 1],
    ['0', 0],
  ])('parses %j as %i cents', (input, expected) => {
    expect(parseAmountToCents(input)).toBe(expected);
  });

  it.each(['1.999', '-5', '1,234.56', '$12', '1e3', 'abc', '', '12.', '.5', '1.2.3'])(
    'rejects %j rather than rounding it silently',
    (input) => {
      expect(parseAmountToCents(input)).toBeNull();
    },
  );

  it('rejects amounts beyond the int4 column it lands in', () => {
    expect(parseAmountToCents('21474836.47')).toBe(2_147_483_647);
    expect(parseAmountToCents('21474836.48')).toBeNull();
  });
});

describe('formatCents', () => {
  it.each([
    [1234, '12.34'],
    [5, '0.05'],
    [0, '0.00'],
    [-750, '-7.50'],
  ])('renders %i as %j', (cents, expected) => {
    expect(formatCents(cents)).toBe(expected);
  });

  it('round-trips through the parser', () => {
    for (const cents of [1, 5, 99, 100, 1234, 999_999]) {
      expect(parseAmountToCents(formatCents(cents))).toBe(cents);
    }
  });
});

describe('splitEvenly', () => {
  it('hands remainder cents out instead of losing them', () => {
    expect(splitEvenly(1000, 3)).toEqual([334, 333, 333]);
  });

  it.each([
    [1000, 3],
    [100, 3],
    [1, 3],
    [9000, 4],
    [7, 7],
    [5, 9],
    [123_456, 7],
  ])('always sums back to the total (%i across %i)', (total, count) => {
    expect(sumCents(splitEvenly(total, count))).toBe(total);
  });

  it('returns nothing for a group with no members rather than dividing by zero', () => {
    expect(splitEvenly(100, 0)).toEqual([]);
  });
});
