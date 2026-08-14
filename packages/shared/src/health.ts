import { z } from 'zod';

/** Response shape of `GET /api/health`. */
export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  /** Process uptime in whole seconds. */
  uptime: z.number().int().nonnegative(),
  /** UTC ISO-8601 timestamp. */
  timestamp: z.iso.datetime(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

/**
 * Response shape of `GET /api/health/db` — a readiness probe. Kept separate
 * from `/api/health` so liveness stays answerable when Postgres is down.
 * Served with 200 when `db` is `up`, 503 when it is `down`.
 */
export const dbHealthResponseSchema = z.object({
  db: z.enum(['up', 'down']),
  /** Round-trip time of the probe query, in whole milliseconds. */
  latencyMs: z.number().int().nonnegative(),
});

export type DbHealthResponse = z.infer<typeof dbHealthResponseSchema>;
