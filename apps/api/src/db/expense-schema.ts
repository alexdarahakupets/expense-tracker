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
import {
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
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

/**
 * A single spend inside a group.
 *
 * Money is `amountCents` (integer minor units) plus a `currency` code, never a
 * float — CLAUDE.md's first non-negotiable. The CHECK constraints are the last
 * line of defence: Zod already rejects a non-positive amount or a malformed
 * currency at the route boundary, but a bad migration or a hand-run UPDATE would
 * sail past that, and the database should not store a negative price.
 *
 * `paidBy` and `createdBy` are both `restrict`: someone who paid for things or
 * recorded them cannot be deleted out from under the group's history. They are
 * separate columns because the person who spent the money is often not the
 * person typing it in.
 */
export const expense = pgTable(
  'expense',
  {
    id: uuid().primaryKey().defaultRandom(),
    groupId: uuid()
      .notNull()
      .references(() => expenseGroup.id, { onDelete: 'cascade' }),
    description: text().notNull(),
    amountCents: integer().notNull(),
    /** ISO-4217, uppercase. Currencies are never summed across codes. */
    currency: text().notNull(),
    /** A plain string for now, same as `expenseGroup.groupType`. */
    category: text().notNull().default('uncategorised'),
    paidBy: text()
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    createdBy: text()
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    // Every read is "the expenses in this group", so this is the only index the
    // listing needs.
    index('expense_group_idx').on(table.groupId),
    check('expense_amount_positive', sql`${table.amountCents} > 0`),
    check('expense_currency_iso', sql`${table.currency} ~ '^[A-Z]{3}$'`),
  ],
);

/**
 * Who owes what for one expense — the custom-split table.
 *
 * The invariant that matters, `sum(share_cents) = expense.amount_cents`, CANNOT
 * be expressed as a CHECK: it spans rows. It is enforced twice instead — by a
 * Zod refinement at the route boundary, and by writing the expense and all its
 * shares inside ONE transaction, so a half-written split can never be committed.
 * Anything that writes here outside that path must re-establish it.
 *
 * A zero share is legal (someone in the group who didn't take part in this
 * particular expense); a negative one is not.
 */
export const expenseShare = pgTable(
  'expense_share',
  {
    expenseId: uuid()
      .notNull()
      .references(() => expense.id, { onDelete: 'cascade' }),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    shareCents: integer().notNull(),
  },
  (table) => [
    // Composite PK doubles as the guarantee that one person appears once per
    // expense — two rows for the same user would silently double their debt.
    primaryKey({ columns: [table.expenseId, table.userId] }),
    check('expense_share_non_negative', sql`${table.shareCents} >= 0`),
  ],
);

export const expenseRelations = relations(expense, ({ many, one }) => ({
  group: one(expenseGroup, { fields: [expense.groupId], references: [expenseGroup.id] }),
  payer: one(user, { fields: [expense.paidBy], references: [user.id] }),
  shares: many(expenseShare),
}));

export const expenseShareRelations = relations(expenseShare, ({ one }) => ({
  expense: one(expense, { fields: [expenseShare.expenseId], references: [expense.id] }),
  user: one(user, { fields: [expenseShare.userId], references: [user.id] }),
}));
