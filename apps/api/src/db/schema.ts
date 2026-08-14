/**
 * Drizzle table definitions — the single source of truth for the database shape.
 *
 * Empty for now: the auth tables arrive with Better Auth, domain tables after.
 *
 * Rules for anything added here:
 * - Every domain table gets a `userId` foreign key to the Better Auth user table,
 *   and every query against it is scoped to the authenticated user.
 * - Money is integer minor units (`amountCents`) plus a `currency` code. Never a float.
 * - Timestamps are `timestamp({ withTimezone: true })` and stored in UTC.
 * - Changing this file means running `npm run db:generate` and `npm run db:migrate`.
 *   Never hand-edit the database.
 *
 * The client is configured with `casing: 'snake_case'`, so camelCase fields here
 * become snake_case columns automatically (`amountCents` -> `amount_cents`).
 */

export {};
