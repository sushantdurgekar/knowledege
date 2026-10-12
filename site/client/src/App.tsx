import { lazy } from 'react';
import { Route, Routes } from 'react-router';
import { Layout } from './components/Layout';
import { MeProvider } from './context/me';
import { Catalog } from './pages/Catalog';
import { ComingSoon } from './pages/ComingSoon';
import { NotFound } from './pages/NotFound';
import { Privacy } from './pages/Privacy';

// Account pages are lazy chunks, so the catalog's main bundle stays small. Firebase is loaded
// later still, by the pages that need it, and only in authMode "firebase" (build-contracts §14).
const SignIn = lazy(() => import('./pages/SignIn').then((m) => ({ default: m.SignIn })));
const SignUp = lazy(() => import('./pages/SignUp').then((m) => ({ default: m.SignUp })));
const ResetPassword = lazy(() => import('./pages/ResetPassword').then((m) => ({ default: m.ResetPassword })));
const Verify = lazy(() => import('./pages/Verify').then((m) => ({ default: m.Verify })));
const SignOut = lazy(() => import('./pages/SignOut').then((m) => ({ default: m.SignOut })));
const Account = lazy(() => import('./pages/Account').then((m) => ({ default: m.Account })));

/** Route table. Must stay in step with the server's SPA_ROUTES (site/server/app/static_routes.py). */
export function App() {
  return (
    <MeProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Catalog />} />
          <Route path="signin" element={<SignIn />} />
          <Route path="signup" element={<SignUp />} />
          <Route path="reset" element={<ResetPassword />} />
          <Route path="verify" element={<Verify />} />
          <Route path="signout" element={<SignOut />} />
          <Route path="account" element={<Account />} />
          {/* M2 replaces this placeholder with the admin pages. */}
          <Route path="admin/*" element={<ComingSoon page="Admin" />} />
          <Route path="privacy" element={<Privacy />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </MeProvider>
  );
}
