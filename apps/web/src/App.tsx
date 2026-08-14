import { useEffect, useState } from 'react';
import { healthResponseSchema, type HealthResponse } from '@expense-tracker/shared';

type State =
  | { kind: 'loading' }
  | { kind: 'ok'; health: HealthResponse }
  | { kind: 'error'; message: string };

/**
 * Skeleton page. It calls the API through the relative `/api` path — never an
 * absolute API origin — so the dev proxy and the production same-origin setup
 * both work unchanged, and `credentials: 'include'` will do the right thing
 * once sessions exist.
 */
export function App() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    const controller = new AbortController();

    async function check() {
      try {
        const response = await fetch('/api/health', {
          signal: controller.signal,
          credentials: 'include',
        });
        if (!response.ok) {
          throw new Error(`API responded ${String(response.status)}`);
        }
        const health = healthResponseSchema.parse(await response.json());
        setState({ kind: 'ok', health });
      } catch (error) {
        if (controller.signal.aborted) return;
        setState({ kind: 'error', message: error instanceof Error ? error.message : 'Unknown error' });
      }
    }

    void check();
    return () => {
      controller.abort();
    };
  }, []);

  return (
    <main>
      <h1>Expense Tracker</h1>
      <p className="muted">Skeleton — no data layer yet.</p>

      <section>
        <h2>API health</h2>
        {state.kind === 'loading' && <p>Checking…</p>}
        {state.kind === 'error' && <p className="error">Unreachable: {state.message}</p>}
        {state.kind === 'ok' && (
          <dl>
            <dt>Status</dt>
            <dd>{state.health.status}</dd>
            <dt>Uptime</dt>
            <dd>{state.health.uptime}s</dd>
            <dt>Timestamp (UTC)</dt>
            <dd>{state.health.timestamp}</dd>
          </dl>
        )}
      </section>
    </main>
  );
}
