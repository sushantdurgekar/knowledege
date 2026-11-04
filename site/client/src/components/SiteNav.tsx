import { Link, NavLink, useLocation, useNavigate } from 'react-router';
import { useMe } from '../context/me';

/** Main sections, shown in the header on every shell page. */
export function SiteNav() {
  const { me } = useMe();
  const admin = me.status === 'signed-in' && me.user.admin;
  return (
    <nav aria-label="Main" className="site-nav">
      <ul className="site-nav__list">
        <li>
          <NavLink to="/" end className="site-nav__link">
            Home
          </NavLink>
        </li>
        <li>
          <NavLink to="/quiz" className="site-nav__link">
            Live quiz
          </NavLink>
        </li>
        {admin && (
          <li>
            <NavLink to="/admin" className="site-nav__link">
              Admin
            </NavLink>
          </li>
        )}
      </ul>
    </nav>
  );
}

const LABELS: Record<string, string> = {
  quiz: 'Live quiz',
  host: 'Host',
  play: 'Play',
  admin: 'Admin',
  account: 'Account',
  privacy: 'Privacy',
  signin: 'Sign in',
  signup: 'Sign up',
  reset: 'Reset password',
  verify: 'Verify email',
  signout: 'Sign out',
  backup: 'Backup',
  restore: 'Restore',
  maintenance: 'Maintenance',
  settings: 'Settings',
};

/** The parent of a path: /quiz/play/123456 -> /quiz, /admin/backup -> /admin, /account -> /. */
export function parentOf(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] === 'quiz' && parts.length > 1) return '/quiz';
  return parts.length > 1 ? `/${parts.slice(0, -1).join('/')}` : '/';
}

/**
 * Back button plus breadcrumbs, above every page but home. "Back" goes to the previous page in
 * this tab when there is one inside the site, otherwise to the parent page.
 */
export function BackBar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  if (pathname === '/') return null;
  const parts = pathname.split('/').filter(Boolean);
  const crumbs = parts
    .map((part, i) => ({ to: `/${parts.slice(0, i + 1).join('/')}`, label: LABELS[part] ?? part }))
    .filter((_c, i) => !(parts[0] === 'quiz' && i === 1 && (parts[1] === 'play' || parts[1] === 'host') && parts.length > 2));

  const goBack = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(parentOf(pathname));
  };

  return (
    <div className="back-bar">
      <button type="button" className="btn btn--small btn--quiet back-bar__btn" onClick={goBack}>
        <span aria-hidden="true">←</span> Back
      </button>
      <nav aria-label="Breadcrumb" className="crumbs">
        <ol>
          <li>
            <Link to="/">Home</Link>
          </li>
          {crumbs.map((c, i) => (
            <li key={c.to}>
              {i === crumbs.length - 1 ? <span aria-current="page">{c.label}</span> : <Link to={c.to}>{c.label}</Link>}
            </li>
          ))}
        </ol>
      </nav>
    </div>
  );
}
