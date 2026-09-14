import { z } from 'zod';

/**
 * Auth shapes shared by web and api. The client validates forms against these
 * before a request leaves the browser, and the API parses its own responses
 * through them on the way out — one definition, no drift.
 *
 * Nothing here is a security boundary on its own: the client-side parse is a UX
 * affordance, and the server re-validates everything it receives regardless.
 */

/**
 * The password policy as numbers rather than prose. `apps/api/src/auth/auth.ts`
 * feeds these straight into Better Auth's `minPasswordLength` /
 * `maxPasswordLength`, and the server re-validates every credential body
 * against `signInSchema`/`signUpSchema` below. One pair of numbers, so the
 * form, the route boundary, and the library cannot drift apart.
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${String(PASSWORD_MIN_LENGTH)} characters`)
  .max(PASSWORD_MAX_LENGTH, `Password must be at most ${String(PASSWORD_MAX_LENGTH)} characters`);

export const emailSchema = z.email('Enter a valid email address');

/** Body of a sign-in attempt. */
export const signInSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export type SignInInput = z.infer<typeof signInSchema>;

/** Body of a sign-up attempt. */
export const signUpSchema = signInSchema.extend({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name is too long'),
});

export type SignUpInput = z.infer<typeof signUpSchema>;

/**
 * The authenticated user as the API returns it. Deliberately a subset of the
 * Better Auth user record — no tokens, no password hash, nothing from the
 * `account` table.
 */
export const sessionUserSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  email: z.email(),
  emailVerified: z.boolean(),
  image: z.string().nullable(),
  /** UTC ISO-8601. */
  createdAt: z.iso.datetime(),
});

export type SessionUser = z.infer<typeof sessionUserSchema>;

/** Response shape of `GET /api/me`. */
export const meResponseSchema = z.object({
  user: sessionUserSchema,
});

export type MeResponse = z.infer<typeof meResponseSchema>;

/** Every error the API returns has this shape — including 401 and 404. */
export const errorResponseSchema = z.object({
  error: z.string(),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;
