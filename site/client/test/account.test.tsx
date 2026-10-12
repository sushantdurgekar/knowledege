// MeProvider + header menu, /signout (flush, push, dirty choices, logout, wipe) and /account.
import { readOwner } from '@bridge-shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMe, MeProvider, readCookie } from '../src/context/me';
import { resetConfigCache } from '../src/lib/api';
import { pageNavigation } from '../src/lib/navigation';
import {
  captureBroadcasts,
  type Call,
  json,
  ME_SIGNED_IN,
  mockServer,
  seedDirtyProgress,
  setHint,
  syncHandler,
  T0,
  USER,
  v2Record,
} from './api-mock';
import { currentLocation, renderApp } from './render';

let broadcasts: ReturnType<typeof captureBroadcasts>;

beforeEach(() => {
  resetConfigCache();
  vi.spyOn(pageNavigation, 'assign').mockImplementation(() => undefined);
  broadcasts = captureBroadcasts();
});

afterEach(() => setHint(null));

const signedIn = (overrides = {}) => {
  setHint(USER.publicId);
  return mockServer({ 'GET /api/me': ME_SIGNED_IN, ...overrides });
};

const banner = () => screen.getByRole('banner');

describe('MeProvider', () => {
  function Probe() {
    const { me } = useMe();
    return <p data-testid="me">{me.status === 'signed-in' ? `in:${me.user.email}` : me.status}</p>;
  }

  it('is anonymous without the sh_hint cookie and asks nothing', () => {
    const server = mockServer();
    render(
      <MeProvider>
        <Probe />
      </MeProvider>,
    );
    expect(screen.getByTestId('me')).toHaveTextContent('anonymous');
    expect(server.to('GET /api/me')).toHaveLength(0);
  });

  it('asks /api/me when the hint is there', async () => {
    const server = signedIn();
    render(
      <MeProvider>
        <Probe />
      </MeProvider>,
    );
    expect(screen.getByTestId('me')).toHaveTextContent('loading');
    expect(await screen.findByText(`in:${USER.email}`)).toBeInTheDocument();
    expect(server.to('GET /api/me')[0]?.headers.get('X-StudyHubs')).toBe('1');
  });

  it('clears a stale hint when the server says nobody is signed in', async () => {
    setHint('pub_stale');
    mockServer({ 'GET /api/me': { signedIn: false } });
    render(
      <MeProvider>
        <Probe />
      </MeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('me')).toHaveTextContent('anonymous'));
    expect(readCookie(document.cookie, 'sh_hint')).toBeNull();
  });

  it('reports an error state when /api/me fails', async () => {
    setHint(USER.publicId);
    mockServer({ 'GET /api/me': json({ code: 'unavailable', message: 'x' }, 503) });
    render(
      <MeProvider>
        <Probe />
      </MeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('me')).toHaveTextContent('error'));
  });
});

