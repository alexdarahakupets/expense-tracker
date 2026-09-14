import type { NextFunction, Request, Response } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from './auth.js';

/**
 * A resolved Better Auth session. Derived from `getSession`'s own return type
 * rather than hand-written, so adding a user field or a plugin cannot leave this
 * silently out of date.
 */
type VerifiedSession = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

/** What a verified session puts on the request. */
export interface AuthContext {
  user: VerifiedSession['user'];
  session: VerifiedSession['session'];
}

// Augmenting `express-serve-static-core` rather than the legacy global `Express`
// namespace: it is where Express 5's Request actually lives, and it keeps this
// as plain module syntax.
declare module 'express-serve-static-core' {
  interface Request {
    /**
     * Set by `requireAuth`, and by nothing else. Present iff the request
     * carried a valid session cookie.
     */
    auth?: AuthContext;
  }
}

/**
 * Rejects anything without a valid session cookie.
 *
 * This is the ONLY place a request acquires an identity. Handlers read
 * `req.auth.user.id`; a `userId` in a body, query string, or header is never
 * consulted, because the frontend is assumed to be compromised. It runs before
 * validation and before any query, so an unauthenticated request never reaches
 * the database.
 *
 * Mounted once at the top of `protectedRouter`, so routes are authenticated by
 * construction rather than by remembering to add this per handler.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  let session: Awaited<ReturnType<typeof auth.api.getSession>>;

  try {
    session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  } catch (error) {
    // A failed session lookup (e.g. the database is down) is not the caller's
    // fault. Hand it to the error handler as a 500 rather than reporting it as
    // a 401, which would send the user to a login form that cannot work.
    next(error);
    return;
  }

  if (!session) {
    // Deliberately terse: no hint about whether the cookie was absent, expired,
    // or forged.
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  req.auth = { user: session.user, session: session.session };
  next();
}
