// /signin, /verify, /signup, /reset: the fake-mode test form, sign-in completion, errors, the
// account-switch dialog, and the lazy Firebase kit (mocked; only firebase mode may load it).
import { readOwner, readSynced } from '@bridge-shared';
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { resetConfigCache } from '../src/lib/api';
import { pageNavigation } from '../src/lib/navigation';
import {
  bodyText,
  decodeBase64url,
  captureBroadcasts,
  FIREBASE_CONFIG,
  json,
  ME_SIGNED_IN,
  mockServer,
  seedDirtyProgress,
  setHint,
  T0,
  USER,
} from './api-mock';
import { currentLocation, renderApp } from './render';

const firebase = vi.hoisted(() => ({
  loaded: 0,
  signedOut: 0,
  google: async (): Promise<string> => 'fb-google-token',
  password: async (_email: string, _password: string): Promise<string> => 'fb-password-token',
  reset: async (_email: string): Promise<void> => undefined,
}));

vi.mock('../src/lib/firebase-auth', () => {
  firebase.loaded++;
  return {
    createAuthKit: () => ({
      signInWithGoogle: () => firebase.google(),
      signInWithPassword: (email: string, password: string) => firebase.password(email, password),
      signUp: async () => undefined,
      resetPassword: (email: string) => firebase.reset(email),
      pendingEmail: () => null,
      pendingProvider: () => null,
      resendVerification: async () => undefined,
      verifiedToken: async () => null,
      signOut: async () => {
        firebase.signedOut++;
      },
    }),
  };
});

const fbError = (code: string) => Object.assign(new Error(code), { code });

let assign: Mock<(url: string) => void>;
let broadcasts: ReturnType<typeof captureBroadcasts>;

beforeEach(() => {
  resetConfigCache();
  assign = vi.fn<(url: string) => void>();
  vi.spyOn(pageNavigation, 'assign').mockImplementation(assign);
  broadcasts = captureBroadcasts();
});

afterEach(() => setHint(null));

const decodeToken = (token: string) => JSON.parse(decodeBase64url(token.slice(5)));

async function submitTestForm(user: ReturnType<typeof renderApp>['user'], opts: { uid?: string; verified?: boolean } = {}) {
  const form = await screen.findByRole('form', { name: 'Test sign-in' });
  await user.type(within(form).getByLabelText('User id'), opts.uid ?? 'alice');
  await user.type(within(form).getByLabelText('Email'), 'alice@example.com');
  if (opts.verified === false) await user.click(within(form).getByLabelText('Email verified'));
  await user.click(within(form).getByRole('button', { name: 'Test sign-in' }));
}

