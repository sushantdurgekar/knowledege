import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { BusyLine, FormMessage, TextField } from '../components/forms';
import { useAuthKit, useCooldown, useSiteConfig } from '../hooks/useAuth';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { describeAuthError, MESSAGES } from '../lib/auth-errors';

export const RESET_COOLDOWN_S = 60;

/** Only these failures are worth reporting; anything else gets the same answer as success. */
const TRANSIENT: ReadonlySet<string> = new Set([MESSAGES.network, MESSAGES.tooMany]);

/** `/reset`: send a password-reset email. The answer never says whether the account exists. */
export function ResetPassword() {
  useDocumentTitle('Reset password');
  const configState = useSiteConfig();
  const config = configState.status === 'ready' ? configState.config : null;
  const kitState = useAuthKit(config);
  const kit = kitState.status === 'ready' ? kitState.kit : null;
  const cooldown = useCooldown(RESET_COOLDOWN_S);

  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!kit || busy || cooldown.remaining > 0) return;
    const address = email.trim();
    setBusy(true);
    setError(null);
    try {
      await kit.resetPassword(address);
      setSentTo(address);
      cooldown.start();
    } catch (failure) {
      const { message } = describeAuthError(failure, 'reset');
      if (TRANSIENT.has(message)) setError(message);
      else {
        // Unknown address, disabled account, ...: same answer as a success (no enumeration).
        setSentTo(address);
        cooldown.start();
      }
    } finally {
      setBusy(false);
    }
  };

  const waiting = cooldown.remaining > 0;

  return (
    <section className="page auth" aria-labelledby="page-title">
      <p className="eyebrow">Account</p>
      <h1 id="page-title">Reset your password</h1>
      <p className="lede">Enter the email you signed up with and we’ll send you a link to choose a new password.</p>

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
          This server runs with test accounts, which have no passwords. Use the{' '}
          <Link to="/signin">test sign-in form</Link>.
        </FormMessage>
      )}
      {config?.authMode === 'firebase' && !config.firebase && <FormMessage tone="error">{MESSAGES.config}</FormMessage>}
      {kitState.status === 'error' && (
        <FormMessage tone="error">Couldn’t load the sign-in service. Check your connection and reload the page.</FormMessage>
      )}

      {config?.authMode === 'firebase' && config.firebase && (
        <form className="form" onSubmit={onSubmit} aria-label="Reset your password">
          {error && <FormMessage tone="error">{error}</FormMessage>}
          {sentTo && (
            <FormMessage tone="success">
              If an account exists for <strong>{sentTo}</strong>, we’ve sent it a link to reset the password. Check
              your inbox and spam folder.
            </FormMessage>
          )}
          <TextField
            label="Email"
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <button type="submit" className="btn btn--primary btn--wide" disabled={!kit || busy || waiting}>
            {waiting ? `Send again in ${cooldown.remaining} s` : sentTo ? 'Send again' : 'Send reset link'}
          </button>
        </form>
      )}

      <p className="auth__links">
        <Link to="/signin">Back to sign in</Link>
      </p>
    </section>
  );
}
