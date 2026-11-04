// /account (M2, build-contracts §21): joined date, server progress next to local progress,
// "Download my data", "Delete my account" (typed DELETE, reauth, wipe + logout broadcast),
// and the browser storage panel with "remove local copy" for fully synced hubs.
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readCookie } from '../src/context/me';
import {
  attachmentName,
  formatBytes,
  hubStorageKeys,
  parseMyProgress,
  storageBytes,
} from '../src/lib/account';
import { resetConfigCache } from '../src/lib/api';
import { reauthPath } from '../src/lib/next';
import { bodyText, captureBroadcasts, json, ME_SIGNED_IN, mockServer, setHint, T0, USER, v2Record } from './api-mock';
import { currentLocation, renderApp } from './render';

let broadcasts: ReturnType<typeof captureBroadcasts>;
let saved: { name: string; blob: Blob }[];

beforeEach(() => {
  resetConfigCache();
  broadcasts = captureBroadcasts();
  saved = [];
  // saveBlob: createObjectURL + a click on a temporary <a download>.
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }));
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    saved.push({ name: this.download, blob: new Blob() });
  });
});

afterEach(() => setHint(null));

const PROGRESS = {
  joined: '2026-03-04T05:06:07.000Z',
  hubs: [
    { hub: 'dsa-l2', slug: 'dsa-l2-proficient', title: 'DSA L2 Proficient Hub', parts: { main: { upd: T0, bytes: 120 } }, done: 4 },
    { hub: 'ai103', slug: 'ai-103', title: 'AI-103 Study Hub', parts: { main: { upd: T0, bytes: 90 }, cards: { upd: T0, bytes: 30 } }, done: 2 },
    { hub: 'gone-hub', slug: null, title: null, parts: { main: { upd: T0, bytes: 10 } }, done: 1 },
  ],
};

const signedIn = (overrides = {}) => {
  setHint(USER.publicId);
  return mockServer({ 'GET /api/me': ME_SIGNED_IN, 'GET /api/me/progress': PROGRESS, ...overrides });
};

/** DSA L2: synced and owned (removable). DSA L1: dirty. */
function seedLocal(): void {
  localStorage.setItem('studyhubs.owner', USER.publicId);
  localStorage.setItem('studyhub.dsa-l2.v2', v2Record({ main: T0 }));
  localStorage.setItem('studyhubs.synced.dsa-l2', JSON.stringify({ main: T0 }));
  localStorage.setItem('studyhub.dsa-l1.v2', v2Record({ main: T0 + 1 }));
  localStorage.setItem('studyhub.codeLang', 'python');
}

const region = (name: string) => screen.getByRole('region', { name });

describe('/account profile and progress', () => {
  it('shows the joined date and the server’s progress next to this browser’s', async () => {
    const server = signedIn();
    seedLocal();
    renderApp('/account');
    expect(await screen.findByText('4 Mar 2026')).toBeInTheDocument();
    const progress = region('Your progress');
    const row = (name: string) => within(progress).getByText(name).closest('li')!;
    await within(progress).findByRole('link', { name: 'AI-103 Study Hub' });

    expect(row('DSA L2 Proficient Hub')).toHaveTextContent('Account: 4 done');
    expect(row('DSA L2 Proficient Hub')).toHaveTextContent('This browser: 1 / 12 modules');
    expect(row('DSA L2 Proficient Hub')).toHaveTextContent('Synced');
    expect(row('DSA L1 Foundation Hub')).toHaveTextContent('Account: nothing yet');
    expect(row('DSA L1 Foundation Hub')).toHaveTextContent('Not synced yet');
    expect(row('AI-103 Study Hub')).toHaveTextContent('This browser: nothing');
    expect(row('AI-103 Study Hub')).toHaveTextContent('On your account');
    // A hub the catalog no longer has is listed by id, without a link.
    expect(row('gone-hub')).toHaveTextContent('Account: 1 done');
    expect(within(progress).queryByRole('link', { name: 'gone-hub' })).not.toBeInTheDocument();
    expect(server.to('GET /api/me/progress')).toHaveLength(1);
  });

  it('says so when the server progress cannot be loaded, and retries', async () => {
    let fail = true;
    const server = signedIn({
      'GET /api/me/progress': () => (fail ? json({ code: 'maintenance', message: 'maintenance' }, 503) : json(PROGRESS)),
    });
    const { user } = renderApp('/account');
    expect(await screen.findByText(/Couldn’t load your account’s progress\. Study Hubs is under maintenance/)).toBeInTheDocument();
    fail = false;
    await user.click(within(region('Your progress')).getByRole('button', { name: 'Try again' }));
    expect(await within(region('Your progress')).findByRole('link', { name: 'AI-103 Study Hub' })).toBeInTheDocument();
    expect(server.to('GET /api/me/progress')).toHaveLength(2);
  });

  it('shows an Admin button only to admins', async () => {
    signedIn({ 'GET /api/me': { ...ME_SIGNED_IN, user: { ...USER, admin: true } } });
    renderApp('/account');
    expect(await within(await screen.findByRole('region', { name: 'Profile' })).findByRole('link', { name: 'Admin' })).toHaveAttribute(
      'href',
      '/admin',
    );
  });
});

