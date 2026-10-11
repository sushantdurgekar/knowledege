import { useEffect, useRef } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { BrandMark } from './BrandMark';

/** Page chrome shared by every shell route: skip link, header, main landmark, footer. */
export function Layout() {
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const lastPath = useRef(pathname);

  // On client-side navigation, start the new page at the top and move focus to it, so keyboard
  // and screen-reader users land on the new content instead of the link they just used.
  useEffect(() => {
    if (lastPath.current === pathname) return; // first render (and StrictMode's re-run)
    lastPath.current = pathname;
    window.scrollTo(0, 0);
    mainRef.current?.focus({ preventScroll: true });
  }, [pathname]);

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <div className="wrap site-header__row">
          <Link to="/" className="brand">
            <BrandMark />
            <span>Study Hubs</span>
          </Link>
          <nav aria-label="Account">
            <NavLink to="/signin" className="btn btn--small">
              Sign in
            </NavLink>
          </nav>
        </div>
      </header>

      <main id="main" ref={mainRef} tabIndex={-1} className="wrap site-main">
        <Outlet />
      </main>

      <footer className="site-footer">
        <div className="wrap site-footer__row">
          <p className="site-footer__note">Progress is saved in this browser.</p>
          <nav aria-label="Footer">
            <ul className="site-footer__links">
              <li>
                <Link to="/">All hubs</Link>
              </li>
              <li>
                <Link to="/privacy">Privacy</Link>
              </li>
            </ul>
          </nav>
        </div>
      </footer>
    </div>
  );
}
