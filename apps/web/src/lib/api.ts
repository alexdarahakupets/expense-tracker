/**
 * The browser's side of the API contract.
 *
 * Every call uses a RELATIVE `/api` path — never an absolute origin — so the Vite
 * dev proxy and the production same-origin deploy behave identically and the
 * session cookie stays first-party. An absolute API origin here is what turns
 * this into a cross-origin cookie problem.
 */

/** Carries the status code so callers can tell "signed out" from "broken". */
export class ApiError extends Error {
  constructor(readonly status: number) {
    super(`API responded ${String(status)}`);
    this.name = 'ApiError';
  }
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
    throw new ApiError(response.status);
  }

  return parse(await response.json());
}
