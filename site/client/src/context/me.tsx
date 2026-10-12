// Who is signed in, for the whole shell (spec §4.11 "State": a MeProvider around /api/me).
//
// The readable `sh_hint` cookie (the user's publicId, set next to the HttpOnly session cookie)
// decides whether to ask at all: without it the visitor is anonymous and the shell makes no
// /api/me request, like the bridge. With it, GET /api/me says who it is; a `{signedIn:false}`
// answer (expired or revoked session) clears the stale hint.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { fetchMe, isApiProblem, type ApiProblem, type Maintenance, type MeUser } from '../lib/api';

export const HINT_COOKIE = 'sh_hint';

export type MeState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'signed-in'; user: MeUser; maintenance: Maintenance | null }
  | { status: 'error'; problem: ApiProblem | null };

export interface MeContextValue {
  me: MeState;
  /** Ask /api/me again (or settle as anonymous when there is no hint). */
  refresh(): void;
  /** The session just ended in this tab. */
  setSignedOut(): void;
}

/** The value of a cookie in `cookieString`, or null. */
export function readCookie(cookieString: string, name: string): string | null {
  for (const part of cookieString.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    const value = part.slice(eq + 1).trim();
    try {
      return value ? decodeURIComponent(value) : null;
    } catch {
      return value || null;
    }
  }
  return null;
}

function documentCookie(): string {
  try {
    return document.cookie || '';
  } catch {
    return '';
  }
}

export function readHint(): string | null {
  return readCookie(documentCookie(), HINT_COOKIE);
}

/** Remove a stale `sh_hint` (the server said nobody is signed in). */
export function clearHint(): void {
  try {
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${HINT_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax${secure}`;
  } catch {
    /* ignore */
  }
}

const MeContext = createContext<MeContextValue>({
  me: { status: 'anonymous' },
  refresh: () => undefined,
  setSignedOut: () => undefined,
});

export function MeProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<MeState>(() => (readHint() ? { status: 'loading' } : { status: 'anonymous' }));
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!readHint()) {
      setMe({ status: 'anonymous' });
      return;
    }
    const controller = new AbortController();
    setMe((current) => (current.status === 'signed-in' ? current : { status: 'loading' }));
    fetchMe(controller.signal).then(
      (answer) => {
        if (controller.signal.aborted) return;
        if (answer.signedIn) setMe({ status: 'signed-in', user: answer.user, maintenance: answer.maintenance });
        else {
          clearHint();
          setMe({ status: 'anonymous' });
        }
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setMe({ status: 'error', problem: isApiProblem(error) ? error : null });
      },
    );
    return () => controller.abort();
  }, [attempt]);

  const refresh = useCallback(() => setAttempt((n) => n + 1), []);
  const setSignedOut = useCallback(() => {
    clearHint();
    setMe({ status: 'anonymous' });
  }, []);

  const value = useMemo(() => ({ me, refresh, setSignedOut }), [me, refresh, setSignedOut]);
  return <MeContext.Provider value={value}>{children}</MeContext.Provider>;
}

export function useMe(): MeContextValue {
  return useContext(MeContext);
}
