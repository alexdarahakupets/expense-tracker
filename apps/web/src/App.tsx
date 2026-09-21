import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { DashboardLayout } from './layouts/DashboardLayout.js';
import { AccountPage } from './pages/AccountPage.js';
import { GroupDetailPage } from './pages/GroupDetailPage.js';
import { GroupsPage } from './pages/GroupsPage.js';
import { LoginPage } from './pages/LoginPage.js';
import { StatisticsPage } from './pages/StatisticsPage.js';
import { RequireSession } from './routes/RequireSession.js';

/**
 * `/login` is public; everything else sits under `RequireSession`, which
 * redirects signed-out visitors there, and then under `DashboardLayout`, which
 * supplies the nav.
 *
 * That redirect is UX only. The server does not trust it: every API route except
 * the health probes goes through `requireAuth` and 401s without a session
 * cookie, so a tampered bundle that forces a page to render gets a shell full of
 * failed requests and no data.
 *
 * Deep links work in production because Express's SPA fallback serves
 * index.html for any non-/api GET.
 */
export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route element={<RequireSession />}>
          <Route element={<DashboardLayout />}>
            {/* Expenses is the app's home; "/" is just a way in. */}
            <Route index element={<Navigate to="/expenses" replace />} />

            <Route path="expenses" element={<GroupsPage />} />
            <Route path="expenses/:groupId" element={<GroupDetailPage />} />
            <Route path="statistics" element={<StatisticsPage />} />
            <Route path="account" element={<AccountPage />} />

            {/*
              Inside the guard on purpose. At the top level this would rewrite the
              URL to "/expenses" before RequireSession ever saw it, so a signed-out
              visitor deep-linking to a real page would be sent to /login carrying
              the wrong return path and land somewhere they never asked for. Here
              the session resolves first and the original path survives the round
              trip.
            */}
            <Route path="*" element={<Navigate to="/expenses" replace />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
