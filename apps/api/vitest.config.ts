import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Creates and migrates the throwaway test database once per run.
    globalSetup: ['./test/global-setup.ts'],
    // Runs per worker, before the app (and its connection pool) is imported.
    setupFiles: ['./test/setup-env.ts'],
    /**
     * One Postgres database is shared by the whole suite and tests truncate
     * between cases, so running files concurrently would let one file wipe
     * another's fixtures mid-assertion.
     */
    fileParallelism: false,
    // Password hashing on sign-up is deliberately slow.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
