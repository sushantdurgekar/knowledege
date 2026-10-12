// Firebase Auth for the shell (spec §4.6 step 1). Lazy: imported only by `auth-kit.ts` through a
// dynamic import, so the SDK is a separate chunk that the catalog never downloads.
//
// - `initializeAuth` with in-memory persistence: Firebase keeps no session of its own in the
//   browser; the server's HttpOnly session cookie is the only session. Reloading the page forgets
//   the Firebase user, which is fine because every flow ends by creating the server session.
// - `browserPopupRedirectResolver` is needed for `signInWithPopup` (no redirect flow, no email link).
import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  browserPopupRedirectResolver,
  createUserWithEmailAndPassword,
  getIdToken,
  GoogleAuthProvider,
  inMemoryPersistence,
  initializeAuth,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type Auth,
} from 'firebase/auth';
import type { FirebaseWebConfig } from './api';
import type { AuthKit } from './auth-kit';

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

function getAuthInstance(config: FirebaseWebConfig): Auth {
  if (!auth) {
    app = initializeApp(config);
    auth = initializeAuth(app, {
      persistence: inMemoryPersistence,
      popupRedirectResolver: browserPopupRedirectResolver,
    });
    auth.useDeviceLanguage();
  }
  return auth;
}

export function createAuthKit(config: FirebaseWebConfig, origin: string): AuthKit {
  const a = getAuthInstance(config);
  const verifyUrl = { url: `${origin}/verify` };

  const requireUser = () => {
    const user = a.currentUser;
    if (!user) throw Object.assign(new Error('No user'), { code: 'auth/user-token-expired' });
    return user;
  };

  return {
    async signInWithGoogle() {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const result = await signInWithPopup(a, provider);
      return getIdToken(result.user);
    },
    async signInWithPassword(email, password) {
      const result = await signInWithEmailAndPassword(a, email, password);
      return getIdToken(result.user);
    },
    async signUp({ name, email, password }) {
      const { user } = await createUserWithEmailAndPassword(a, email, password);
      if (name) await updateProfile(user, { displayName: name });
      await sendEmailVerification(user, verifyUrl);
    },
    async resetPassword(email) {
      await sendPasswordResetEmail(a, email, { url: `${origin}/signin` });
    },
    pendingEmail() {
      return a.currentUser?.email ?? null;
    },
    pendingProvider() {
      return a.currentUser?.providerData[0]?.providerId ?? null;
    },
    async resendVerification() {
      await sendEmailVerification(requireUser(), verifyUrl);
    },
    async verifiedToken() {
      const user = requireUser();
      await reload(user);
      if (!user.emailVerified) return null;
      return getIdToken(user, true); // a fresh token carries email_verified: true
    },
    async signOut() {
      await signOut(a);
    },
  };
}
