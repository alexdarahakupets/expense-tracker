import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'drizzle-kit';

// drizzle-kit runs this file directly — it never goes through src/env.ts — so
// load the repo-root .env here too. This config sits at apps/api/, two levels
// below the root.
const envFile = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set — copy .env.example to .env at the repo root.');
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  // CLAUDE.md keeps schema and migrations together under src/db/.
  out: './src/db/migrations',
  dbCredentials: { url: databaseUrl },
  // Must match the `casing` passed to drizzle() in src/db/client.ts.
  casing: 'snake_case',
  strict: true,
  verbose: true,
});
