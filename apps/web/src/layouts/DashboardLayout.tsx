import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { signOut, useSession } from '../lib/auth-client.js';

/**
 * The signed-in shell: persistent nav plus whichever tab is active.
 *
 * Mounted INSIDE `RequireSession` (see App.tsx), so reaching this at all means a
 * session resolved. That is a UX guarantee, not a security one — every tab's
 * data still comes from routes behind `requireAuth`, which 401 on their own.
 *
 * Sign-out lives here rather than on a page because it applies to the whole
 * shell; no tab should have to reimplement it.
 */
export function DashboardLayout() {
  const { data: session } = useSession();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
      // `RequireSession` would bounce here on its own once the session store
      // clears; navigating explicitly avoids a frame of the empty app shell.
      void navigate('/login', { replace: true });
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="shell">
      <header className="shell-header">
        <div className="shell-bar">
          <span className="shell-brand">Expense Tracker</span>
          <span className="muted shell-user">
            {session?.user.name ?? 'Signed in'}{' '}
            <button
              type="button"
              className="link"
              disabled={signingOut}
              onClick={() => void handleSignOut()}
            >
              {signingOut ? 'Logging out…' : 'Log out'}
            </button>
          </span>
        </div>

        {/* No `end` on /expenses on purpose: drilling into /expenses/:groupId
            should keep the tab you arrived through looking active. */}
        <nav className="shell-nav">
          <NavLink to="/expenses">Expenses</NavLink>
          <NavLink to="/statistics">Statistics</NavLink>
          <NavLink to="/account">Account</NavLink>
        </nav>
      </header>

      <main>
        <Outlet />
      </main>
    </div>
  );
}
