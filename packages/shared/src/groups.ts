import { z } from 'zod';
import { emailSchema } from './auth.js';

/**
 * Expense-group shapes shared by web and api.
 *
 * The API validates request bodies against these at the route boundary AND
 * parses its own responses through them on the way out, so a handler that starts
 * returning an extra column fails here rather than leaking it. The client uses
 * the same definitions for its forms — one source of truth, no drift.
 */

export const GROUP_TITLE_MAX_LENGTH = 100;
export const GROUP_TYPE_MAX_LENGTH = 50;

/**
 * 'owner' may add members; 'member' may not. Mirrors the `group_member_role_valid`
 * CHECK constraint in the database — change one and you must change the other.
 */
export const groupRoleSchema = z.enum(['owner', 'member']);
export type GroupRole = z.infer<typeof groupRoleSchema>;

/** Body of `POST /api/groups`. */
export const createGroupSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Title is required')
    .max(GROUP_TITLE_MAX_LENGTH, 'Title is too long'),
  /**
   * A plain string for now — 'general', 'trip', 'household'. Becomes a real
   * enum or lookup table when group types actually drive behaviour.
   */
  groupType: z
    .string()
    .trim()
    .min(1, 'Type is required')
    .max(GROUP_TYPE_MAX_LENGTH, 'Type is too long')
    .default('general'),
});

export type CreateGroupInput = z.infer<typeof createGroupSchema>;

/**
 * Body of `POST /api/groups/:groupId/members`.
 *
 * Email, not a user id: ids aren't discoverable and shouldn't be. The server
 * resolves it to an account and 404s if there isn't one.
 */
export const addGroupMemberSchema = z.object({
  email: emailSchema,
});

export type AddGroupMemberInput = z.infer<typeof addGroupMemberSchema>;

/** A member as the API returns them. No password, no tokens, no session data. */
export const groupMemberSchema = z.object({
  userId: z.string().min(1),
  name: z.string(),
  email: z.email(),
  role: groupRoleSchema,
  /** UTC ISO-8601. */
  joinedAt: z.iso.datetime(),
});

export type GroupMember = z.infer<typeof groupMemberSchema>;

/**
 * A group as it appears in the list. Deliberately has no money on it — expense
 * totals arrive with the summary endpoint in a later slice, and adding them here
 * first would mean two places computing the same figure.
 */
export const groupListItemSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  groupType: z.string(),
  memberCount: z.number().int().nonnegative(),
  /** Null while the group is open. */
  settledAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});

export type GroupListItem = z.infer<typeof groupListItemSchema>;

/** Response shape of `GET /api/groups`. */
export const groupListResponseSchema = z.object({
  groups: z.array(groupListItemSchema),
});

export type GroupListResponse = z.infer<typeof groupListResponseSchema>;

/**
 * A single group with its members.
 *
 * `viewerRole` saves the client from inferring its own permissions by hunting
 * for itself in `members` — the server already knows, and the UI should ask
 * rather than guess. It is a display hint only; the server re-checks on write.
 */
export const groupDetailSchema = groupListItemSchema.extend({
  members: z.array(groupMemberSchema),
  viewerRole: groupRoleSchema,
});

export type GroupDetail = z.infer<typeof groupDetailSchema>;

/** Response shape of `GET /api/groups/:groupId` and `POST /api/groups`. */
export const groupDetailResponseSchema = z.object({
  group: groupDetailSchema,
});

export type GroupDetailResponse = z.infer<typeof groupDetailResponseSchema>;
