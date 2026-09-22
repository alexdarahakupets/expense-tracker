import { z } from 'zod';

/**
 * Group summary shapes — what a group adds up to, and who is ahead or behind.
 *
 * The organising rule: figures are reported PER CURRENCY and never added across
 * currencies. Summing EUR and USD needs an exchange rate and a date, neither of
 * which this app stores, so a single "group total" would be a fiction. One entry
 * per currency is the honest shape, and it is why `currencies` is an array
 * rather than a couple of scalar fields.
 */

/** One person's position in one currency. */
export const memberBalanceSchema = z.object({
  userId: z.string().min(1),
  name: z.string(),
  /** What they actually paid out for the group. */
  paidCents: z.number().int().nonnegative(),
  /** The sum of their shares — what the split says they were responsible for. */
  owedCents: z.number().int().nonnegative(),
  /**
   * `paidCents - owedCents`. Positive means the group owes them; negative means
   * they owe the group. Signed, so it is the one field that can go below zero.
   */
  netCents: z.number().int(),
});

export type MemberBalance = z.infer<typeof memberBalanceSchema>;

/** Everything spent in one currency, and how it lands across members. */
export const currencySummarySchema = z.object({
  currency: z.string(),
  totalCents: z.number().int().nonnegative(),
  expenseCount: z.number().int().nonnegative(),
  /**
   * Every group member appears, including those with nothing in this currency,
   * so the UI renders a stable roster instead of people appearing and vanishing
   * between currencies.
   */
  balances: z.array(memberBalanceSchema),
});

export type CurrencySummary = z.infer<typeof currencySummarySchema>;

export const groupSummarySchema = z.object({
  groupId: z.uuid(),
  /** Null while the group is open. */
  settledAt: z.iso.datetime().nullable(),
  /** One entry per currency used in the group. Never summed together. */
  currencies: z.array(currencySummarySchema),
});

export type GroupSummary = z.infer<typeof groupSummarySchema>;

/** Response shape of `GET /api/groups/:groupId/summary` and `POST .../settle`. */
export const groupSummaryResponseSchema = z.object({
  summary: groupSummarySchema,
});

export type GroupSummaryResponse = z.infer<typeof groupSummaryResponseSchema>;
