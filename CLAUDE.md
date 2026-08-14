# CLAUDE.md — Expense Tracker

## What this project is
A multi-user expense tracker. Users sign in and manage their own expenses.
Kept intentionally small for now; built to be iterated on. Every user only ever
sees and touches their own data.

## Stack
- **Monorepo**: workspaces, TypeScript everywhere.
- **Frontend**: `apps/web` — Vite + React + TypeScript (SPA).
- **Backend**: `apps/api` — Express + TypeScript.
- **Auth**: Better Auth (email/password to start) with its Drizzle adapter,
  using httpOnly **session cookies**. No JWTs in localStorage.
- **DB**: PostgreSQL + Drizzle ORM, standard `pg` connection pool.
- **Validation**: Zod at every boundary; `drizzle-zod` to derive schemas from tables.
- **Shared code**: `packages/shared` holds Zod schemas + types imported by BOTH
  web and api. This is the single source of truth for shapes — put shared
  validation here, don't duplicate it.

## Where things live
- Drizzle schema & migrations: `apps/api/src/db/`
- Express routes/handlers: `apps/api/src/routes/`
- Auth setup & `requireAuth` middleware: `apps/api/src/auth/`
- React pages/components: `apps/web/src/`
- Shared Zod schemas/types: `packages/shared/src/`
- Local Postgres: `docker-compose.yml` at repo root

## Commands (verify every change with these)
- `npm run dev` — run web + api together
- `npm run build` — build all packages
- `npm run typecheck` — must pass before considering a change done
- `npm run lint`
- `npm run test`
- DB: `npm run db:generate` (create migration from schema), `npm run db:migrate`
  (apply), `npm run db:studio` (inspect)
- Better Auth schema: regenerate its tables via the Better Auth CLI when auth
  config changes, then run a migration.

## Non-negotiable conventions
- **Money is NEVER a float.** Store amounts as integer minor units
  (`amount_cents` integer) plus a `currency` code column. Do all math in integers.
- **Every domain table has a `user_id` foreign key** to the Better Auth user
  table, and **every query is scoped to the authenticated user.** No route ever
  returns or mutates another user's rows. Enforce this in the handler, not just
  the UI.
- **Validate all input with Zod at the route boundary** using schemas from
  `packages/shared`. Never trust the client.
- **Auth via session cookies** (Better Auth). Protect routes with the
  `requireAuth` middleware; never read the user id from the request body.
- **Timestamps stored in UTC.**
- **Same-origin cookie strategy**: in dev, the Vite dev server proxies `/api`
  to Express. In production, Express serves the built web assets so frontend and
  API share an origin. Keep this working — don't introduce cross-origin cookie
  setups without flagging it.

## Workflow expectations
- **Use plan mode for structural changes** — schema design, new tables,
  migrations, or anything touching the auth/data layer. Show the plan before editing.
- **Build one vertical slice at a time** (schema → migration → API → UI), verify
  it, then move on. Don't scaffold all layers at once.
- **Migrations are part of every schema change** — generate and apply them; never
  hand-edit the database.
- After any change, run `typecheck`, `lint`, and relevant tests before calling it done.
- Commit at each working slice.

## Current status
<!-- Update this as you go so each session starts oriented. -->
- [x] Monorepo skeleton + docker-compose Postgres
- [ ] Drizzle connected, migration pipeline working
- [ ] Better Auth (email/password) + login/logout UI
- [ ] Expenses CRUD, user-scoped
- [ ] Categories
- [ ] Deployed