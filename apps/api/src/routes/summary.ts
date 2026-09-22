import { Router } from 'express';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import {
  groupSummaryResponseSchema,
  type CurrencySummary,
  type GroupSummary,
  type MemberBalance,
} from '@expense-tracker/shared';
import { viewerId } from '../auth/require-auth.js';
import { db } from '../db/client.js';
import { expense, expenseGroup, expenseShare, groupMember, user } from '../db/schema.js';
import { conflict, notFound } from '../http-error.js';
import { requireGroupMembership, requireGroupOwner } from './membership.js';

/**
 * What a group adds up to, and the settle placeholder.
 *
 * Every figure is per currency. Adding EUR to USD needs a rate and a date that
 * this app does not store, so a single group total would be invented — the
 * summary reports each currency separately instead.
 */
export const summaryRouter: Router = Router();

/**
 * Build the summary from three cheap aggregate queries rather than pulling every
 * expense into memory and reducing: Postgres already does this well, and the
 * result is bounded by (members x currencies) instead of by expense count.
 */
async function loadSummary(groupId: string): Promise<GroupSummary> {
  const [groupRow] = await db
    .select({ settledAt: expenseGroup.settledAt })
    .from(expenseGroup)
    .where(eq(expenseGroup.id, groupId))
    .limit(1);

  if (!groupRow) {
    throw notFound();
  }

  const members = await db
    .select({ userId: groupMember.userId, name: user.name })
    .from(groupMember)
    .innerJoin(user, eq(user.id, groupMember.userId))
    .where(eq(groupMember.groupId, groupId))
    .orderBy(asc(groupMember.joinedAt));

  // What each person paid out, per currency.
  const paidRows = await db
    .select({
      currency: expense.currency,
      userId: expense.paidBy,
      // `::int` because Postgres sums integers as bigint, which node-postgres
      // hands back as a STRING. Without the cast these become "9000" and the
      // arithmetic below turns into string concatenation.
      paidCents: sql<number>`sum(${expense.amountCents})::int`,
      expenseCount: sql<number>`count(*)::int`,
    })
    .from(expense)
    .where(eq(expense.groupId, groupId))
    .groupBy(expense.currency, expense.paidBy);

  // What each person's shares add up to, per currency.
  const owedRows = await db
    .select({
      currency: expense.currency,
      userId: expenseShare.userId,
      owedCents: sql<number>`sum(${expenseShare.shareCents})::int`,
    })
    .from(expenseShare)
    .innerJoin(expense, eq(expense.id, expenseShare.expenseId))
    .where(eq(expense.groupId, groupId))
    .groupBy(expense.currency, expenseShare.userId);

  const currencyCodes = new Set<string>([
    ...paidRows.map((row) => row.currency),
    ...owedRows.map((row) => row.currency),
  ]);

  const currencies: CurrencySummary[] = [...currencyCodes]
    .sort((left, right) => left.localeCompare(right))
    .map((currency) => {
      const paidByUser = new Map(
        paidRows.filter((row) => row.currency === currency).map((row) => [row.userId, row.paidCents]),
      );
      const owedByUser = new Map(
        owedRows.filter((row) => row.currency === currency).map((row) => [row.userId, row.owedCents]),
      );

      // Every member appears, including those with nothing in this currency, so
      // the roster does not shift between currency blocks in the UI.
      const balances: MemberBalance[] = members.map((member) => {
        const paidCents = paidByUser.get(member.userId) ?? 0;
        const owedCents = owedByUser.get(member.userId) ?? 0;

        return {
          userId: member.userId,
          name: member.name,
          paidCents,
          owedCents,
          netCents: paidCents - owedCents,
        };
      });

      return {
        currency,
        // The group total is the sum of what was PAID, which equals the sum of
        // what is owed — shares always sum to their expense's amount, enforced
        // transactionally when the expense is written.
        totalCents: balances.reduce((total, balance) => total + balance.paidCents, 0),
        expenseCount: paidRows
          .filter((row) => row.currency === currency)
          .reduce((total, row) => total + row.expenseCount, 0),
        balances,
      };
    });

  return {
    groupId,
    settledAt: groupRow.settledAt?.toISOString() ?? null,
    currencies,
  };
}

/** Totals and per-person balances. Any member may read it. */
summaryRouter.get('/groups/:groupId/summary', async (req, res) => {
  const userId = viewerId(req);
  const membership = await requireGroupMembership(req.params.groupId, userId);

  const summary = await loadSummary(membership.groupId);

  res.json(groupSummaryResponseSchema.parse({ summary }));
});

/**
 * Close a group out. PLACEHOLDER, deliberately.
 *
 * All it does today is stamp `settled_at` and hand back the final summary. What
 * it does NOT do is work out who should pay whom to clear the balances — that
 * needs settlement rules (and, for a multi-currency group, an exchange rate)
 * that have not been decided. The endpoint exists so the UI and the column are
 * in place for that work to slot into.
 */
summaryRouter.post('/groups/:groupId/settle', async (req, res) => {
  const userId = viewerId(req);
  const membership = await requireGroupOwner(req.params.groupId, userId);

  // `isNull` in the WHERE rather than a read-then-write: two simultaneous
  // settles cannot both succeed, and the loser gets the 409 instead of silently
  // overwriting the first settlement's timestamp.
  const updated = await db
    .update(expenseGroup)
    .set({ settledAt: new Date() })
    .where(and(eq(expenseGroup.id, membership.groupId), isNull(expenseGroup.settledAt)))
    .returning({ id: expenseGroup.id });

  if (updated.length === 0) {
    throw conflict('This group is already settled');
  }

  const summary = await loadSummary(membership.groupId);

  res.json(groupSummaryResponseSchema.parse({ summary }));
});
