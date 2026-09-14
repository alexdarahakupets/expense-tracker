import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/**
 * Load the repo-root `.env` if present. Both `src/` (tsx) and `dist/` (node)
 * sit three levels below the repo root, so the same relative path works either
 * way. Uses Node's built-in loader — no dotenv dependency.
 */
const envFile = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

/** `VAR=true` / `VAR=false`, rejecting anything else instead of coercing it. */
const booleanFlag = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3001),
    // Required, no default: a missing connection string should fail loudly at
    // startup rather than as a confusing error on the first query.
    DATABASE_URL: z.url(),
    // Required with no fallback on purpose. Better Auth silently defaults to a
    // hardcoded development secret, which would sign real session cookies with a
    // publicly known key. Generate one with `npx auth@latest secret`.
    BETTER_AUTH_SECRET: z.string().min(32),
    // The origin the BROWSER talks to, not the API's own port. In dev that is the
    // Vite server, which proxies /api to Express; in production it is the single
    // origin Express serves both from. Feeds Better Auth's baseURL and
    // trustedOrigins.
    BETTER_AUTH_URL: z.url().default('http://localhost:5173'),
    /**
     * Express's `trust proxy`, which is what makes `req.ip` the real client
     * address instead of the proxy's. That address is the ONLY thing standing
     * between the sign-in rate limiter and a single caller locking out every
     * user, so it is configuration, not a guess — see `app.ts`.
     *
     * Unset means "nothing in front of us": `req.ip` is the socket peer, which a
     * client cannot forge. Behind a proxy, set it to the number of proxy hops
     * (`1`), or a comma-separated list of proxy addresses/subnets, or an Express
     * preset such as `loopback`. Do NOT set `true` unless the origin is
     * genuinely unreachable except through your proxy — it trusts whatever
     * `X-Forwarded-For` says.
     */
    TRUST_PROXY: z.string().optional(),
    /**
     * Escape hatch for running a production build over plain http, e.g. to
     * smoke-test the single-origin bundle locally. Off by default so a real
     * deploy cannot silently ship a session cookie without `Secure`.
     */
    ALLOW_INSECURE_COOKIES: booleanFlag,
  })
  .superRefine((value, ctx) => {
    // Better Auth derives the cookie's `Secure` attribute from baseURL's scheme,
    // not from NODE_ENV. An https deployment configured with an http
    // BETTER_AUTH_URL therefore ships a session cookie that any network
    // attacker can read, with nothing in the logs to say so. Fail at startup
    // instead.
    if (
      value.NODE_ENV === 'production' &&
      !value.ALLOW_INSECURE_COOKIES &&
      !value.BETTER_AUTH_URL.startsWith('https://')
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['BETTER_AUTH_URL'],
        message:
          'must be https in production — otherwise the session cookie is issued without `Secure`. ' +
          'Set ALLOW_INSECURE_COOKIES=true only for local testing of a production build.',
      });
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment:', z.prettifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;

export const isProduction = env.NODE_ENV === 'production';

/**
 * `TRUST_PROXY` in the shape Express wants: a hop count, a boolean, or a
 * comma-separated list of addresses/subnets/presets it parses itself.
 */
export const trustProxy: boolean | number | string = (() => {
  const raw = env.TRUST_PROXY?.trim();

  if (!raw) return false;
  if (raw === 'true') return true;
  if (raw === 'false') return false;

  const hops = Number(raw);
  return Number.isInteger(hops) && hops >= 0 ? hops : raw;
})();

/**
 * Whether session cookies will carry `Secure`. Mirrors what Better Auth infers
 * from baseURL, stated explicitly so `auth.ts` configures it rather than
 * inheriting it by accident.
 */
export const useSecureCookies = env.BETTER_AUTH_URL.startsWith('https://');
