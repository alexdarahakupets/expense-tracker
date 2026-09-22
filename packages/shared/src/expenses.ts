import { z } from 'zod';
import { MAX_AMOUNT_CENTS, formatCents, sumCents } from './money.js';

/**
 * Expense shapes shared by web and api.
 *
 * Amounts cross the wire as INTEGER CENTS, never as a decimal string: the
 * string-to-cents conversion happens once, in the browser form, using
 * `parseAmountToCents`. Keeping the wire format integral means no parser on the
 * server has to be trusted with rounding.
 */

export const EXPENSE_DESCRIPTION_MAX_LENGTH = 200;
export const EXPENSE_CATEGORY_MAX_LENGTH = 50;

/**
 * An ISO-4217 code, normalised to uppercase so `eur` and `EUR` are one currency
 * rather than two. Matches the `expense_currency_iso` CHECK in the database,
 * which is what stops a lowercase code getting in by another route.
 */
export const currencySchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{3}$/, 'Use a 3-letter currency code, like EUR')
  .transform((value) => value.toUpperCase());

/** One person's slice of an expense, as submitted. */
export const expenseShareInputSchema = z.object({
  userId: z.string().min(1),
  /** Zero is legal — a group member who sat this one out. Negative is not. */
  shareCents: z.number().int().nonnegative().max(MAX_AMOUNT_CENTS),
});

/**
 * Body of `POST /api/groups/:groupId/expenses`.
 *
 * The two refinements below are the custom-split rules, and they live here
 * rather than in the handler so the browser can apply the identical check and
 * disable its submit button with the same message the server would return.
 *
 * What this CANNOT check is whether those user ids belong to the group — that
 * needs the member list, so the handler does it. Shape here, authorization
 * there.
 */
export const createExpenseSchema = z
  .object({
    description: z
      .string()
      .trim()
      .min(1, 'Description is required')
      .max(EXPENSE_DESCRIPTION_MAX_LENGTH, 'Description is too long'),
    amountCents: z
      .number()
      .int()
      .positive('Amount must be greater than zero')
      .max(MAX_AMOUNT_CENTS, 'Amount is too large'),
    currency: currencySchema,
    category: z
      .string()
      .trim()
      .min(1, 'Category is required')
      .max(EXPENSE_CATEGORY_MAX_LENGTH, 'Category is too long')
      .default('uncategorised'),
    paidBy: z.string().min(1, 'Choose who paid'),
    shares: z.array(expenseShareInputSchema).min(1, 'At least one person needs a share'),
  })
  .superRefine((value, ctx) => {
    // Duplicate participants would silently double someone's debt, and the
    // composite primary key on expense_share would reject the insert with a
    // constraint violation rather than something a user could act on.
    const seen = new Set<string>();
    for (const share of value.shares) {
      if (seen.has(share.userId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['shares'],
          message: 'Each person can appear only once in the split',
        });
        return;
      }
      seen.add(share.userId);
    }

    // The invariant that cannot be a database CHECK, because it spans rows.
    const total = sumCents(value.shares.map((share) => share.shareCents));
    if (total !== value.amountCents) {
      ctx.addIssue({
        code: 'custom',
        path: ['shares'],
        message: `Shares add up to ${formatCents(total)}, but the expense is ${formatCents(
          value.amountCents,
        )}`,
      });
    }
  });

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

/** One person's slice, as returned — with the name so the UI needs no join. */
export const expenseShareSchema = z.object({
  userId: z.string().min(1),
  name: z.string(),
  shareCents: z.number().int().nonnegative(),
});

export type ExpenseShare = z.infer<typeof expenseShareSchema>;

/** An expense as the API returns it. */
export const expenseSchema = z.object({
  id: z.uuid(),
  groupId: z.uuid(),
  description: z.string(),
  amountCents: z.number().int().positive(),
  currency: z.string(),
  category: z.string(),
  paidBy: z.string().min(1),
  paidByName: z.string(),
  /** UTC ISO-8601 — when the expense was recorded. */
  createdAt: z.iso.datetime(),
  shares: z.array(expenseShareSchema),
});

export type Expense = z.infer<typeof expenseSchema>;

/** Response shape of `GET /api/groups/:groupId/expenses`. */
export const expenseListResponseSchema = z.object({
  expenses: z.array(expenseSchema),
});

export type ExpenseListResponse = z.infer<typeof expenseListResponseSchema>;

/** Response shape of `POST /api/groups/:groupId/expenses`. */
export const expenseResponseSchema = z.object({
  expense: expenseSchema,
});

export type ExpenseResponse = z.infer<typeof expenseResponseSchema>;
