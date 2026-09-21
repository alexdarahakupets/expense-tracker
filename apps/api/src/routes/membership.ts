import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { groupRoleSchema, type GroupRole } from '@expense-tracker/shared';
import { db } from '../db/client.js';
import { groupMember } from '../db/schema.js';
import { forbidden, notFound } from '../http-error.js';

/**
 * THE authorization boundary for every group-scoped route.
 *
 * Groups are shared, so the usual `where user_id = :me` does not apply — a row's
 * reachability comes from `group_member`, and this is the only place that lookup
 * is written. New routes call it first, before validation and before touching
 * any other table, so an outsider's request never reaches group data.
 *
 * Read `apps/api/src/db/expense-schema.ts` for why the tables are shaped this
 * way.
 */

/** What a verified membership tells the caller. */
export interface Membership {
  groupId: string;
  role: GroupRole;
}

/**
 * Group ids are uuids. A malformed one is rejected here rather than passed to
 * Postgres, which would raise `invalid input syntax for type uuid` — a 500 that
 * also confirms the id never existed.
 */
const groupIdSchema = z.uuid();

/**
 * Resolve the caller's membership, or throw 404.
 *
 * Deliberately 404 and not 403 for non-members: a 403 would confirm the group
 * id is real. A stranger and a wrong id get byte-identical responses, so group
 * ids cannot be probed. A malformed id takes the same path for the same reason.
 */
export async function requireGroupMembership(
  rawGroupId: string,
  userId: string,
): Promise<Membership> {
  const parsedGroupId = groupIdSchema.safeParse(rawGroupId);
  if (!parsedGroupId.success) {
    throw notFound();
  }

  const groupId = parsedGroupId.data;

  const [row] = await db
    .select({ role: groupMember.role })
    .from(groupMember)
    .where(and(eq(groupMember.groupId, groupId), eq(groupMember.userId, userId)))
    .limit(1);

  if (!row) {
    throw notFound();
  }

  // `role` is a plain text column with a CHECK behind it; parse rather than cast
  // so a value that somehow got past the constraint fails loudly here instead of
  // being trusted as a role.
  return { groupId, role: groupRoleSchema.parse(row.role) };
}

/**
 * Same as above, but the caller must also own the group.
 *
 * Stating "owners only" is safe: reaching this means they are already a member
 * and can see the member list, so the message reveals nothing new.
 */
export async function requireGroupOwner(rawGroupId: string, userId: string): Promise<Membership> {
  const membership = await requireGroupMembership(rawGroupId, userId);

  if (membership.role !== 'owner') {
    throw forbidden('Only the group owner can do that');
  }

  return membership;
}
