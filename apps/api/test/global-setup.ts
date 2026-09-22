import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { TEST_DATABASE_NAME, applyTestDatabaseUrl, developmentDatabaseUrl } from './test-env.js';

const { Client, Pool } = pg;

/**
 * Recreate the test database once per run and bring it up to the current
 * migrations.
 *
 * Migrating rather than pushing the schema means the suite exercises the same
 * SQL a deployment would, so a migration that is valid in isolation but breaks
 * on an existing database fails here rather than in production.
 */
export default async function setup(): Promise<void> {
  const developmentUrl = developmentDatabaseUrl();
  const testUrl = applyTestDatabaseUrl();

  // Belt and braces. If this ever matched, the suite would truncate the
  // developer's own data a moment later.
  if (new URL(testUrl).pathname === new URL(developmentUrl).pathname) {
    throw new Error('Refusing to run: the test database resolved to the development database.');
  }

  // Connected to the DEV database purely as a maintenance connection — you
  // cannot drop a database while connected to it.
  const admin = new Client({ connectionString: developmentUrl });
  await admin.connect();
  try {
    // `with (force)` terminates leftover connections from a previous crashed
    // run, which would otherwise make the drop hang forever.
    await admin.query(`drop database if exists "${TEST_DATABASE_NAME}" with (force)`);
    await admin.query(`create database "${TEST_DATABASE_NAME}"`);
  } finally {
    await admin.end();
  }

  const pool = new Pool({ connectionString: testUrl });
  try {
    await migrate(drizzle(pool), {
      migrationsFolder: fileURLToPath(new URL('../src/db/migrations', import.meta.url)),
    });
  } finally {
    await pool.end();
  }
}
