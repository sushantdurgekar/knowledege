// Small pieces shared by the admin tabs: a loader hook, the meter bar, and failure handling.
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { FormMessage } from '../../components/forms';
import { isReauth } from '../../lib/account';
import { adminProblem, meterTone } from '../../lib/admin-api';
import { isApiProblem } from '../../lib/api';
import { reauthPath } from '../../lib/next';

export type Load<T> = { status: 'loading' } | { status: 'error'; message: string; notFound: boolean } | { status: 'ready'; data: T };

/** Run `fetcher` on mount and on `reload()`; a superseded or unmounted run never sets state. */
export function useLoad<T>(fetcher: (signal: AbortSignal) => Promise<T>): {
  state: Load<T>;
  reload: () => void;
  set: (data: T) => void;
} {
  const [state, setState] = useState<Load<T>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetcher(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setState({ status: 'ready', data });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        const notFound = isApiProblem(error) && error.status === 404;
        setState({ status: 'error', message: adminProblem(error, 'Couldn’t load this. Try again.'), notFound });
      },
    );
    return () => controller.abort();
    // `fetcher` is a module-level API function; only `attempt` restarts the load.
  }, [attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const set = useCallback((data: T) => setState({ status: 'ready', data }), []);
  return { state, reload, set };
}

/**
 * The error handler of a destructive action: `reauth_required` sends the admin to sign in again
 * (and back to /admin); anything else becomes a message for the form.
 */
export function useActionError(): (error: unknown, fallback?: string) => string | null {
  const navigate = useNavigate();
  return useCallback(
    (error: unknown, fallback?: string) => {
      if (isReauth(error)) {
        navigate(reauthPath('/admin'));
        return null;
      }
      return adminProblem(error, fallback);
    },
    [navigate],
  );
}

export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <FormMessage tone="error">
      <p>{message}</p>
      <button type="button" className="btn btn--small" onClick={onRetry}>
        Try again
      </button>
    </FormMessage>
  );
}

/** A labelled bar: `--good` below 50%, `--trap` below 80%, `--bad` from there on. */
export function Meter({ label, used, limit, text }: { label: string; used: number; limit: number; text: ReactNode }) {
  const tone = meterTone(used, limit);
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 100;
  return (
    <div className={`admin-meter admin-meter--${tone}`}>
      <div className="admin-meter__head">
        <span className="admin-meter__label">{label}</span>
        <span className="admin-meter__value">{text}</span>
      </div>
      <div
        className="admin-meter__bar"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={Math.min(used, limit)}
        aria-valuetext={`${Math.round(pct)}%`}
        data-tone={tone}
      >
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const NUMBER = new Intl.NumberFormat('en-GB');
export const fmtNumber = (n: number | null | undefined): string => (typeof n === 'number' ? NUMBER.format(n) : '—');

export function StateChip({ state }: { state: string }) {
  const tone =
    state === 'succeeded' ? 'good' : state === 'running' || state === 'scheduled' ? 'info' : state === 'cancelled' ? 'muted' : 'warn';
  return <span className={`chip-status chip-status--${tone}`}>{state}</span>;
}
