import { Router } from 'express';
import { sql } from 'drizzle-orm';
import {
  dbHealthResponseSchema,
  healthResponseSchema,
  type DbHealthResponse,
  type HealthResponse,
} from '@expense-tracker/shared';
import { db } from '../db/client.js';

export const healthRouter: Router = Router();

healthRouter.get('/health', (_req, res) => {
  const body: HealthResponse = {
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    // Timestamps are always UTC.
    timestamp: new Date().toISOString(),
  };

  // Parse on the way out too: if the shared schema and this handler ever drift,
  // fail here rather than shipping a bad shape to the client.
  res.json(healthResponseSchema.parse(body));
});

/**
 * Readiness probe: is Postgres actually reachable? Deliberately separate from
 * `/health` above, which must keep answering 200 while the database is down.
 *
 * The error is caught rather than left to Express's error handler because an
 * unreachable database is a 503, not a 500.
 */
healthRouter.get('/health/db', async (_req, res) => {
  const startedAt = process.hrtime.bigint();
  const elapsedMs = (): number =>
    Math.round(Number(process.hrtime.bigint() - startedAt) / 1_000_000);

  try {
    await db.execute(sql`select 1`);
    const body: DbHealthResponse = { db: 'up', latencyMs: elapsedMs() };
    res.json(dbHealthResponseSchema.parse(body));
  } catch (error) {
    console.error('database health check failed', error);
    const body: DbHealthResponse = { db: 'down', latencyMs: elapsedMs() };
    res.status(503).json(dbHealthResponseSchema.parse(body));
  }
});
