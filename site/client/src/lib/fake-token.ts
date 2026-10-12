// Fake ID tokens (AUTH_MODE=fake, never in production): build-contracts.md §9.
//   "fake:" + base64url(JSON {uid, email, name?, emailVerified?, provider?})
// The server runs the same checks as for a real token (an unverified password account gets
// 403 email_unverified), so the test sign-in form exercises the real flow.

export interface FakeIdentity {
  uid: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  provider?: string;
}

/** Same rule as the server's uid check (Firebase uids, no "/" or "~"). */
export const FAKE_UID_RE = /^[A-Za-z0-9_.:@+-]{1,128}$/;
/** The same rule for an `<input pattern>` (compiled with the `v` flag: `-` must be escaped). */
export const FAKE_UID_PATTERN = '[A-Za-z0-9_.:@+\\-]{1,128}';

export function base64url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function makeFakeToken(identity: FakeIdentity): string {
  const body: Record<string, unknown> = {
    uid: identity.uid,
    email: identity.email,
    emailVerified: identity.emailVerified,
  };
  if (identity.name) body.name = identity.name;
  if (identity.provider) body.provider = identity.provider;
  return `fake:${base64url(JSON.stringify(body))}`;
}
