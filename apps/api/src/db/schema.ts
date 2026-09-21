/**
 * Drizzle table definitions — the single source of truth for the database shape.
 *
 * The four Better Auth tables live in `auth-schema.ts`, which is generated — see
 * that file's header before editing it. Domain tables live in
 * `expense-schema.ts` and are written by hand.
 *
 * Rules for anything added there:
 * - Domain rows are reachable only through GROUP MEMBERSHIP: they carry a
 *   `groupId`, not an owner column, and every query joins `group_member` for the
 *   authenticated user. Groups are shared between users, so "scope to the
 *   current user" is the wrong shape — see `routes/membership.ts`, the one place
 *   that check lives.
 * - Money is integer minor units (`amountCents`) plus a `currency` code. Never a float.
 * - Timestamps are `timestamp({ withTimezone: true })` and stored in UTC.
 * - Changing this file means running `npm run db:generate` and `npm run db:migrate`.
 *   Never hand-edit the database.
 *
 * The client is configured with `casing: 'snake_case'`, so camelCase fields here
 * become snake_case columns automatically (`amountCents` -> `amount_cents`).
 */

// Re-exported rather than imported-and-listed so both `drizzle(pool, { schema })`
// and drizzle.config.ts's `schema: './src/db/schema.ts'` see one flat namespace.
export * from './auth-schema.js';
export * from './expense-schema.js';
