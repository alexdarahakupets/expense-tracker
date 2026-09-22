import { Router } from 'express';
import { desc, eq, inArray } from 'drizzle-orm';
import {
  createExpenseSchema,
  expenseListResponseSchema,
  expenseResponseSchema,
  type Expense,
} from '@expense-tracker/shared';
import { viewerId } from '../auth/require-auth.js';
import { db } from '../db/client.js';
import { expense, expenseShare, groupMember, user } from '../db/schema.js';
import { badRequest, notFound } from '../http-error.js';
import { parseBody } from '../validate.js';
import { requireGroupMembership } from './membership.js';

/**
 * Expenses within a group. Mounted inside `protectedRouter`.
 *
 * Every handler calls `requireGroupMembership` FIRST — before validation, before
 * any other query — so a non-member's request never reaches expense data and
 * gets the same 404 a nonexistent group would.
 */
export const expensesRouter: Router = Router();

/**
 * Expenses for a group, newest first, each with its full split.
 *
 * Two queries rather than one join: a join would repeat every expense row once
 * per participant, and stitching that back apart is more code than fetching the
 * shares separately. `inArray` keeps it at two round trips regardless of how
 * many expenses there are — the N+1 this avoids is the obvious trap here.
 */
async function loadExpenses(groupId: string, onlyExpenseId?: string): Promise<Expense[]> {
  const rows = await db
    .select({
      id: expense.id,
      groupId: expense.groupId,
      description: expense.description,
      amountCents: expense.amountCents,
      currency: expense.currency,
      category: expense.category,
      paidBy: expense.paidBy,
      paidByName: user.name,
      createdAt: expense.createdAt,
    })
    .from(expense)
    .innerJoin(user, eq(user.id, expense.paidBy))
    .where(
      onlyExpenseId === undefined
        ? eq(expense.groupId, groupId)
        : eq(expense.id, onlyExpenseId),
    )
    .orderBy(desc(expense.createdAt));

  if (rows.length === 0) {
    return [];
  }

  const shareRows = await db
    .select({
      expenseId: expenseShare.expenseId,
      userId: expenseShare.userId,
      name: user.name,
      shareCents: expenseShare.shareCents,
    })
    .from(expenseShare)
    .innerJoin(user, eq(user.id, expenseShare.userId))
    .where(
      inArray(
        expenseShare.expenseId,
        rows.map((row) => row.id),
      ),
    );

  const sharesByExpense = new Map<string, Expense['shares']>();
  for (const share of shareRows) {
    const list = sharesByExpense.get(share.expenseId) ?? [];
    list.push({ userId: share.userId, name: share.name, shareCents: share.shareCents });
    sharesByExpense.set(share.expenseId, list);
  }

  return rows.map((row) => ({
    id: row.id,
    groupId: row.groupId,
    description: row.description,
    amountCents: row.amountCents,
    currency: row.currency,
    category: row.category,
    paidBy: row.paidBy,
    paidByName: row.paidByName,
    createdAt: row.createdAt.toISOString(),
    shares: sharesByExpense.get(row.id) ?? [],
  }));
}

/** Everything spent in a group the caller belongs to. */
expensesRouter.get('/groups/:groupId/expenses', async (req, res) => {
  const userId = viewerId(req);
  const membership = await requireGroupMembership(req.params.groupId, userId);

  const body = { expenses: await loadExpenses(membership.groupId) };

  res.json(expenseListResponseSchema.parse(body));
});

/**
 * Record an expense and its split.
 *
 * `createExpenseSchema` has already checked the arithmetic — shares sum to the
 * total, nobody appears twice. What it CANNOT check is whether those user ids
 * belong to this group, because that needs the member list. That check is here,
 * and it is what stops a member attributing a cost to an outsider or splitting
 * with one.
 *
 * Naming a non-member is a 400, not a 404: the caller is already in the group
 * and can read its member list, so "not a member of this group" tells them
 * nothing they could not already see.
 */
expensesRouter.post('/groups/:groupId/expenses', async (req, res) => {
  const userId = viewerId(req);
  const membership = await requireGroupMembership(req.params.groupId, userId);
  const input = parseBody(createExpenseSchema, req.body);

  const memberRows = await db
    .select({ userId: groupMember.userId })
    .from(groupMember)
    .where(eq(groupMember.groupId, membership.groupId));

  const memberIds = new Set(memberRows.map((row) => row.userId));

  if (!memberIds.has(input.paidBy)) {
    throw badRequest('Whoever paid must be a member of this group');
  }

  for (const share of input.shares) {
    if (!memberIds.has(share.userId)) {
      throw badRequest('Everyone in the split must be a member of this group');
    }
  }

  // One transaction for the expense and all of its shares. A committed expense
  // whose shares failed to write would break the sum invariant permanently, and
  // no CHECK constraint can catch that — it spans rows.
  const created = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(expense)
      .values({
        groupId: membership.groupId,
        description: input.description,
        amountCents: input.amountCents,
        currency: input.currency,
        category: input.category,
        paidBy: input.paidBy,
        // Who TYPED it, which is not always who paid.
        createdBy: userId,
      })
      .returning();

    if (!row) {
      throw new Error('insert into expense returned no row');
    }

    await tx.insert(expenseShare).values(
      input.shares.map((share) => ({
        expenseId: row.id,
        userId: share.userId,
        shareCents: share.shareCents,
      })),
    );

    return row;
  });

  const [reloaded] = await loadExpenses(membership.groupId, created.id);

  if (!reloaded) {
    throw notFound();
  }

  res.status(201).json(expenseResponseSchema.parse({ expense: reloaded }));
});
