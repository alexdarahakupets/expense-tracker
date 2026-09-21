/**
 * An error carrying the status the client should see.
 *
 * Express 5 forwards rejected promises from handlers to the error middleware on
 * its own, so a handler can `throw notFound()` and the response shape is decided
 * in exactly one place — `app.ts`. Anything that is NOT an HttpError is a bug we
 * did not anticipate, and the handler turns it into a bare 500 rather than
 * risking an internal message reaching the client.
 */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/**
 * The deliberate response for "this row exists but is none of your business",
 * as well as for genuinely missing rows.
 *
 * Collapsing 403 into 404 is the point: a 403 would confirm that a group id is
 * real, which lets someone probe for valid ids. A caller who is not a member
 * cannot tell the two cases apart.
 */
export function notFound(message = 'Not found'): HttpError {
  return new HttpError(404, message);
}

/** Request shape the client got wrong — never a hint about what exists. */
export function badRequest(message: string): HttpError {
  return new HttpError(400, message);
}

/**
 * The caller is a member but lacks the role for this action.
 *
 * Unlike the member/non-member split above, this one is safe to state plainly:
 * they can already see the group, so "you are not the owner" reveals nothing
 * they could not read off the member list.
 */
export function forbidden(message: string): HttpError {
  return new HttpError(403, message);
}

/** The action conflicts with the current state — e.g. adding an existing member. */
export function conflict(message: string): HttpError {
  return new HttpError(409, message);
}
