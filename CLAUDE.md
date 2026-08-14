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
  (`schema.ts`, generated migrations in `migrations/`; `apps/api/drizzle.config.ts`
  is at the workspace root, not in `src/`)
- Env: copy `.env.example` to `.env` at the repo root before running anything —
  `DATABASE_URL` is required and the API exits at startup without it.
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
- DB: `npm run db:up` / `npm run db:down` (docker compose), `npm run db:generate`
  (create migration from schema), `npm run db:migrate` (apply),
  `npm run db:studio` (inspect)
- Health: `/api/health` is liveness (no DB); `/api/health/db` is readiness
  (200 up / 503 down). Keep `/api/health` answerable while Postgres is down.
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
- **Columns are snake_case, TS fields are camelCase.** The client and
  `drizzle.config.ts` both set `casing: 'snake_case'`, so `amountCents` becomes
  `amount_cents` and `userId` becomes `user_id` automatically. If you change it
  in one place, change it in both — they must agree or generated migrations drift.
- **Same-origin cookie strategy**: in dev, the Vite dev server proxies `/api`
  to Express. In production, Express serves the built web assets so frontend and
  API share an origin. Keep this working — don't introduce cross-origin cookie
  setups without flagging it.
- **Always clarify uncertainties**: if something isn't clear - ask the developer for clarifications.
- **Don't commit automatically**: don't commit and don't push changes on your own, let it be done by the developer. 


## Workflow expectations
- **Use plan mode for structural changes** — schema design, new tables,
  migrations, or anything touching the auth/data layer. Show the plan before editing.
- **Build one vertical slice at a time** (schema → migration → API → UI), verify
  it, then move on. Don't scaffold all layers at once.
- **Migrations are part of every schema change** — generate and apply them; never
  hand-edit the database.
- `drizzle-kit` is a **devDependency**, so `db:migrate` as written can't run on a
  production box. Deploying needs either drizzle-kit installed there or a small
  programmatic `src/db/migrate.ts`.
- After any change, run `typecheck`, `lint`, and relevant tests before calling it done.
- Each working slice should be commit-sized — verify it, then hand it to the
  developer to commit.
- **Propose CLAUDE.md changes if needed** - after implementation check the new state of the app against the CLAUDE.md file and propose changes, but don't make them automatically.

## Current status
<!-- Update this as you go so each session starts oriented. -->
- [x] Monorepo skeleton + docker-compose Postgres
- [x] Drizzle connected, migration pipeline working
- [ ] Better Auth (email/password) + login/logout UI
- [ ] Expenses CRUD, user-scoped
- [ ] Categories
- [ ] Deployed