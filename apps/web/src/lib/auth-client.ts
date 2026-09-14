import { createAuthClient } from 'better-auth/react';

/**
 * Better Auth browser client.
 *
 * No `baseURL` on purpose: that keeps every call on a relative `/api/auth` path,
 * so the Vite dev proxy and the production single-origin deploy behave
 * identically and the session cookie stays first-party. Setting an absolute API
 * origin here is what turns this into a cross-origin cookie problem.
 */
export const authClient = createAuthClient();

export const { signIn, signUp, signOut, useSession } = authClient;
