import { initialOf } from '@bridge-shared';
import { useEffect, useId, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { useMe } from '../context/me';
import type { MeUser } from '../lib/api';

/** Header account area: "Sign in", or the user's initial with a small menu (Account, Sign out). */
export function AccountNav() {
  const { me } = useMe();
  if (me.status === 'loading') return <span className="avatar avatar--placeholder" aria-hidden="true" />;
  if (me.status === 'signed-in') return <UserMenu user={me.user} />;
  return (
    <NavLink to="/signin" className="btn btn--small">
      Sign in
    </NavLink>
  );
}

/** A disclosure button that shows two links. Esc or a click outside closes it. */
export function UserMenu({ user }: { user: MeUser }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const { pathname } = useLocation();
  const label = user.name || user.email || 'your account';
  const initial = initialOf(user.name || user.email) || '?';

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="user-menu" ref={root}>
      <button
        ref={button}
        type="button"
        className="user-menu__button"
        aria-expanded={open}
        aria-controls={`${id}-menu`}
        aria-label={`Account menu, signed in as ${label}`}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="avatar" aria-hidden="true">
          {initial}
        </span>
      </button>
      <div id={`${id}-menu`} className="user-menu__panel" hidden={!open}>
        <p className="user-menu__who">
          <span className="muted small">Signed in as</span>
          <span className="user-menu__email">{label}</span>
        </p>
        <ul className="user-menu__list">
          <li>
            <Link to="/account">Account</Link>
          </li>
          <li>
            <Link to="/signout">Sign out</Link>
          </li>
        </ul>
      </div>
    </div>
  );
}
