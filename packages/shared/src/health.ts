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
