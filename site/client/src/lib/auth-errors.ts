// Friendly, generic messages for Firebase Auth and our own API errors.
//
// Messages never say whether an account exists (no account enumeration): a wrong password, an
// unknown email and a disabled account all read "The email or password is incorrect.", and a
// failed sign-up never confirms that the email is taken.
import { isApiProblem } from './api';

export type AuthContext = 'signin' | 'signup' | 'reset' | 'verify';

export interface FriendlyError {
  message: string;
  /** `verify`: go to /verify; `reauth`: ask the user to sign in again. */
  action?: 'verify' | 'reauth';
  /** The user cancelled (closed the popup): show nothing. */
  silent?: boolean;
}

export const MESSAGES = {
  generic: 'Sign-in failed. Please try again.',
  credentials: 'The email or password is incorrect.',
  tooMany: 'Too many attempts. Wait a few minutes, then try again.',
  network: 'Couldn’t reach the sign-in service. Check your connection and try again.',
  unavailable: 'Signing in isn’t available right now. Please try again in a minute.',
  maintenance: 'Signing in is paused for maintenance. Please try again later.',
  popupBlocked: 'Your browser blocked the sign-in window. Allow pop-ups for this site and try again.',
  verify: 'Verify your email address to finish signing in.',
  reauth: 'For your security, please sign in again.',
  csrf: 'Your browser blocked the request. Reload the page and try again.',
  signup: 'We couldn’t create an account with those details. If you already have one, sign in or reset your password.',
  invalidEmail: 'Enter a valid email address.',
  weakPassword: 'Choose a stronger password: at least 8 characters.',
  otherMethod: 'Couldn’t sign in this way. Use the sign-in method you chose when you created your account.',
  notEnabled: 'This sign-in method isn’t available.',
  domain: 'Sign-in isn’t set up for this site address yet.',
  config: 'Signing in isn’t set up on this site yet.',
} as const;

const CREDENTIAL_CODES = new Set([
  'auth/invalid-credential',
  'auth/invalid-login-credentials',
  'auth/wrong-password',
  'auth/user-not-found',
  'auth/user-disabled',
  'auth/invalid-email',
  'auth/missing-password',
  'auth/user-mismatch',
]);

const CANCEL_CODES = new Set(['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled']);

function firebaseCode(error: unknown): string | null {
  const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;
  return typeof code === 'string' && code.startsWith('auth/') ? code : null;
}

export function describeAuthError(error: unknown, context: AuthContext = 'signin'): FriendlyError {
  if (isApiProblem(error)) {
    switch (error.code) {
      case 'email_unverified':
        return { message: MESSAGES.verify, action: 'verify' };
      case 'stale_login':
        return { message: MESSAGES.reauth, action: 'reauth' };
      case 'csrf':
        return { message: MESSAGES.csrf };
      case 'rate_limited':
        return { message: MESSAGES.tooMany };
      case 'maintenance':
        return { message: MESSAGES.maintenance };
      case 'network':
      case 'timeout':
        return { message: MESSAGES.network };
      default:
        return { message: error.status >= 500 || error.code === 'unavailable' ? MESSAGES.unavailable : MESSAGES.generic };
    }
  }

  const code = firebaseCode(error);
  if (code === null) return { message: MESSAGES.generic };
  if (CANCEL_CODES.has(code)) return { message: '', silent: true };
  switch (code) {
    case 'auth/popup-blocked':
      return { message: MESSAGES.popupBlocked };
    case 'auth/too-many-requests':
      return { message: MESSAGES.tooMany };
    case 'auth/network-request-failed':
    case 'auth/timeout':
      return { message: MESSAGES.network };
    case 'auth/requires-recent-login':
    case 'auth/user-token-expired':
      return { message: MESSAGES.reauth, action: 'reauth' };
    case 'auth/account-exists-with-different-credential':
      return { message: MESSAGES.otherMethod };
    case 'auth/operation-not-allowed':
    case 'auth/admin-restricted-operation':
      return { message: MESSAGES.notEnabled };
    case 'auth/unauthorized-domain':
    case 'auth/unauthorized-continue-uri':
      return { message: MESSAGES.domain };
    case 'auth/invalid-api-key':
    case 'auth/configuration-not-found':
      return { message: MESSAGES.config };
  }
  if (context === 'signup') {
    if (code === 'auth/invalid-email') return { message: MESSAGES.invalidEmail };
    if (code === 'auth/weak-password' || code === 'auth/password-does-not-meet-requirements')
      return { message: MESSAGES.weakPassword };
    return { message: MESSAGES.signup };
  }
  if (CREDENTIAL_CODES.has(code)) return { message: MESSAGES.credentials };
  return { message: MESSAGES.generic };
}
