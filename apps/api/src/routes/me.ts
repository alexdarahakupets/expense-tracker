import { Router } from 'express';
import { meResponseSchema, type MeResponse } from '@expense-tracker/shared';

export const meRouter: Router = Router();

/**
 * The authenticated user, derived entirely from the session cookie.
 *
 * Mounted inside `protectedRouter`, so `req.auth` is guaranteed by the time this
 * runs — `requireAuth` has already 401'd anything without a valid session.
 *
 * Beyond being useful to the client, this is the end-to-end proof that a browser
 * cookie survives the Vite proxy and resolves to a user server-side, and it is
 * the template every domain route follows: read the id from `req.auth`, never
 * from the request.
 */
meRouter.get('/me', (req, res) => {
  const user = req.auth?.user;

  if (!user) {
    // Unreachable behind requireAuth. Kept as a hard stop so that mounting this
    // router in the wrong place fails closed instead of leaking a null user.
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const body: MeResponse = {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      image: user.image ?? null,
      createdAt: user.createdAt.toISOString(),
    },
  };

  // Parsed on the way out so a change to the Better Auth user record can never
  // silently widen this response.
  res.json(meResponseSchema.parse(body));
});
