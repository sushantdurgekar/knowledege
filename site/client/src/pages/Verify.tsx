import { useState, type FormEvent } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { BusyLine, FormMessage, TextField } from '../components/forms';
import { useAuthKit, useCooldown, useSiteConfig } from '../hooks/useAuth';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { STEP_LABELS, useSignInCompletion } from '../hooks/useSignInCompletion';
import { describeAuthError, MESSAGES } from '../lib/auth-errors';
import type { AuthKit } from '../lib/auth-kit';
import { safeNext, withNext } from '../lib/next';

export const RESEND_COOLDOWN_S = 60;
export const NOT_VERIFIED_YET =
  'Your email isn’t verified yet. Open the link in the email we sent you, then press “I’ve verified” again.';

/**
 * `/verify`: after sign-up (or a sign-in refused with `email_unverified`) the Firebase user is
 * still in this page's memory. "I've verified" reloads it, takes a fresh ID token and creates
 * the session. Opened from the email link in a new tab, there is no such user: sign in instead.
 */
export function Verify() {
  useDocumentTitle('Verify your email');
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const configState = useSiteConfig();
  const config = configState.status === 'ready' ? configState.config : null;
  const kitState = useAuthKit(config);

  return (
    <section className="page auth" aria-labelledby="page-title">
      <p className="eyebrow">Account</p>
      {configState.status === 'loading' && (
        <>
          <h1 id="page-title">Verify your email</h1>
          <BusyLine>Loading…</BusyLine>
        </>
      )}
      {configState.status === 'error' && (
        <>
          <h1 id="page-title">Verify your email</h1>
          <FormMessage tone="error">
            <p>Couldn’t reach Study Hubs. Check your connection and try again.</p>
            <button type="button" className="btn btn--small" onClick={configState.retry}>
              Try again
            </button>
          </FormMessage>
        </>
      )}
      {config?.authMode === 'fake' && (
        <>
          <h1 id="page-title">Verify your email</h1>
          <p className="lede">
            This server runs with test accounts. Tick “Email verified” on the{' '}
            <Link to={withNext('/signin', next)}>test sign-in form</Link> to sign in as a verified user.
          </p>
        </>
      )}
      {config?.authMode === 'firebase' &&
        (kitState.status === 'ready' ? (
          <VerifyWithKit kit={kitState.kit} next={next} />
        ) : (
          <>
            <h1 id="page-title">Verify your email</h1>
            {kitState.status === 'error' || !config.firebase ? (
              <FormMessage tone="error">
                {config.firebase
                  ? 'Couldn’t load the sign-in service. Check your connection and reload the page.'
                  : MESSAGES.config}
              </FormMessage>
            ) : (
              <BusyLine>Loading…</BusyLine>
            )}
          </>
        ))}
    </section>
  );
}

function VerifyWithKit({ kit, next }: { kit: AuthKit; next: string }) {
  const location = useLocation();
  const justSent = (location.state as { sent?: boolean } | null)?.sent === true;
  const flow = useSignInCompletion(next, 'verify');
  const cooldown = useCooldown(RESEND_COOLDOWN_S);
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [password, setPassword] = useState('');
  // Read once: the kit forgets the user (signOut) as soon as the session exists.
  const [email] = useState(() => kit.pendingEmail());

  if (!email) {
    return (
      <>
        <h1 id="page-title">Verify your email</h1>
        <p className="lede">
          If you’ve opened the link in the email we sent you, your address is verified. Sign in to continue.
        </p>
        <p className="actions">
          <Link className="btn btn--primary" to={withNext('/signin', next)}>
            Sign in
          </Link>
        </p>
        <p className="muted small">
          No email? Sign in with your email and password, and we’ll offer to send the link again.
        </p>
      </>
    );
  }

  const busy = checking || flow.busy;

  const onVerified = async () => {
    setNotice(null);
    flow.setError(null);
    setChecking(true);
    let token: string | null;
    try {
      token = await kit.verifiedToken();
    } catch (failure) {
      setChecking(false);
      setNotice({ tone: 'error', text: describeAuthError(failure, 'verify').message });
      return;
    }
    setChecking(false);
    if (!token) {
      setNotice({ tone: 'error', text: NOT_VERIFIED_YET });
      return;
    }
    const fresh = token;
    await flow.run(async () => fresh, () => kit.signOut());
  };

  const onResend = async () => {
    if (cooldown.remaining > 0) return;
    setNotice(null);
    try {
      await kit.resendVerification();
      setNotice({ tone: 'success', text: `We’ve sent a new link to ${email}.` });
      cooldown.start();
    } catch (failure) {
      setNotice({ tone: 'error', text: describeAuthError(failure, 'verify').message });
    }
  };

  const onReauth = (event: FormEvent) => {
    event.preventDefault();
    void flow.run(
      () => kit.signInWithPassword(email, password),
      () => kit.signOut(),
    );
  };

  return (
    <>
      <h1 id="page-title">Check your email</h1>
      <p className="lede">
        {justSent ? 'We’ve sent a verification link to ' : 'Your email address isn’t verified yet. We sent a link to '}
        <strong>{email}</strong>. Open it, then come back here and press “I’ve verified”.
      </p>

      {notice && <FormMessage tone={notice.tone}>{notice.text}</FormMessage>}
      {flow.error && flow.error.action !== 'reauth' && <FormMessage tone="error">{flow.error.message}</FormMessage>}
      {checking && <BusyLine>Checking…</BusyLine>}
      {flow.step && <BusyLine>{STEP_LABELS[flow.step]}</BusyLine>}

      {flow.error?.action === 'reauth' ? (
        <form className="form" onSubmit={onReauth} aria-label="Sign in again">
          <FormMessage tone="info">{flow.error.message} Enter your password to finish.</FormMessage>
          <TextField
            label="Password"
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <button type="submit" className="btn btn--primary btn--wide" disabled={busy}>
            Sign in
          </button>
        </form>
      ) : (
        <p className="actions">
          <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void onVerified()}>
            I’ve verified
          </button>
          <button type="button" className="btn" disabled={busy || cooldown.remaining > 0} onClick={() => void onResend()}>
            {cooldown.remaining > 0 ? `Resend in ${cooldown.remaining} s` : 'Resend email'}
          </button>
        </p>
      )}
      {flow.dialog}
    </>
  );
}
