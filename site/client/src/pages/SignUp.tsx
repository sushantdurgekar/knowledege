import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { BusyLine, FormMessage, TextField } from '../components/forms';
import { useAuthKit, useSiteConfig } from '../hooks/useAuth';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { describeAuthError, MESSAGES } from '../lib/auth-errors';
import { safeNext, withNext } from '../lib/next';

export const MIN_PASSWORD = 8;

/** `/signup`: create an email + password account, then verify the email (link → /verify). */
export function SignUp() {
  useDocumentTitle('Create an account');
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const navigate = useNavigate();
  const configState = useSiteConfig();
  const config = configState.status === 'ready' ? configState.config : null;
  const kitState = useAuthKit(config);
  const kit = kitState.status === 'ready' ? kitState.kit : null;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!kit || busy) return;
    if (password.length < MIN_PASSWORD) {
      setError(MESSAGES.weakPassword);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await kit.signUp({ name: name.trim(), email: email.trim(), password });
      navigate(withNext('/verify', next), { state: { sent: true } });
    } catch (failure) {
      setBusy(false);
      const friendly = describeAuthError(failure, 'signup');
      if (!friendly.silent) setError(friendly.message);
    }
  };

  return (
    <section className="page auth" aria-labelledby="page-title">
      <p className="eyebrow">Account</p>
      <h1 id="page-title">Create an account</h1>
      <p className="lede">An account keeps your hub progress in sync across your devices. It’s free.</p>

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
        <FormMessage tone="info">
          This server runs with test accounts. Use the <Link to={withNext('/signin', next)}>test sign-in form</Link>{' '}
          instead.
        </FormMessage>
      )}

      {config?.authMode === 'firebase' && !config.firebase && <FormMessage tone="error">{MESSAGES.config}</FormMessage>}
      {kitState.status === 'error' && config?.firebase && (
        <FormMessage tone="error">Couldn’t load the sign-in service. Check your connection and reload the page.</FormMessage>
      )}

      {config?.authMode === 'firebase' && config.firebase && (
        <form className="form" onSubmit={onSubmit} aria-label="Create an account">
          {error && <FormMessage tone="error">{error}</FormMessage>}
          <TextField
            label="Name (optional)"
            name="name"
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
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
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            hint={`At least ${MIN_PASSWORD} characters.`}
          />
          <button type="submit" className="btn btn--primary btn--wide" disabled={!kit || busy}>
            {busy ? 'Creating your account…' : 'Create account'}
          </button>
          <p className="muted small">We’ll email you a link to confirm the address before your progress can sync.</p>
        </form>
      )}

      {config && (
        <p className="auth__links">
          Already have an account? <Link to={withNext('/signin', next)}>Sign in</Link>
        </p>
      )}
    </section>
  );
}
