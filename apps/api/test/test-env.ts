import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Point the API at a THROWAWAY database before anything imports `src/env.ts`.
 *
 * Tests truncate tables between cases, so running them against the development
 * database would delete whatever you were working with. Instead everything runs
 * against a separate database on the same Postgres server, dropped and recreated
 * at the start of each run.
 *
 * This works because `process.loadEnvFile` (used by `src/env.ts`) does NOT
 * override variables already present in `process.env` — verified, and the whole
 * mechanism depends on it. If that ever changes, the suite silently starts
 * eating the dev database, so `global-setup.ts` asserts the swap took effect.
 */

/** Repo root, three levels up from `apps/api/test/`. */
const envFile = fileURLToPath(new URL('../../../.env', import.meta.url));

export const TEST_DATABASE_NAME = 'expense_tracker_test';

/** The `.env` connection string, i.e. the DEVELOPMENT database. Never written to. */
export function developmentDatabaseUrl(): string {
  if (existsSync(envFile)) {
    process.loadEnvFile(envFile);
  }

  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error('DATABASE_URL is not set — copy .env.example to .env at the repo root.');
  }

  return url;
}

/**
 * Swap the database name in `DATABASE_URL` and write it back to `process.env`.
 *
 * Called from both the global setup and the per-worker setup file: Vitest runs
 * test files in separate workers that do not inherit the global setup's
 * `process.env` mutations.
 */
export function applyTestDatabaseUrl(): string {
  const url = new URL(developmentDatabaseUrl());
  url.pathname = `/${TEST_DATABASE_NAME}`;

  const testUrl = url.toString();
  process.env.DATABASE_URL = testUrl;

  return testUrl;
}
