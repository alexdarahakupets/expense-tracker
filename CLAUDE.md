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
- API TypeScript projects: `apps/api/tsconfig.json` is the DEFAULT (and what your
  editor resolves) — it covers `src`, `test` and `vitest.config.ts` and emits
  nothing; `tsconfig.build.json` narrows to `src` and owns emit. Add a new
  top-level folder to the default include or the editor will red-underline it
  while `npm run typecheck` stays green.
- Drizzle schema & migrations: `apps/api/src/db/`
  (`schema.ts`, generated migrations in `migrations/`; `apps/api/drizzle.config.ts`
  is at the workspace root, not in `src/`)
- Env: copy `.env.example` to `.env` at the repo root before running anything —
  `DATABASE_URL` and `BETTER_AUTH_SECRET` (min 32 chars) are both required and
  the API exits at startup without either. `BETTER_AUTH_URL` is the origin the
  BROWSER uses (the Vite server in dev), not the API port.
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
- `npm run test` — Vitest + supertest, in `apps/api/test/`. Needs Postgres
  running (`npm run db:up`); it drops and recreates a SEPARATE
  `expense_tracker_test` database each run and never touches your dev data.
- DB: `npm run db:up` / `npm run db:down` (docker compose), `npm run db:generate`
  (create migration from schema), `npm run db:migrate` (apply),
  `npm run db:studio` (inspect)
- Health: `/api/health` is liveness (no DB); `/api/health/db` is readiness
  (200 up / 503 down). Keep `/api/health` answerable while Postgres is down.
- Better Auth schema: regenerate its tables via the Better Auth CLI when auth
  config changes, then run a migration. Regeneration OVERWRITES
  `src/db/auth-schema.ts` and drops one required hand edit: every `timestamp(...)`
  needs `{ withTimezone: true }` re-applied, or the four auth tables silently
  become `timestamp without time zone` and break the UTC rule above.

## Non-negotiable conventions
- **Money is NEVER a float.** Store amounts as integer minor units
  (`amount_cents` integer) plus a `currency` code column. Do all math in integers.
- **Domain rows are reachable only through GROUP MEMBERSHIP.** Groups are shared
  between users, so "scope every query to the authenticated user" is the wrong
  shape and no longer applies. Domain tables carry a `group_id`, not an owner
  column; `expense_group.created_by` records who started a group and grants
  nothing. Every group-scoped route calls `requireGroupMembership` (in
  `apps/api/src/routes/membership.ts`) FIRST — before validation, before any
  other query — and that helper is the only place the check is written. Enforce
  in the handler, never the UI.
- **A non-member gets 404, never 403.** A 403 confirms a group id is real, which
  turns ids into something worth probing. Outsiders and wrong ids must be
  indistinguishable. 403 is only for a member who lacks the *role* for an
  action — they can already see the group, so it reveals nothing new.
- **Validate all input with Zod at the route boundary** using schemas from
  `packages/shared`. Never trust the client.
- **Auth via session cookies** (Better Auth). Protect routes with the
  `requireAuth` middleware; never read the user id from the request body.
- **Brute-force protection is NOT live in dev.** `auth.ts` sets no `rateLimit`,
  so Better Auth's default applies: enabled in production only, backed by
  in-memory storage (limits reset on restart and aren't shared across
  instances). The `x-client-ip` plumbing in `app.ts` is correct and verified,
  but it only bites in production — don't read those comments as saying a local
  sign-in loop is throttled. Revisit if auth moves beyond one instance.
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
- **Test-driven development is the default.** Three steps, in this order, and
  don't collapse them:
  1. **Agree the behaviour first.** State what is being built and what
     "correct" means, in plain language, and settle the open questions before
     any code. For anything structural this is plan mode (below).
  2. **Write the failing test.** Run it and READ the failure. It has to fail for
     the reason you expect — a test that passes before the feature exists is
     testing nothing, and one that fails on a typo or a missing import has told
     you nothing either.
  3. **Implement until it is green**, and stop there.
- **Never back-fill a test onto code that already works.** A test written by
  reading the implementation inherits that implementation's bugs as its expected
  values, and it will keep passing when the behaviour is wrong. If a test must
  be added to existing code, break the code on purpose first and confirm the
  test fails — if it stays green it is not testing what its name claims.
- **A bug fix starts with a failing test that reproduces the bug.** If you
  cannot make it fail first, you have not found the bug yet — you have found
  something that looks like it.
- **Use plan mode for structural changes** — schema design, new tables,
  migrations, or anything touching the auth/data layer. Show the plan before editing.
- **Build one vertical slice at a time** (schema → migration → API → UI), verify
  it, then move on. Don't scaffold all layers at once.
- **Migrations are part of every schema change** — generate and apply them; never
  hand-edit the database.
- `drizzle-kit` is a **devDependency**, so `db:migrate` as written can't run on a
  production box. Deploying needs either drizzle-kit installed there or a small
  programmatic `src/db/migrate.ts`.
- After any change, run `typecheck`, `lint` and `test` before calling it done.
  All three pass today. They are the floor, not the point: green gates on code
  whose test was written afterwards prove only that it agrees with itself.
- **What the suite covers today**: the membership boundary (non-members get 404
  on every group route, and that check runs BEFORE body validation), the
  split-must-balance rule, and the money helpers.
- **A new group-scoped route needs a row in the route table** in
  `test/group-access.test.ts`. That list is maintained by hand, so a route that
  forgets `requireGroupMembership` will NOT fail the suite until it is added —
  add the route and its row together.
- **Auth itself is still only verified by hand.** The tests sign up through the
  real endpoint, so the cookie path is exercised, but sign-in failure modes,
  session expiry and rate limiting have no coverage.
- Each working slice should be commit-sized — verify it, then hand it to the
  developer to commit.
- **Propose CLAUDE.md changes if needed** - after implementation check the new state of the app against the CLAUDE.md file and propose changes, but don't make them automatically.

## Current status
<!-- Update this as you go so each session starts oriented. -->
- [x] Monorepo skeleton + docker-compose Postgres
- [x] Drizzle connected, migration pipeline working
- [x] Better Auth (email/password) + login/logout UI
- [x] Dashboard shell — Expenses / Statistics / Account nav
- [x] Expense groups + membership (create, list, detail, add member by email)
- [x] Expenses with custom shares, group-scoped (record + list)
- [x] Group summary (per-currency totals, per-person net) + settle placeholder
- [x] Test suite — Vitest + supertest over the membership boundary and money rules
- [ ] Categories (real, replacing the free-text string)
- [ ] Deployed
