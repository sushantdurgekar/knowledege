import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { BusyLine, FormMessage, TextField } from '../components/forms';
import { useMe } from '../context/me';
import { useAuthKit, useSiteConfig, type KitState } from '../hooks/useAuth';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { STEP_LABELS, useSignInCompletion } from '../hooks/useSignInCompletion';
import { MESSAGES } from '../lib/auth-errors';
import { FAKE_UID_PATTERN, makeFakeToken, type FakeIdentity } from '../lib/fake-token';
import { safeNext, withNext } from '../lib/next';

/** `/signin?next=`: Google popup or email + password (Firebase), or the test form (fake auth). */
export function SignIn() {
  useDocumentTitle('Sign in');
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const { me } = useMe();
  const configState = useSiteConfig();
  const config = configState.status === 'ready' ? configState.config : null;
  const kitState = useAuthKit(config);
  const flow = useSignInCompletion(next, 'signin');

  if (me.status === 'signed-in' && !flow.busy) {
    const who = me.user.email || me.user.name || 'your account';
    return (
      <section className="page auth" aria-labelledby="page-title">
        <p className="eyebrow">Account</p>
        <h1 id="page-title">You’re signed in</h1>
        <p className="lede">
          You’re signed in as <strong>{who}</strong>. To use another account, sign out first.
        </p>
        <p className="actions">
          {/* A full navigation: `next` may be a hub page served by the backend. */}
          <a className="btn btn--primary" href={next}>
            Continue
          </a>
          <Link className="btn" to="/signout">
            Sign out
          </Link>
        </p>
      </section>
    );
  }

  return (
    <section className="page auth" aria-labelledby="page-title">
      <p className="eyebrow">Account</p>
      <h1 id="page-title">Sign in</h1>
      <p className="lede">Sign in to keep your progress in sync across devices. Every hub also works without an account.</p>

      {flow.error && <FormMessage tone="error">{flow.error.message}</FormMessage>}
      {flow.step && <BusyLine>{STEP_LABELS[flow.step]}</BusyLine>}

      {configState.status === 'loading' && <BusyLine>Loading…</BusyLine>}
      {configState.status === 'error' && (
        <FormMessage tone="error">
          <p>Couldn’t reach Study Hubs. Check your connection and try again.</p>
          <button type="button" className="btn btn--small" onClick={configState.retry}>
            Try again
          </button>
        </FormMessage>
      )}

      {config?.authMode === 'fake' && (
        <FakeSignInForm
          disabled={flow.busy}
          onSubmit={(identity) => void flow.run(async () => makeFakeToken(identity))}
        />
      )}

      {config?.authMode === 'firebase' && (
        <FirebaseSignIn kitState={kitState} hasConfig={!!config.firebase} busy={flow.busy} run={flow.run} />
      )}

      {config && (
        <p className="auth__links">
          New here? <Link to={withNext('/signup', next)}>Create an account</Link>
        </p>
      )}
      {flow.dialog}
    </section>
  );
}

function FirebaseSignIn({
  kitState,
  hasConfig,
  busy,
  run,
}: {
  kitState: KitState;
  hasConfig: boolean;
  busy: boolean;
  run: (getToken: () => Promise<string>, afterSession?: () => unknown) => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const kit = kitState.status === 'ready' ? kitState.kit : null;

  if (!hasConfig) return <FormMessage tone="error">{MESSAGES.config}</FormMessage>;
  if (kitState.status === 'error')
    return (
      <FormMessage tone="error">Couldn’t load the sign-in service. Check your connection and reload the page.</FormMessage>
    );

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!kit) return;
    void run(
      () => kit.signInWithPassword(email.trim(), password),
      () => kit.signOut(),
    );
  };

  return (
    <div className="auth__methods">
      <button
        type="button"
        className="btn btn--wide"
        disabled={!kit || busy}
        onClick={() => kit && void run(() => kit.signInWithGoogle(), () => kit.signOut())}
      >
        <GoogleMark />
        Continue with Google
      </button>
      <p className="divider">
        <span>or</span>
      </p>
      <form className="form" onSubmit={onSubmit} aria-label="Sign in with email">
        <TextField
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <TextField
          label="Password"
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <button type="submit" className="btn btn--primary btn--wide" disabled={!kit || busy}>
          Sign in
        </button>
      </form>
      <p className="auth__links">
        <Link to="/reset">Forgot your password?</Link>
      </p>
    </div>
  );
}

/** Test sign-in (AUTH_MODE=fake only): posts a `fake:` token, exactly like the e2e tests do. */
export function FakeSignInForm({
  disabled,
  onSubmit,
}: {
  disabled: boolean;
  onSubmit: (identity: FakeIdentity) => void;
}) {
  const [uid, setUid] = useState('');
  const [email, setEmail] = useState('');
  const [verified, setVerified] = useState(true);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit({ uid: uid.trim(), email: email.trim(), emailVerified: verified });
  };

  return (
    <form className="form form--test" onSubmit={submit} aria-labelledby="test-signin-title">
      <h2 id="test-signin-title">Test sign-in</h2>
      <p className="muted small">
        This server runs with test accounts (fake auth), which production never allows. Any user id signs in.
      </p>
      <TextField
        label="User id"
        name="uid"
        required
        autoComplete="off"
        spellCheck={false}
        pattern={FAKE_UID_PATTERN}
        value={uid}
        onChange={(event) => setUid(event.target.value)}
        hint="Letters, digits and _ . : @ + - (up to 128)."
      />
      <TextField
        label="Email"
        type="email"
        name="email"
        required
        autoComplete="off"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <div className="checkbox">
        <input
          id="test-verified"
          type="checkbox"
          checked={verified}
          onChange={(event) => setVerified(event.target.checked)}
        />
        <label htmlFor="test-verified">Email verified</label>
      </div>
      <button type="submit" className="btn btn--primary btn--wide" disabled={disabled}>
        Test sign-in
      </button>
    </form>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
