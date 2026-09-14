import { betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  signInSchema,
  signUpSchema,
} from '@expense-tracker/shared';
import type { z } from 'zod';
import { db } from '../db/client.js';
import * as schema from '../db/schema.js';
import { env, useSecureCookies } from '../env.js';

/**
 * The header `app.ts` stamps with Express's resolved client IP, and the only
 * header Better Auth is told to read an address from.
 *
 * Better Auth resolves the client IP from headers alone — it never sees the
 * socket — so without this it cannot rate-limit per caller at all and falls back
 * to one shared bucket for everybody. `app.ts` strips any inbound copy before
 * setting it, so a client cannot supply its own value.
 */
export const CLIENT_IP_HEADER = 'x-client-ip';

/** Endpoints whose request body is credentials we validate ourselves. */
const CREDENTIAL_SCHEMAS: Record<string, z.ZodType> = {
  '/sign-in/email': signInSchema,
  '/sign-up/email': signUpSchema,
};

/**
 * Endpoints that echo the freshly minted session token at the top level of their
 * JSON body. Better Auth includes it for token-based clients; ours is
 * cookie-only, so the `after` hook below removes it.
 *
 * Listed separately from CREDENTIAL_SCHEMAS even though the paths currently
 * match: "we validate this body" and "this response leaks a token" are two
 * different facts, and deriving one from the other silently drops a path from
 * whichever list stops matching first.
 */
const TOKEN_BEARING_PATHS = new Set(['/sign-in/email', '/sign-up/email']);

/** The endpoint that echoes it one level down, as `session.token`. */
const GET_SESSION_PATH = '/get-session';

/** Shallow copy of `source` without `token`. */
function withoutToken(source: Record<string, unknown>): Record<string, unknown> {
  const { token: _token, ...rest } = source;
  return rest;
}

/** Narrows to a plain object we can safely spread. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Better Auth server instance — the single source of truth for sessions.
 *
 * This file is also what `npx auth@latest generate` reads to produce
 * `src/db/auth-schema.ts`. Changing anything here that affects the data model
 * (new plugins, extra user fields) means regenerating that file and running a
 * migration.
 *
 * Cookie attributes are otherwise left at Better Auth's defaults: httpOnly,
 * SameSite=Lax, and no Domain. Those defaults are correct precisely because the
 * SPA and the API share an origin — overriding them is what breaks the
 * same-origin strategy.
 */
export const auth = betterAuth({
  appName: 'Expense Tracker',
  // The browser's origin, not the API's port. See env.ts.
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  emailAndPassword: {
    enabled: true,
    // Same constants the client form and the `before` hook below use, so the
    // three checks cannot disagree about what a valid password is.
    minPasswordLength: PASSWORD_MIN_LENGTH,
    maxPasswordLength: PASSWORD_MAX_LENGTH,
    // A successful sign-up lands straight in the app rather than bouncing the
    // user back to the login form to retype what they just entered.
    autoSignIn: true,
    // Off until there is a mail sender. Turning this on without one locks
    // everybody out.
    requireEmailVerification: false,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh the cookie at most once a day
  },
  // Requests from any other origin are rejected. In dev this is the Vite server;
  // the proxy keeps Host and Origin as localhost:5173 (changeOrigin: false).
  trustedOrigins: [env.BETTER_AUTH_URL],
  advanced: {
    ipAddress: {
      // Read the address from exactly one header — the one app.ts controls.
      // Listing `x-forwarded-for` here instead would trust whatever the client
      // sent and hand anyone a way past the brute-force limit.
      ipAddressHeaders: [CLIENT_IP_HEADER],
    },
    // Stated rather than inferred from baseURL's scheme. env.ts refuses to start
    // a production build where this would come out false.
    useSecureCookies,
  },
  hooks: {
    /**
     * Zod at the route boundary, using the schemas from `packages/shared` that
     * the login form validates against. Better Auth does validate on its own,
     * but this is the project's convention and it means the client and the
     * server reject the same inputs with the same messages.
     *
     * Runs before the endpoint, so a malformed body never reaches a password
     * hash or a query.
     */
    before: createAuthMiddleware(async (ctx) => {
      const credentialSchema = CREDENTIAL_SCHEMAS[ctx.path];
      if (!credentialSchema) return;

      const result = credentialSchema.safeParse(ctx.body);
      if (result.success) return;

      const [issue] = result.error.issues;
      throw new APIError('BAD_REQUEST', {
        // Deliberately the field-level message, not the whole issue list: it is
        // about the shape of the request, and it never reveals whether the
        // account exists.
        message: issue ? `[body.${issue.path.join('.')}] ${issue.message}` : 'Invalid request body',
        code: 'VALIDATION_ERROR',
      });
    }),

    /**
     * Keep the session token out of JSON response bodies.
     *
     * Sessions here are cookie-only — nothing in the SPA reads the token — while
     * a usable credential sitting in a body is one an error reporter, a
     * debugging proxy, or a response-logging middleware can capture and replay.
     * Sign-in and sign-up return it at the top level; `/get-session` returns it
     * as `session.token` on every page load, so stripping only the first two
     * would leave it on the chattiest endpoint of the three.
     *
     * `Set-Cookie` is merged from the response headers, not the body, so the
     * actual session is unaffected.
     *
     * Only HTTP responses are rewritten. Server-side `auth.api.*` calls reach
     * this same hook with no `ctx.request`, and `requireAuth` depends on the
     * session it gets back matching its declared type — including `token`.
     */
    after: createAuthMiddleware(async (ctx) => {
      if (!ctx.request) return undefined;

      const returned: unknown = ctx.context.returned;
      if (!isRecord(returned)) return undefined;

      if (TOKEN_BEARING_PATHS.has(ctx.path) && 'token' in returned) {
        return withoutToken(returned);
      }

      if (ctx.path === GET_SESSION_PATH && isRecord(returned.session)) {
        return { ...returned, session: withoutToken(returned.session) };
      }

      return undefined;
    }),
  },
});
