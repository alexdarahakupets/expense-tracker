import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  healthResponseSchema,
  meResponseSchema,
  type HealthResponse,
  type SessionUser,
} from '@expense-tracker/shared';
import { signOut, useSession } from '../lib/auth-client.js';

type Fetched<T> = { kind: 'loading' } | { kind: 'ok'; value: T } | { kind: 'error'; message: string };

/** Carries the status code so callers can tell "signed out" from "broken". */
class ApiError extends Error {
  constructor(readonly status: number) {
    super(`API responded ${String(status)}`);
    this.name = 'ApiError';
  }
}

/**
 * Calls the API through a relative `/api` path — never an absolute origin — so
 * the dev proxy and the production same-origin setup both work unchanged, and
 * the session cookie rides along as a first-party cookie.
 */
async function getJson<T>(path: string, parse: (input: unknown) => T, signal: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal, credentials: 'include' });

  if (!response.ok) {
    throw new ApiError(response.status);
  }

  return parse(await response.json());
}

export function HomePage() {
  const { data: session, refetch } = useSession();
  const navigate = useNavigate();

  const [health, setHealth] = useState<Fetched<HealthResponse>>({ kind: 'loading' });
  const [me, setMe] = useState<Fetched<SessionUser>>({ kind: 'loading' });
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const value = await getJson('/api/health', (input) => healthResponseSchema.parse(input), controller.signal);
        setHealth({ kind: 'ok', value });
      } catch (error) {
        if (controller.signal.aborted) return;
        setHealth({ kind: 'error', message: error instanceof Error ? error.message : 'Unknown error' });
      }

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
    }

    void load();
    return () => {
      controller.abort();
    };
  }, [refetch]);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
      // RequireSession would bounce here on its own once the session store
      // clears; navigating explicitly avoids a frame of the empty app shell.
      void navigate('/login', { replace: true });
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <main>
      <h1>Expense Tracker</h1>
      <p className="muted">
        Signed in as {session?.user.name ?? 'someone'}{' '}
        <button
          type="button"
          className="link"
          disabled={signingOut}
          onClick={() => void handleSignOut()}
        >
          {signingOut ? 'Logging out…' : 'Log out'}
        </button>
      </p>

      <section>
        <h2>Your account</h2>
        <p className="muted">
          Served by <code>GET /api/me</code>, which sits behind <code>requireAuth</code> — proof the
          session cookie reaches Express and resolves to a user.
        </p>
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
    </main>
  );
}
