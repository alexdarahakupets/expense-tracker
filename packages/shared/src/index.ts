/**
 * Shared Zod schemas and types — the single source of truth for shapes crossing
 * the web/api boundary. Both `apps/web` and `apps/api` import from here; do not
 * duplicate validation on either side.
 */
export * from './auth.js';
export * from './health.js';
