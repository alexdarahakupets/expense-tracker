import { Router } from 'express';
import { requireAuth } from '../auth/require-auth.js';
import { expensesRouter } from './expenses.js';
import { groupsRouter } from './groups.js';
import { meRouter } from './me.js';

/**
 * Default-deny mount point. `requireAuth` is applied once, at the top, so every
 * router added below is authenticated by construction.
 *
 * Add new domain routers (expenses, categories) HERE. Leaving a route
 * unprotected has to be a deliberate act — moving it out to the public mount in
 * `app.ts` — rather than something that happens by forgetting a middleware
 * argument.
 */
export const protectedRouter: Router = Router();

protectedRouter.use(requireAuth);

protectedRouter.use(meRouter);
protectedRouter.use(groupsRouter);
protectedRouter.use(expensesRouter);