describe('/signin in fake auth mode', () => {
  it('shows the test form and never loads Firebase', async () => {
    mockServer();
    renderApp('/signin');
    const form = await screen.findByRole('form', { name: 'Test sign-in' });
    expect(within(form).getByLabelText('Email verified')).toBeChecked();
    expect(screen.queryByRole('button', { name: /Continue with Google/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/signup');
    expect(firebase.loaded).toBe(0);
  });

  it('signs in: session → reconcileUp → owner → auth-changed → next', async () => {
    const server = mockServer();
    seedDirtyProgress();
    const { user } = renderApp('/signin?next=%2Fh%2Fdsa-l1-foundation');
    await submitTestForm(user);
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/h/dsa-l1-foundation'));

    const [session] = server.to('POST /api/auth/session');
    expect(session?.headers.get('X-StudyHubs')).toBe('1');
    expect(session?.credentials).toBe('same-origin');
    const { idToken } = JSON.parse(String(session?.body));
    expect(decodeToken(idToken)).toEqual({ uid: 'alice', email: 'alice@example.com', emailVerified: true });

    const [sync] = server.to('POST /api/sync');
    expect(sync?.headers.get('Content-Encoding')).toBe(typeof CompressionStream === 'function' ? 'gzip' : null);
    expect(Object.keys(JSON.parse(await bodyText(sync!)).hubs)).toEqual(['ai103', 'dsa-l1']);
    expect(readSynced(localStorage, 'dsa-l1')).toMatchObject({ main: T0 + 1, cards: T0 + 2 });
    expect(readOwner(localStorage)).toBe(USER.publicId);
    expect(broadcasts).toEqual([{ name: 'studyhubs', message: { type: 'auth-changed' } }]);
    expect(firebase.loaded).toBe(0);
  });

  it('ignores an unsafe ?next=', async () => {
    mockServer();
    const { user } = renderApp('/signin?next=%2F%2Fevil.example');
    await submitTestForm(user);
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/'));
  });

  it('sends an unverified password account to /verify', async () => {
    const server = mockServer({
      'POST /api/auth/session': json({ code: 'email_unverified', message: 'Verify your email.' }, 403),
    });
    const { user } = renderApp('/signin?next=%2Fh%2Fai-103');
    await submitTestForm(user, { verified: false });
    await waitFor(() => expect(currentLocation()).toBe('/verify?next=%2Fh%2Fai-103'));
    const { idToken } = JSON.parse(String(server.to('POST /api/auth/session')[0]?.body));
    expect(decodeToken(idToken).emailVerified).toBe(false);
    expect(await screen.findByRole('link', { name: 'test sign-in form' })).toHaveAttribute('href', '/signin?next=%2Fh%2Fai-103');
    expect(assign).not.toHaveBeenCalled();
    expect(readOwner(localStorage)).toBeNull();
  });

  it('shows a generic message when the token is refused', async () => {
    mockServer({ 'POST /api/auth/session': json({ code: 'invalid_token', message: 'Unknown user alice' }, 401) });
    const { user } = renderApp('/signin');
    await submitTestForm(user);
    expect(await screen.findByRole('alert')).toHaveTextContent('Sign-in failed. Please try again.');
    expect(screen.getByRole('alert')).not.toHaveTextContent('alice');
    expect(assign).not.toHaveBeenCalled();
  });

  it('asks what to do with another account’s unsynced progress (discard)', async () => {
    const server = mockServer();
    seedDirtyProgress();
    localStorage.setItem('studyhubs.owner', 'pub_bob');
    const { user } = renderApp('/signin');
    await submitTestForm(user);
    const dialog = await screen.findByRole('dialog', { name: 'This browser has progress from another account' });
    expect(dialog).toHaveTextContent('3 changes');
    expect(within(dialog).getByRole('button', { name: 'Download it as a file' })).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: 'Discard and continue' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/'));
    expect(localStorage.getItem('studyhub.dsa-l1.v2')).toBeNull();
    expect(localStorage.getItem('studyhub.codeLang')).toBe('python');
    expect(server.to('POST /api/sync')).toHaveLength(0); // another account's progress is never pushed
    expect(readOwner(localStorage)).toBe(USER.publicId);
  });

  it('cancelling the dialog ends the new session and keeps the progress', async () => {
    const server = mockServer();
    seedDirtyProgress();
    localStorage.setItem('studyhubs.owner', 'pub_bob');
    const { user } = renderApp('/signin');
    await submitTestForm(user);
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel sign-in' }));
    await waitFor(() => expect(server.to('POST /api/auth/logout')).toHaveLength(1));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Test sign-in' })).toBeEnabled();
    expect(localStorage.getItem('studyhub.dsa-l1.v2')).not.toBeNull();
    expect(readOwner(localStorage)).toBe('pub_bob');
    expect(assign).not.toHaveBeenCalled();
  });

  it('tells a signed-in visitor so instead of showing the form', async () => {
    mockServer({ 'GET /api/me': ME_SIGNED_IN });
    setHint(USER.publicId);
    renderApp('/signin?next=%2Fh%2Fai-103');
    expect(await screen.findByRole('heading', { level: 1, name: 'You’re signed in' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Continue' })).toHaveAttribute('href', '/h/ai-103');
  });
});

describe('Firebase mode (SDK mocked)', () => {
  beforeEach(() => {
    firebase.google = async () => 'fb-google-token';
    firebase.password = async () => 'fb-password-token';
    firebase.reset = async () => undefined;
  });

  it('loads the kit lazily and signs in with Google', async () => {
    const server = mockServer({ 'GET /api/config': FIREBASE_CONFIG });
    const signedOutBefore = firebase.signedOut;
    const { user } = renderApp('/signin?next=%2Faccount');
    const google = await screen.findByRole('button', { name: 'Continue with Google' });
    await waitFor(() => expect(google).toBeEnabled());
    expect(firebase.loaded).toBe(1);
    expect(screen.queryByRole('form', { name: 'Test sign-in' })).not.toBeInTheDocument();
    await user.click(google);
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/account'));
    expect(JSON.parse(String(server.to('POST /api/auth/session')[0]?.body))).toEqual({ idToken: 'fb-google-token' });
    expect(firebase.signedOut).toBe(signedOutBefore + 1); // Firebase forgets the user once the session exists
  });

  it.each(['auth/invalid-credential', 'auth/user-not-found', 'auth/wrong-password', 'auth/user-disabled'])(
    'answers %s with the same generic message',
    async (code) => {
      mockServer({ 'GET /api/config': FIREBASE_CONFIG });
      firebase.password = async () => Promise.reject(fbError(code));
      const { user } = renderApp('/signin');
      const form = await screen.findByRole('form', { name: 'Sign in with email' });
      await user.type(within(form).getByLabelText('Email'), 'nobody@example.com');
      await user.type(within(form).getByLabelText('Password'), 'secret123');
      await waitFor(() => expect(within(form).getByRole('button', { name: 'Sign in' })).toBeEnabled());
      await user.click(within(form).getByRole('button', { name: 'Sign in' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('The email or password is incorrect.');
    },
  );

  it('closing the Google popup shows nothing', async () => {
    mockServer({ 'GET /api/config': FIREBASE_CONFIG });
    firebase.google = async () => Promise.reject(fbError('auth/popup-closed-by-user'));
    const { user } = renderApp('/signin');
    const google = await screen.findByRole('button', { name: 'Continue with Google' });
    await waitFor(() => expect(google).toBeEnabled());
    await user.click(google);
    await waitFor(() => expect(google).toBeEnabled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('/reset gives the same answer for unknown addresses, then cools down', async () => {
    mockServer({ 'GET /api/config': FIREBASE_CONFIG });
    firebase.reset = async () => Promise.reject(fbError('auth/user-not-found'));
    const { user } = renderApp('/reset');
    const email = await screen.findByLabelText('Email');
    await user.type(email, 'nobody@example.com');
    const send = screen.getByRole('button', { name: 'Send reset link' });
    await waitFor(() => expect(send).toBeEnabled());
    await user.click(send);
    expect(await screen.findByText(/If an account exists for/)).toHaveTextContent('nobody@example.com');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Send again in \d+ s/ })).toBeDisabled();
  });
});

describe('/signup and /verify in fake mode', () => {
  it('/verify points to the test form', async () => {
    mockServer();
    renderApp('/verify');
    expect(await screen.findByRole('link', { name: 'test sign-in form' })).toHaveAttribute('href', '/signin');
    expect(firebase.loaded).toBeLessThanOrEqual(1); // only the firebase-mode tests above may have loaded it
  });
});
