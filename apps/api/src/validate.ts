import type { z } from 'zod';
import { badRequest } from './http-error.js';

/**
 * Parse a request body against a shared Zod schema, or fail with a 400.
 *
 * CLAUDE.md requires Zod at every route boundary using the schemas from
 * `packages/shared`, and this is the one-liner that makes that cheap enough to
 * never skip. The message names the offending field so the client can highlight
 * it, and reports only the FIRST issue — the whole issue list is noise, and
 * echoing it back is a needlessly detailed map of the validator.
 */
export function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);

  if (result.success) {
    return result.data;
  }

  const [issue] = result.error.issues;
  throw badRequest(
    issue ? `[body.${issue.path.join('.')}] ${issue.message}` : 'Invalid request body',
  );
}
