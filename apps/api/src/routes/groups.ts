import { Router } from 'express';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import {
  addGroupMemberSchema,
  createGroupSchema,
  groupDetailResponseSchema,
  groupListResponseSchema,
  type GroupDetail,
  type GroupListResponse,
  type GroupMember,
} from '@expense-tracker/shared';
import { db } from '../db/client.js';
import { expenseGroup, groupMember, user } from '../db/schema.js';
import { conflict, notFound } from '../http-error.js';
import { parseBody } from '../validate.js';
import { requireGroupMembership, requireGroupOwner } from './membership.js';

/**
 * Expense groups. Mounted inside `protectedRouter`, so `req.auth` is guaranteed
 * and every route below has an authenticated user.
 *
 * The rule for every handler here: the caller's identity comes from
 * `req.auth.user.id` and NOWHERE else, and reachability comes from
 * `requireGroupMembership`. A `userId` in a body or query string is never read.
 */
export const groupsRouter: Router = Router();

/** `req.auth` is set by `requireAuth`; this narrows it and fails closed. */
function viewerId(req: { auth?: { user: { id: string } } }): string {
  const id = req.auth?.user.id;

  if (!id) {
    // Unreachable behind requireAuth. Kept as a hard stop so mounting this
    // router outside `protectedRouter` fails closed instead of running
    // unauthenticated queries.
    throw notFound();
  }

  return id;
}

/** Members of one group, oldest first, with the names the UI needs. */
async function loadMembers(groupId: string): Promise<GroupMember[]> {
  const rows = await db
    .select({
      userId: groupMember.userId,
      name: user.name,
      email: user.email,
      role: groupMember.role,
      joinedAt: groupMember.joinedAt,
    })
    .from(groupMember)
    .innerJoin(user, eq(user.id, groupMember.userId))
    .where(eq(groupMember.groupId, groupId))
    .orderBy(asc(groupMember.joinedAt));

  return rows.map((row) => ({
    userId: row.userId,
    name: row.name,
    email: row.email,
    role: row.role === 'owner' ? 'owner' : 'member',
    joinedAt: row.joinedAt.toISOString(),
  }));
}

/**
 * Groups the caller belongs to.
 *
 * The inner join against `group_member` IS the access control — there is no
 * separate filter to forget. A group the caller has not joined cannot appear in
 * this result set no matter what else changes.
 */
groupsRouter.get('/groups', async (req, res) => {
  const userId = viewerId(req);

  const rows = await db
    .select({
      id: expenseGroup.id,
      title: expenseGroup.title,
      groupType: expenseGroup.groupType,
      settledAt: expenseGroup.settledAt,
      createdAt: expenseGroup.createdAt,
      // Correlated subquery rather than a second join: joining `group_member`
      // twice (once to scope, once to count) would need an alias and a GROUP BY
      // for one number.
      memberCount: sql<number>`(
        select count(*)::int from "group_member"
        where "group_member"."group_id" = ${expenseGroup.id}
      )`,
    })
    .from(expenseGroup)
    .innerJoin(
      groupMember,
      and(eq(groupMember.groupId, expenseGroup.id), eq(groupMember.userId, userId)),
    )
    .orderBy(desc(expenseGroup.createdAt));

  const body: GroupListResponse = {
    groups: rows.map((row) => ({
      id: row.id,
      title: row.title,
      groupType: row.groupType,
      memberCount: row.memberCount,
      settledAt: row.settledAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    })),
  };

  res.json(groupListResponseSchema.parse(body));
});

/**
 * Create a group. The creator becomes its owner.
 *
 * Both writes go in one transaction: a group with no members would be invisible
 * to everyone including its creator — unreachable by definition, since
 * membership is the only way in.
 */
groupsRouter.post('/groups', async (req, res) => {
  const userId = viewerId(req);
  const input = parseBody(createGroupSchema, req.body);

  const created = await db.transaction(async (tx) => {
    const [group] = await tx
      .insert(expenseGroup)
      .values({ title: input.title, groupType: input.groupType, createdBy: userId })
      .returning();

    if (!group) {
      throw new Error('insert into expense_group returned no row');
    }

    await tx.insert(groupMember).values({ groupId: group.id, userId, role: 'owner' });

    return group;
  });

  const body: { group: GroupDetail } = {
    group: {
      id: created.id,
      title: created.title,
      groupType: created.groupType,
      memberCount: 1,
      settledAt: created.settledAt?.toISOString() ?? null,
      createdAt: created.createdAt.toISOString(),
      members: await loadMembers(created.id),
      viewerRole: 'owner',
    },
  };

  res.status(201).json(groupDetailResponseSchema.parse(body));
});

/** One group with its members. 404s for anyone who is not in it. */
groupsRouter.get('/groups/:groupId', async (req, res) => {
  const userId = viewerId(req);
  const membership = await requireGroupMembership(req.params.groupId, userId);

  const [group] = await db
    .select()
    .from(expenseGroup)
    .where(eq(expenseGroup.id, membership.groupId))
    .limit(1);

  if (!group) {
    // A membership row whose group is gone should be impossible — the FK
    // cascades. Treat it as "not found" rather than crashing.
    throw notFound();
  }

  const members = await loadMembers(membership.groupId);

  const body: { group: GroupDetail } = {
    group: {
      id: group.id,
      title: group.title,
      groupType: group.groupType,
      memberCount: members.length,
      settledAt: group.settledAt?.toISOString() ?? null,
      createdAt: group.createdAt.toISOString(),
      members,
      viewerRole: membership.role,
    },
  };

  res.json(groupDetailResponseSchema.parse(body));
});

/**
 * Add someone to a group by email. Owners only.
 *
 * Known and accepted: a 404 here tells the owner whether an email has an
 * account. Better Auth's sign-up already leaks that (registering a taken address
 * errors), so this adds no new surface — but an invite-code flow would close
 * both, and that is the documented next step.
 */
groupsRouter.post('/groups/:groupId/members', async (req, res) => {
  const userId = viewerId(req);
  const membership = await requireGroupOwner(req.params.groupId, userId);
  const input = parseBody(addGroupMemberSchema, req.body);

  // Compare case-insensitively: an address is the same account however it was
  // typed. This gives up the unique index on `email` for a sequential scan,
  // which is the right trade at this size and worth revisiting with a functional
  // index if the user table ever grows.
  const normalizedEmail = input.email.toLowerCase();

  const [target] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(sql`lower(${user.email})`, normalizedEmail))
    .limit(1);

  if (!target) {
    throw notFound('No account with that email address');
  }

  // `onConflictDoNothing` + `returning` makes the duplicate check race-safe:
  // two simultaneous adds cannot both insert, and the loser gets the 409 rather
  // than a primary-key violation surfacing as a 500.
  const inserted = await db
    .insert(groupMember)
    .values({ groupId: membership.groupId, userId: target.id, role: 'member' })
    .onConflictDoNothing()
    .returning();

  if (inserted.length === 0) {
    throw conflict('That person is already in this group');
  }

  const members = await loadMembers(membership.groupId);

  const [group] = await db
    .select()
    .from(expenseGroup)
    .where(eq(expenseGroup.id, membership.groupId))
    .limit(1);

  if (!group) {
    throw notFound();
  }

  const body: { group: GroupDetail } = {
    group: {
      id: group.id,
      title: group.title,
      groupType: group.groupType,
      memberCount: members.length,
      settledAt: group.settledAt?.toISOString() ?? null,
      createdAt: group.createdAt.toISOString(),
      members,
      viewerRole: membership.role,
    },
  };

  res.status(201).json(groupDetailResponseSchema.parse(body));
});
