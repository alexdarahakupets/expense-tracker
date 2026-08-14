import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { env } from '../env.js';
import * as schema from './schema.js';

// `pg` is CommonJS and its named exports aren't reliably detectable from ESM,
// so take the default export and destructure.
const { Pool } = pg;

/**
 * One pool for the process. `pg` connects lazily, so importing this module does
 * not open a socket — the API starts fine with Postgres down and
 * `GET /api/health/db` reports that honestly instead of crashing at boot.
 */
export const pool = new Pool({ connectionString: env.DATABASE_URL });

// An error on an idle client (DB restart, network blip) is emitted on the pool.
// Without a listener Node treats it as unhandled and kills the process.
pool.on('error', (error) => {
  console.error('unexpected postgres pool error', error);
});

/**
 * `casing: 'snake_case'` maps camelCase fields in schema.ts to snake_case
 * columns, so `amountCents` becomes `amount_cents` without spelling both out.
 * Keep this in sync with drizzle.config.ts.
 */
export const db = drizzle(pool, { schema, casing: 'snake_case' });

export async function closeDb(): Promise<void> {
  await pool.end();
}
