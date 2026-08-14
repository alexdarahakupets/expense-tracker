import { Router } from 'express';
import { healthResponseSchema, type HealthResponse } from '@expense-tracker/shared';

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
