import { applyTestDatabaseUrl } from './test-env.js';

/**
 * Runs in every Vitest worker BEFORE the test file (and therefore before
 * `src/env.ts` and the connection pool) is imported.
 */
applyTestDatabaseUrl();
