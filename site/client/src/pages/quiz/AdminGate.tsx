import type { ReactNode } from 'react';
import { BusyLine } from '../../components/forms';
import { useMe } from '../../context/me';
import { NotFound } from '../NotFound';

/** Admin-only pages: everyone else sees the ordinary "Page not found". */
export function AdminGate({ children }: { children: ReactNode }) {
  const { me } = useMe();
  if (me.status === 'loading') return <BusyLine>Loading…</BusyLine>;
  if (me.status !== 'signed-in' || !me.user.admin) return <NotFound />;
  return <>{children}</>;
}
