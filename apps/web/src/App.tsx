import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { HomePage } from './pages/HomePage.js';
import { LoginPage } from './pages/LoginPage.js';
import { RequireSession } from './routes/RequireSession.js';

/**
 * `/login` is public; everything else sits under `RequireSession`, which
 * redirects signed-out visitors there.
 *
 * That redirect is UX only. The server does not trust it: every API route except
 * the health probes goes through `requireAuth` and 401s without a session
 * cookie, so a tampered bundle that forces `HomePage` to render gets a page full
 * of failed requests and no data.
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
          <Route index element={<HomePage />} />

          {/*
            Inside the guard on purpose. At the top level this would rewrite the
            URL to "/" before RequireSession ever saw it, so a signed-out visitor
            deep-linking to a real page would be sent to /login carrying "/" as
            the return path and land somewhere they never asked for. Here the
            session resolves first and the original path survives the round trip.
          */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