describe('/account: download my data', () => {
  it('downloads the export under the server’s file name', async () => {
    const server = signedIn({
      'GET /api/me/export': () =>
        new Response('{"exportedAt":"x","user":{},"progress":[]}', {
          headers: { 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="studyhubs-export-20261013.json"' },
        }),
    });
    const { user } = renderApp('/account');
    await user.click(await screen.findByRole('button', { name: 'Download my data' }));
    expect(await screen.findByText('Downloaded studyhubs-export-20261013.json.')).toBeInTheDocument();
    expect(saved.map((s) => s.name)).toEqual(['studyhubs-export-20261013.json']);
    expect(server.to('GET /api/me/export')[0]?.headers.get('X-StudyHubs')).toBe('1');
  });

  it('explains a rate limit', async () => {
    signedIn({ 'GET /api/me/export': json({ code: 'rate_limited', message: 'rate_limited', retryAfter: 600 }, 429) });
    const { user } = renderApp('/account');
    await user.click(await screen.findByRole('button', { name: 'Download my data' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests');
    expect(saved).toHaveLength(0);
  });
});

describe('/account: delete my account', () => {
  it('needs DELETE typed, then deletes, wipes this browser, broadcasts logout and goes home', async () => {
    const server = signedIn({ 'DELETE /api/me': () => new Response(null, { status: 204 }) });
    seedLocal();
    const { user } = renderApp('/account');
    await user.click(await screen.findByRole('button', { name: 'Delete my account' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete your account?' });
    const confirmButton = within(dialog).getByRole('button', { name: 'Delete my account' });
    expect(confirmButton).toBeDisabled();
    await user.type(within(dialog).getByRole('textbox', { name: 'Type DELETE to confirm' }), 'delete');
    expect(confirmButton).toBeDisabled(); // the exact phrase only
    await user.clear(within(dialog).getByRole('textbox', { name: 'Type DELETE to confirm' }));
    await user.type(within(dialog).getByRole('textbox', { name: 'Type DELETE to confirm' }), 'DELETE');
    await user.click(confirmButton);

    await waitFor(() => expect(currentLocation()).toBe('/'));
    const [call] = server.to('DELETE /api/me');
    expect(JSON.parse(await bodyText(call!))).toEqual({ confirm: 'DELETE' });
    expect(call!.headers.get('X-StudyHubs')).toBe('1');
    expect(localStorage.getItem('studyhub.dsa-l1.v2')).toBeNull();
    expect(localStorage.getItem('studyhub.dsa-l2.v2')).toBeNull();
    expect(localStorage.getItem('studyhubs.owner')).toBeNull();
    expect(localStorage.getItem('studyhub.codeLang')).toBe('python');
    expect(broadcasts.map((b) => b.message)).toEqual([{ type: 'logout' }]);
    expect(readCookie(document.cookie, 'sh_hint')).toBeNull();
    expect(within(screen.getByRole('banner')).getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('sends the user to sign in again on reauth_required, keeping everything', async () => {
    signedIn({ 'DELETE /api/me': json({ code: 'reauth_required', message: 'Sign in again' }, 403) });
    seedLocal();
    const { user } = renderApp('/account');
    await user.click(await screen.findByRole('button', { name: 'Delete my account' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete your account?' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Type DELETE to confirm' }), 'DELETE');
    await user.click(within(dialog).getByRole('button', { name: 'Delete my account' }));

    await waitFor(() => expect(currentLocation()).toBe('/signin?next=%2Faccount&reauth=1'));
    // Signed in, yet the sign-in form is there (not "You're signed in").
    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in again' })).toBeInTheDocument();
    expect(await screen.findByRole('form', { name: 'Test sign-in' })).toBeInTheDocument();
    expect(localStorage.getItem('studyhub.dsa-l1.v2')).not.toBeNull();
    expect(broadcasts).toHaveLength(0);
  });

  it('keeps the dialog open with the server’s message on another failure', async () => {
    signedIn({ 'DELETE /api/me': json({ code: 'unavailable', message: 'Deleting the sign-in failed; try again' }, 503) });
    const { user } = renderApp('/account');
    await user.click(await screen.findByRole('button', { name: 'Delete my account' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete your account?' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Type DELETE to confirm' }), 'DELETE');
    await user.click(within(dialog).getByRole('button', { name: 'Delete my account' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Deleting the sign-in failed; try again');
    expect(currentLocation()).toBe('/account');
  });
});

describe('/account: browser storage', () => {
  it('shows bytes per hub and removes the local copy of a fully synced hub only', async () => {
    signedIn();
    seedLocal();
    const { user } = renderApp('/account');
    const storage = await screen.findByRole('region', { name: 'Browser storage' });
    await within(region('Your progress')).findByRole('link', { name: 'AI-103 Study Hub' });
    const row = (name: string) => within(storage).getByText(name).closest('li')!;
    expect(row('DSA L1 Foundation Hub')).toHaveTextContent('Keep: not fully synced');
    expect(within(row('DSA L1 Foundation Hub')).queryByRole('button')).not.toBeInTheDocument();
    expect(row('DSA L2 Proficient Hub')).toHaveTextContent(/\d+(\.\d)? (B|KB)/);

    await user.click(within(storage).getByRole('button', { name: 'Remove local copy of DSA L2 Proficient Hub' }));
    const dialog = screen.getByRole('dialog', { name: 'Remove the local copy of DSA L2 Proficient Hub?' });
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));
    expect(await screen.findByText(/The local copy of DSA L2 Proficient Hub was removed/)).toBeInTheDocument();
    expect(localStorage.getItem('studyhub.dsa-l2.v2')).toBeNull();
    expect(localStorage.getItem('studyhubs.synced.dsa-l2')).toBeNull();
    expect(localStorage.getItem('studyhub.dsa-l1.v2')).not.toBeNull();
    expect(localStorage.getItem('studyhubs.owner')).toBe(USER.publicId);
    expect(within(storage).queryByText('DSA L2 Proficient Hub')).not.toBeInTheDocument();
  });

  it('never offers removal for a hub the server does not hold', async () => {
    signedIn({ 'GET /api/me/progress': { hubs: [], joined: null } });
    seedLocal();
    renderApp('/account');
    const storage = await screen.findByRole('region', { name: 'Browser storage' });
    await within(storage).findByText('DSA L2 Proficient Hub');
    await within(region('Your progress')).findAllByText(/Account: nothing yet/);
    expect(within(storage).queryByRole('button', { name: /Remove local copy/ })).not.toBeInTheDocument();
  });

  it('never offers removal while this browser holds another account’s progress', async () => {
    signedIn();
    seedLocal();
    localStorage.setItem('studyhubs.owner', 'pub_bob');
    renderApp('/account');
    const storage = await screen.findByRole('region', { name: 'Browser storage' });
    await within(region('Your progress')).findByRole('link', { name: 'AI-103 Study Hub' });
    expect(within(storage).getByText('DSA L2 Proficient Hub').closest('li')).toHaveTextContent('Another account’s');
    expect(within(storage).queryByRole('button', { name: /Remove local copy/ })).not.toBeInTheDocument();
  });
});

describe('account helpers', () => {
  it('parses the progress listing defensively', () => {
    expect(parseMyProgress(null)).toEqual({ hubs: [], joined: null });
    const parsed = parseMyProgress({
      joined: 'x',
      hubs: [{ hub: 'a', slug: null, title: 7, parts: { main: { upd: 5, bytes: -1 }, bogus: {} }, done: 'n' }, { nohub: 1 }],
    });
    expect(parsed).toEqual({ joined: 'x', hubs: [{ hub: 'a', slug: null, title: null, parts: { main: { upd: 5, bytes: 0 } }, done: 0 }] });
  });

  it('reads attachment names safely', () => {
    expect(attachmentName('attachment; filename="studyhubs-export-20261013.json"', 'f')).toBe('studyhubs-export-20261013.json');
    expect(attachmentName('attachment; filename="../../evil"', 'f')).toBe('f');
    expect(attachmentName(null, 'f')).toBe('f');
  });

  it('counts UTF-16 bytes of a hub’s keys and formats sizes', () => {
    localStorage.setItem('studyhub.x.v2', 'ab');
    const keys = hubStorageKeys({ id: 'x', engine: 'v2', legacyKeys: [], title: 'X' });
    expect(keys).toEqual(['studyhub.x.v2', 'studyhub.x.mockrun', 'studyhubs.synced.x']);
    expect(storageBytes(localStorage, keys)).toBe(('studyhub.x.v2'.length + 2) * 2);
    expect(hubStorageKeys({ id: 'ai901', engine: 'legacy', legacyKeys: ['ai901hub.v1'], title: 'AI' })).toEqual([
      'ai901hub.v1',
      'studyhubs.legacy.ai901hub.v1.upd',
      'studyhubs.synced.ai901',
    ]);
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB');
  });

  it('builds the reauth path with a safe next', () => {
    expect(reauthPath('/account')).toBe('/signin?next=%2Faccount&reauth=1');
    expect(reauthPath('//evil.example')).toBe('/signin?next=%2F&reauth=1');
  });
});
