import { Navigate, Outlet, useLocation } from 'react-router';
import { useSession } from '../lib/auth-client.js';

/**
 * Layout route that keeps signed-out visitors out of the app.
 *
 * This is a UX control, not a security one — the bundle is public and anyone can
 * edit the JS to render the pages underneath. What actually protects data is
 * that every API route behind `protectedRouter` returns 401 without a session
 * cookie, so a forced render shows empty screens and failed requests.
 *
 * `useSession` is a nanostore subscription, so signing out re-renders this and
 * bounces to /login without any explicit navigation.
 */
export function RequireSession() {
  const { data: session, isPending } = useSession();
  const location = useLocation();

  if (isPending) {
    // Rendering the redirect while the session is still resolving would flash
    // the login form on every page load for an already-signed-in user.
    return (
      <main>
        <p className="muted">Loading…</p>
      </main>
    );
  }

  if (!session) {
    // `from` lets the login page send the user back where they were aiming.
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
