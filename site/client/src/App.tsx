import { Route, Routes } from 'react-router';
import { Layout } from './components/Layout';
import { Catalog } from './pages/Catalog';
import { ComingSoon } from './pages/ComingSoon';
import { NotFound } from './pages/NotFound';
import { Privacy } from './pages/Privacy';

/** Account routes are M0 placeholders; M1/M2 replace them with the real pages (build-contracts.md §7). */
const ACCOUNT_ROUTES = [
  { path: 'signin', page: 'Sign in' },
  { path: 'signup', page: 'Create an account' },
  { path: 'reset', page: 'Reset password' },
  { path: 'verify', page: 'Verify email' },
  { path: 'signout', page: 'Sign out' },
  { path: 'account', page: 'Your account' },
  { path: 'admin/*', page: 'Admin' },
] as const;

/** Route table. Must stay in step with the server's SPA_ROUTES (site/server/app/static_routes.py). */
export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Catalog />} />
        {ACCOUNT_ROUTES.map(({ path, page }) => (
          <Route key={path} path={path} element={<ComingSoon page={page} />} />
        ))}
        <Route path="privacy" element={<Privacy />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
