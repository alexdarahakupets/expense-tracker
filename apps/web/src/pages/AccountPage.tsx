import { useEffect, useState } from 'react';
import {
  healthResponseSchema,
  meResponseSchema,
  type HealthResponse,
  type SessionUser,
} from '@expense-tracker/shared';
import { useSession } from '../lib/auth-client.js';
import { ApiError, getJson } from '../lib/api.js';

type Fetched<T> = { kind: 'loading' } | { kind: 'ok'; value: T } | { kind: 'error'; message: string };

/**
 * The signed-in user as the server sees them.
 *
 * Deliberately served by `GET /api/me` rather than read off the client session
 * store: it is the end-to-end proof that the cookie survives the Vite proxy and
 * resolves to a user server-side, and it is the template every domain route
 * follows.
 */
export function AccountPage() {
  const { refetch } = useSession();

  const [me, setMe] = useState<Fetched<SessionUser>>({ kind: 'loading' });
  const [health, setHealth] = useState<Fetched<HealthResponse>>({ kind: 'loading' });

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const value = await getJson('/api/me', (input) => meResponseSchema.parse(input).user, controller.signal);
        setMe({ kind: 'ok', value });
      } catch (error) {
        if (controller.signal.aborted) return;

        // A 401 here means the session died while this page was open — expired,
        // or revoked from another device. The client's session store still
        // believes we are signed in, so re-read it: that resolves to null and
        // `RequireSession` redirects to /login on the next render. Showing the
        // raw error instead would strand the user on a page that can never load.
        if (error instanceof ApiError && error.status === 401) {
          void refetch();
          return;
        }

        setMe({ kind: 'error', message: error instanceof Error ? error.message : 'Unknown error' });
      }

      try {
        const value = await getJson('/api/health', (input) => healthResponseSchema.parse(input), controller.signal);
        setHealth({ kind: 'ok', value });
      } catch (error) {
        if (controller.signal.aborted) return;
        setHealth({ kind: 'error', message: error instanceof Error ? error.message : 'Unknown error' });
      }
    }

    void load();
    return () => {
      controller.abort();
    };
  }, [refetch]);

  return (
    <>
      <h1>Account</h1>

      <section>
        {me.kind === 'loading' && <p>Checking…</p>}
        {me.kind === 'error' && <p className="error">Unreachable: {me.message}</p>}
        {me.kind === 'ok' && (
          <dl>
            <dt>Name</dt>
            <dd>{me.value.name}</dd>
            <dt>Email</dt>
            <dd>{me.value.email}</dd>
            <dt>Member since (UTC)</dt>
            <dd>{me.value.createdAt}</dd>
          </dl>
        )}
      </section>

      {/* Scaffolding from the first slice, kept because a readiness signal in the
          UI is genuinely handy in dev. Safe to delete — nothing depends on it. */}
      <section>
        <h2>API health</h2>
        {health.kind === 'loading' && <p>Checking…</p>}
        {health.kind === 'error' && <p className="error">Unreachable: {health.message}</p>}
        {health.kind === 'ok' && (
          <dl>
            <dt>Status</dt>
            <dd>{health.value.status}</dd>
            <dt>Uptime</dt>
            <dd>{health.value.uptime}s</dd>
            <dt>Timestamp (UTC)</dt>
            <dd>{health.value.timestamp}</dd>
          </dl>
        )}
      </section>
    </>
  );
}
