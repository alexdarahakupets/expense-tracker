import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { toNodeHandler } from 'better-auth/node';
import { CLIENT_IP_HEADER, auth } from './auth/auth.js';
import { isProduction, trustProxy } from './env.js';
import { healthRouter } from './routes/health.js';
import { protectedRouter } from './routes/protected.js';

/**
 * Builds the Express app without binding a port, so tests can import it
 * directly. `src/index.ts` owns the listener.
 */
export function createApp(): Express {
  const app = express();

  // How many proxies, if any, sit in front of us — see TRUST_PROXY in env.ts.
  // Defaults to false, meaning `req.ip` is the socket peer, which cannot be
  // forged.
  app.set('trust proxy', trustProxy);

  // Hand Better Auth a client IP it can trust.
  //
  // It resolves addresses from headers only — it never sees the socket — so
  // without this its sign-in rate limiter cannot tell callers apart and falls
  // back to ONE shared bucket: three bad passwords from anyone locks out every
  // user, including one typing the correct password. Express has already worked
  // out the real address in `req.ip` (honouring `trust proxy`), so pass that.
  //
  // The delete is the load-bearing half. Without it a client could send its own
  // `x-client-ip` and get a private rate-limit bucket per forged address,
  // which is a brute-force bypass rather than a limit.
  app.use((req, _res, next) => {
    delete req.headers[CLIENT_IP_HEADER];

    if (req.ip) {
      req.headers[CLIENT_IP_HEADER] = req.ip;
    }

    next();
  });

  // Better Auth's own routes (sign-up, sign-in, sign-out, get-session). This
  // MUST be mounted before express.json(): the handler consumes the raw request
  // stream itself, and a body parser that has already drained it makes every
  // auth POST hang or fail. Express 5 needs the named `*splat` wildcard.
  app.all('/api/auth/*splat', toNodeHandler(auth));

  app.use(express.json());

  // Everything the API owns lives under /api — the same prefix the Vite dev
  // server proxies here, which keeps web and api same-origin in dev and prod.
  //
  // The two mounts below are the entire API surface, and the split is the
  // security boundary: health is public because a readiness probe that needs a
  // session is useless to a load balancer, and it exposes only up/down plus a
  // latency number. Everything else goes through protectedRouter, which applies
  // requireAuth at its top.
  app.use('/api', healthRouter);
  app.use('/api', protectedRouter);

  // Unmatched /api paths are API errors, not SPA routes. This sits after the
  // protected mount, so an unauthenticated request to a nonexistent route still
  // gets 401 rather than a 404 that would confirm the route does not exist.
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
