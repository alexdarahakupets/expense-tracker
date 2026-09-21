import { errorResponseSchema } from '@expense-tracker/shared';

/**
 * The browser's side of the API contract.
 *
 * Every call uses a RELATIVE `/api` path — never an absolute origin — so the Vite
 * dev proxy and the production same-origin deploy behave identically and the
 * session cookie stays first-party. An absolute API origin here is what turns
 * this into a cross-origin cookie problem.
 */

/**
 * A non-2xx response.
 *
 * Carries the status so callers can tell "signed out" (401) from "broken", and
 * the server's own message when there is one — the API writes those for the
 * client (`Only the group owner can do that`), so showing them beats inventing
 * a vaguer sentence.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message?: string,
  ) {
    super(message ?? `API responded ${String(status)}`);
    this.name = 'ApiError';
  }
}

/**
 * Pull the `{ error }` message out of a failed response.
 *
 * Every API error uses that shape, but a proxy or a crash can still return HTML,
 * so a body that does not parse falls back to the status line rather than
 * throwing a second error on top of the first.
 */
async function toApiError(response: Response): Promise<ApiError> {
  try {
    const parsed = errorResponseSchema.safeParse(await response.json());
    if (parsed.success) {
      return new ApiError(response.status, parsed.data.error);
    }
  } catch {
    // Body was not JSON. Fall through.
  }

  return new ApiError(response.status);
}

/**
 * GET a JSON body and validate it before it reaches React state.
 *
 * `parse` is always a shared Zod schema, so a response that drifts from the
 * contract fails here rather than surfacing as `undefined` three components
 * deep.
 */
export async function getJson<T>(
  path: string,
  parse: (input: unknown) => T,
  signal: AbortSignal,
): Promise<T> {
  const response = await fetch(path, { signal, credentials: 'include' });

  if (!response.ok) {
    throw await toApiError(response);
  }

  return parse(await response.json());
}

/**
 * POST a JSON body and validate the response.
 *
 * No `signal`: these are user-initiated writes, and aborting one on unmount
 * would cancel a request the server may already have committed, leaving the UI
 * to claim a failure that did not happen.
 */
export async function postJson<T>(
  path: string,
  body: unknown,
  parse: (input: unknown) => T,
): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw await toApiError(response);
  }

  return parse(await response.json());
}
