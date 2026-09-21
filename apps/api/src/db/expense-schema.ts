/**
 * Domain tables — hand-written, unlike `auth-schema.ts` which is generated.
 *
 * The access model here is the important part, and it differs from the usual
 * "every row has an owner" shape: an expense group is SHARED. Membership in
 * `group_member` is the only thing that grants access, so `expense_group` has no
 * owner column to scope by. `createdBy` records who started it; it confers
 * nothing. See `requireGroupMembership` in `routes/membership.ts`, which is the
 * single place that check is implemented.
 *
 * Conventions in force (see CLAUDE.md):
 * - `casing: 'snake_case'` on both the client and drizzle.config.ts, so column
 *   names are derived — `groupType` becomes `group_type`. Never spell them out
 *   here, or the two configs can silently disagree.
 * - Every timestamp is `{ withTimezone: true }` and stored in UTC.
 * - Changing this file means `npm run db:generate` + `npm run db:migrate`.
 */
import { relations, sql } from 'drizzle-orm';
import { check, index, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth-schema.js';

/**
 * A shared pot of expenses — a trip, a flat, a dinner.
 *
 * `uuid` rather than Better Auth's `text` ids: these are ours, and a random uuid
 * can't be walked the way a sequential id can. Ids still leak nothing on their
 * own because every route 404s non-members.
 */
export const expenseGroup = pgTable('expense_group', {
  id: uuid().primaryKey().defaultRandom(),
  title: text().notNull(),
  /**
   * A free string for now ('general', 'trip', 'household'). Deliberately not an
   * enum or a lookup table yet — that lands when group types actually mean
   * something.
   */
  groupType: text().notNull().default('general'),
  /**
   * Who started the group. `restrict` on purpose: deleting a user who created a
   * shared group would either destroy other people's expense history (cascade)
   * or silently orphan it (set null). Failing loudly is correct until there is a
   * real account-deletion flow that reassigns or archives groups first.
   */
  createdBy: text()
    .notNull()
    .references(() => user.id, { onDelete: 'restrict' }),
  /** Null means open. Stamped by the settle placeholder; nothing reads it yet. */
  settledAt: timestamp({ withTimezone: true }),
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp({ withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

/**
 * The access-control table. A row here is what lets a user see a group at all.
 *
 * `userId` cascades: removing an account should remove its memberships. That is
 * safe precisely because membership carries no financial history — the money
 * lives in `expense`/`expense_share`, whose `restrict` foreign keys block the
 * delete first if the person ever paid for or owed anything.
 */
export const groupMember = pgTable(
  'group_member',
  {
    groupId: uuid()
      .notNull()
      .references(() => expenseGroup.id, { onDelete: 'cascade' }),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** 'owner' can add members; 'member' cannot. Checked in the handler. */
    role: text().notNull().default('member'),
    joinedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // Composite PK doubles as the uniqueness guarantee: nobody joins twice.
    primaryKey({ columns: [table.groupId, table.userId] }),
    // "Groups I'm in" is the hottest query in the app and leads with user_id,
    // which the composite PK above indexes second. Hence this one.
    index('group_member_user_idx').on(table.userId),
    check('group_member_role_valid', sql`${table.role} in ('owner', 'member')`),
  ],
);

export const expenseGroupRelations = relations(expenseGroup, ({ many, one }) => ({
  members: many(groupMember),
  creator: one(user, { fields: [expenseGroup.createdBy], references: [user.id] }),
}));

export const groupMemberRelations = relations(groupMember, ({ one }) => ({
  group: one(expenseGroup, { fields: [groupMember.groupId], references: [expenseGroup.id] }),
  user: one(user, { fields: [groupMember.userId], references: [user.id] }),
}));
