import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { BusyLine, FormMessage } from '../components/forms';
import { useMe } from '../context/me';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { isApiProblem } from '../lib/api';
import { downloadUnsynced } from '../lib/hubs';
import { localStore } from '../lib/local-progress';
import { finishSignOut, prepareSignOut, type SignOutCheck } from '../lib/signout-flow';

type Phase =
  | { kind: 'waiting' }
  | { kind: 'not-signed-in' }
  | { kind: 'saving' }
  | { kind: 'dirty'; check: SignOutCheck }
  | { kind: 'ending'; check: SignOutCheck }
  | { kind: 'failed'; check: SignOutCheck };

/** Why some progress could not be pushed, in words. */
export function unsyncedReason(check: SignOutCheck): string {
  if (!check.fromCatalog) return 'We couldn’t load the list of hubs, so nothing could be saved.';
  const problem = check.report?.problem;
  if (problem) {
    if (problem.code === 'sync_paused') return 'Syncing is paused until the daily limit resets.';
    if (problem.code === 'maintenance') return 'Study Hubs is under maintenance.';
    if (problem.code === 'clock_skew') return 'This device’s clock is ahead; fix the date and time, then try again.';
    if (problem.status === 0) return 'We couldn’t reach the server.';
    if (problem.status === 401) return 'Your session has ended.';
    return 'The server couldn’t save it right now.';
  }
  if (check.report && check.report.rejected > 0) return 'Some of it is too large to store in your account.';
  return 'It couldn’t be saved to your account.';
}

/** `/signout`: save what is unsynced, end the session, clear this browser's progress, go home. */
export function SignOut() {
  useDocumentTitle('Sign out');
  const { me, setSignedOut } = useMe();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>({ kind: 'waiting' });
  const started = useRef(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const finish = useCallback(
    async (check: SignOutCheck) => {
      if (!alive.current) return; // the user left the page: don't sign out behind their back
      setPhase({ kind: 'ending', check });
      try {
        await finishSignOut({ storage: localStore() }, check.hubs);
      } catch (failure) {
        if (!isApiProblem(failure)) throw failure;
        setPhase({ kind: 'failed', check });
        return;
      }
      setSignedOut();
      navigate('/', { replace: true });
    },
    [navigate, setSignedOut],
  );

  const attempt = useCallback(async () => {
    setPhase({ kind: 'saving' });
    const check = await prepareSignOut({ storage: localStore() });
    if (!alive.current) return;
    if (check.unsynced > 0) setPhase({ kind: 'dirty', check });
    else await finish(check);
  }, [finish]);

  useEffect(() => {
    if (me.status === 'loading' || started.current) return;
    started.current = true;
    if (me.status === 'anonymous') setPhase({ kind: 'not-signed-in' });
    else void attempt(); // signed in, or /api/me failed (the session cookie may still be there)
  }, [me.status, attempt]);

  if (phase.kind === 'not-signed-in') {
    return (
      <section className="page" aria-labelledby="page-title">
        <p className="eyebrow">Account</p>
        <h1 id="page-title">You’re signed out</h1>
        <p className="lede">There’s no session in this browser. Your progress here stays where it is.</p>
        <p className="actions">
          <Link className="btn btn--primary" to="/">
            Browse all hubs
          </Link>
          <Link className="btn" to="/signin">
            Sign in
          </Link>
        </p>
      </section>
    );
  }

  return (
    <section className="page" aria-labelledby="page-title">
      <p className="eyebrow">Account</p>
      <h1 id="page-title">Signing out</h1>
      {(phase.kind === 'waiting' || phase.kind === 'saving') && (
        <BusyLine>Saving your progress to your account…</BusyLine>
      )}
      {phase.kind === 'ending' && <BusyLine>Signing out…</BusyLine>}

      {phase.kind === 'dirty' && (
        <div className="notice notice--warn" role="alert">
          <h2>Some progress isn’t saved to your account</h2>
          <p>
            {phase.check.unsynced === 1 ? '1 change' : `${phase.check.unsynced} changes`} in this browser haven’t reached
            your account. {unsyncedReason(phase.check)} If you sign out now, they are removed from this browser.
          </p>
          <p className="actions">
            <button type="button" className="btn btn--primary" onClick={() => void attempt()}>
              Try again
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                const storage = localStore();
                if (storage) downloadUnsynced(storage, phase.check.hubs);
              }}
            >
              Download unsynced progress (.json)
            </button>
            <button type="button" className="btn btn--danger" onClick={() => void finish(phase.check)}>
              Sign out anyway
            </button>
          </p>
        </div>
      )}

      {phase.kind === 'failed' && (
        <>
          <FormMessage tone="error">
            Couldn’t sign out: the server didn’t answer. Check your connection and try again. Nothing was removed.
          </FormMessage>
          <p className="actions">
            <button type="button" className="btn btn--primary" onClick={() => void finish(phase.check)}>
              Try again
            </button>
            <Link className="btn" to="/account">
              Back to your account
            </Link>
          </p>
        </>
      )}
    </section>
  );
}
