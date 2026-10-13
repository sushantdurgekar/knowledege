import { lazy } from 'react';
import { Route, Routes } from 'react-router';
import { Layout } from './components/Layout';
import { MeProvider } from './context/me';
import { Catalog } from './pages/Catalog';
import { NotFound } from './pages/NotFound';

// Account pages are lazy chunks, so the catalog's main bundle stays small. Firebase is loaded
// later still, by the pages that need it, and only in authMode "firebase" (build-contracts §14).
const SignIn = lazy(() => import('./pages/SignIn').then((m) => ({ default: m.SignIn })));
const SignUp = lazy(() => import('./pages/SignUp').then((m) => ({ default: m.SignUp })));
const ResetPassword = lazy(() => import('./pages/ResetPassword').then((m) => ({ default: m.ResetPassword })));
const Verify = lazy(() => import('./pages/Verify').then((m) => ({ default: m.Verify })));
const SignOut = lazy(() => import('./pages/SignOut').then((m) => ({ default: m.SignOut })));
const Account = lazy(() => import('./pages/Account').then((m) => ({ default: m.Account })));
const Privacy = lazy(() => import('./pages/Privacy').then((m) => ({ default: m.Privacy })));
// The admin pages are their own chunk (≤ 40 KB gz, build-contracts §21), loaded only on /admin.
const Admin = lazy(() => import('./pages/admin/Admin').then((m) => ({ default: m.Admin })));

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
          <Route path="admin/*" element={<Admin />} />
          <Route path="privacy" element={<Privacy />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </MeProvider>
  );
}