describe('header account menu', () => {
  it('shows "Sign in" to anonymous visitors', () => {
    mockServer();
    renderApp('/privacy');
    expect(within(banner()).getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/signin');
  });

  it('shows the user’s initial with an Account / Sign out menu', async () => {
    signedIn();
    const { user } = renderApp('/privacy');
    const button = await within(banner()).findByRole('button', { name: `Account menu, signed in as ${USER.name}` });
    expect(button).toHaveTextContent('A');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(within(banner()).queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toHaveTextContent('Progress syncs to your account.');

    await user.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(within(banner()).getByRole('link', { name: 'Account' })).toHaveAttribute('href', '/account');
    expect(within(banner()).getByRole('link', { name: 'Sign out' })).toHaveAttribute('href', '/signout');
    expect(banner()).toHaveTextContent(USER.name);

    await user.keyboard('{Escape}');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveFocus();

    await user.click(button);
    await user.click(screen.getByRole('main'));
    expect(button).toHaveAttribute('aria-expanded', 'false');

    await user.click(button);
    await user.click(within(banner()).getByRole('link', { name: 'Account' }));
    expect(currentLocation()).toBe('/account');
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('/signout', () => {
  const SLOW = { timeout: 4000 };

  it('pushes, ends the session, wipes all but codeLang and ui keys, broadcasts logout, goes home', async () => {
    const server = signedIn();
    seedDirtyProgress();
    localStorage.setItem('studyhubs.owner', USER.publicId);
    renderApp('/signout');
    await waitFor(() => expect(currentLocation()).toBe('/'), SLOW);
    expect(server.to('POST /api/sync')).toHaveLength(1);
    expect(server.to('POST /api/auth/logout')).toHaveLength(1);
    expect(server.to('POST /api/auth/logout')[0]?.headers.get('X-StudyHubs')).toBe('1');
    expect(Object.keys({ ...localStorage }).sort()).toEqual(['studyhub.codeLang', 'studyhubs.ui.nudge.dsa-l1']);
    expect(broadcasts.map((b) => b.message)).toEqual([{ type: 'flush' }, { type: 'logout' }]);
    expect(within(banner()).getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('offers Try again / Download / Sign out anyway when progress could not be saved', async () => {
    const server = signedIn({ 'POST /api/sync': json({ code: 'unavailable', message: 'x' }, 503) });
    seedDirtyProgress();
    const { user } = renderApp('/signout');
    const alert = await screen.findByRole('alert', {}, SLOW);
    expect(alert).toHaveTextContent('Some progress isn’t saved to your account');
    expect(alert).toHaveTextContent('3 changes');
    expect(server.to('POST /api/auth/logout')).toHaveLength(0);
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(within(alert).getByRole('button', { name: 'Download unsynced progress (.json)' })).toBeInTheDocument();

    await user.click(within(alert).getByRole('button', { name: 'Sign out anyway' }));
    await waitFor(() => expect(currentLocation()).toBe('/'));
    expect(server.to('POST /api/auth/logout')).toHaveLength(1);
    expect(localStorage.getItem('studyhub.dsa-l1.v2')).toBeNull();
    expect(localStorage.getItem('studyhub.codeLang')).toBe('python');
  });

  it('Try again pushes again and signs out once everything is saved', async () => {
    let n = 0;
    const accept = syncHandler();
    const server = signedIn({
      'POST /api/sync': (call: Call) => (++n === 1 ? json({ code: 'sync_paused', message: 'x' }, 429) : accept(call)),
    });
    seedDirtyProgress();
    const { user } = renderApp('/signout');
    const alert = await screen.findByRole('alert', {}, SLOW);
    expect(alert).toHaveTextContent('Syncing is paused');
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(currentLocation()).toBe('/'), SLOW);
    expect(server.to('POST /api/sync')).toHaveLength(2);
  });

  it('keeps everything when the server cannot end the session', async () => {
    signedIn({ 'POST /api/auth/logout': () => Promise.reject(new TypeError('Failed to fetch')) });
    localStorage.setItem('studyhub.dsa-l1.v2', v2Record({ main: T0 }));
    localStorage.setItem('studyhubs.synced.dsa-l1', JSON.stringify({ main: T0 }));
    renderApp('/signout');
    expect(await screen.findByRole('alert', {}, SLOW)).toHaveTextContent('Couldn’t sign out');
    expect(localStorage.getItem('studyhub.dsa-l1.v2')).not.toBeNull();
    expect(broadcasts.map((b) => b.message)).toEqual([{ type: 'flush' }]);
  });

  it('says so when nobody is signed in', async () => {
    const server = mockServer();
    renderApp('/signout');
    expect(await screen.findByRole('heading', { level: 1, name: 'You’re signed out' })).toBeInTheDocument();
    expect(server.to('POST /api/auth/logout')).toHaveLength(0);
  });
});

describe('/account', () => {
  it('asks anonymous visitors to sign in', async () => {
    mockServer();
    renderApp('/account');
    expect(await screen.findByRole('heading', { level: 1, name: 'You’re not signed in' })).toBeInTheDocument();
    expect(within(screen.getByRole('main')).getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/signin?next=%2Faccount');
  });

  it('shows the profile and per-hub sync state, and syncs on demand', async () => {
    const server = signedIn();
    seedDirtyProgress();
    localStorage.setItem('studyhub.dsa-l2.v2', v2Record({ main: T0 }));
    localStorage.setItem('studyhubs.synced.dsa-l2', JSON.stringify({ main: T0 }));
    localStorage.setItem('studyhubs.owner', USER.publicId);
    const { user } = renderApp('/account');
    expect(await screen.findByRole('heading', { level: 2, name: 'Profile' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Your account' })).toBeInTheDocument();
    expect(within(screen.getByRole('main')).getByText(USER.email)).toBeInTheDocument();
    expect(screen.getByText('Email and password')).toBeInTheDocument();
    expect(screen.getByRole('main')).not.toHaveTextContent(USER.publicId);

    const local = screen.getByRole('region', { name: 'Progress in this browser' });
    await within(local).findByRole('link', { name: 'DSA L1 Foundation Hub' });
    const row = (title: string) => within(local).getByRole('link', { name: title }).closest('li')!;
    expect(row('DSA L1 Foundation Hub')).toHaveTextContent('Not synced yet');
    expect(row('DSA L2 Proficient Hub')).toHaveTextContent('Synced');

    await user.click(screen.getByRole('button', { name: 'Sync now' }));
    expect(await screen.findByText('Everything in this browser is saved to your account.')).toBeInTheDocument();
    expect(server.to('POST /api/sync')).toHaveLength(1);
    expect(row('DSA L1 Foundation Hub')).toHaveTextContent('Synced');
    expect(screen.getByRole('button', { name: 'Export my data' })).toBeDisabled();
  });

  it('resolves an account mismatch by discarding this browser’s progress after confirming', async () => {
    const server = signedIn();
    seedDirtyProgress();
    localStorage.setItem('studyhubs.owner', 'pub_bob');
    const { user } = renderApp('/account');
    const panel = (await screen.findByRole('heading', { name: 'This browser has progress from another account' })).closest('section')!;
    expect(screen.queryByRole('button', { name: 'Sync now' })).not.toBeInTheDocument();
    await user.click(within(panel).getByRole('button', { name: 'Discard this browser’s progress' }));
    const dialog = screen.getByRole('dialog', { name: 'Discard this browser’s progress?' });
    await user.click(within(dialog).getByRole('button', { name: 'Discard' }));
    expect(await screen.findByText(/This browser’s progress was removed/)).toBeInTheDocument();
    expect(localStorage.getItem('studyhub.dsa-l1.v2')).toBeNull();
    expect(localStorage.getItem('studyhub.codeLang')).toBe('python');
    expect(readOwner(localStorage)).toBeNull();
    expect(server.to('POST /api/sync')).toHaveLength(0);
    expect(broadcasts.map((b) => b.message)).toEqual([{ type: 'auth-changed' }]);
    expect(screen.queryByRole('heading', { name: 'This browser has progress from another account' })).not.toBeInTheDocument();
  });
});
