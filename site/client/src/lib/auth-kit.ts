// The sign-in methods the auth pages use, behind one small interface. The Firebase JS SDK lives
// only in `./firebase-auth` (its own lazy chunk, `assets/firebase-*.js`), which this module loads
// with a dynamic import when a page first needs it, and only in authMode "firebase". The fake
// auth mode never loads it (build-contracts.md §14).
import type { SiteConfig } from './api';

export interface SignUpInput {
  name: string;
  email: string;
  password: string;
}

export interface AuthKit {
  /** Google popup sign-in; resolves the ID token. */
  signInWithGoogle(): Promise<string>;
  /** Email + password sign-in; resolves the ID token. */
  signInWithPassword(email: string, password: string): Promise<string>;
  /** Create the account, set the display name and send the verification email (link → /verify). */
  signUp(input: SignUpInput): Promise<void>;
  /** Send a password-reset email. */
  resetPassword(email: string): Promise<void>;
  /** The email of the user signed in to Firebase in this page (kept in memory only), or null. */
  pendingEmail(): string | null;
  /** The pending user's sign-in provider ("password", "google.com"), or null. */
  pendingProvider(): string | null;
  /** Send the verification email again to the pending user. */
  resendVerification(): Promise<void>;
  /** Reload the pending user; a fresh ID token once the email is verified, else null. */
  verifiedToken(): Promise<string | null>;
  /** Forget the Firebase user in this page (the server session is separate). */
  signOut(): Promise<void>;
}

let kit: Promise<AuthKit> | null = null;

/** Load Firebase (once per page) and build the kit. Rejects when the site isn't configured for it. */
export function loadAuthKit(config: SiteConfig): Promise<AuthKit> {
  const web = config.firebase;
  if (config.authMode !== 'firebase' || !web) {
    return Promise.reject(Object.assign(new Error('Firebase is not configured'), { code: 'auth/configuration-not-found' }));
  }
  if (!kit) {
    kit = import('./firebase-auth').then((mod) => mod.createAuthKit(web, config.origin));
    kit.catch(() => {
      kit = null; // a failed chunk load can be retried
    });
  }
  return kit;
}
