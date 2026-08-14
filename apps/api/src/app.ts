import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { isProduction } from './env.js';
import { healthRouter } from './routes/health.js';

/**
 * Builds the Express app without binding a port, so tests can import it
 * directly. `src/index.ts` owns the listener.
 */
export function createApp(): Express {
  const app = express();

  app.use(express.json());

  // Everything the API owns lives under /api — the same prefix the Vite dev
  // server proxies here, which keeps web and api same-origin in dev and prod.
  app.use('/api', healthRouter);

  // Unmatched /api paths are API errors, not SPA routes.
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  if (isProduction) {
    serveWebApp(app);
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

/**
 * In production Express serves the built SPA so the frontend and API share an
 * origin — that is what lets Better Auth's session cookie be a plain
 * same-origin httpOnly cookie. Don't split these onto separate origins.
 */
function serveWebApp(app: Express): void {
  const webDist = fileURLToPath(new URL('../../web/dist/', import.meta.url));

  if (!existsSync(webDist)) {
    console.warn(`Web build not found at ${webDist} — run \`npm run build\` first.`);
    return;
  }

  app.use(express.static(webDist));

  // SPA fallback: any non-/api GET that didn't match a static file is a
  // client-side route.
  app.use((req, res, next) => {
    if (req.method !== 'GET') {
      next();
      return;
    }
    res.sendFile(path.join(webDist, 'index.html'));
  });
}
