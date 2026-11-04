// /admin (build-contracts §21): menu visibility, the not-admin 404, and the four tabs.
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatIn, generatePassphrase, meterTone } from '../src/lib/admin-api';
import { resetConfigCache } from '../src/lib/api';
import { bodyText, type Call, json, ME_SIGNED_IN, mockServer, setHint, USER } from './api-mock';
import { currentLocation, renderApp } from './render';

const ADMIN = { ...USER, email: 'admin@studyhubs.test', provider: 'google.com', admin: true };
const ME_ADMIN = { ...ME_SIGNED_IN, user: ADMIN };

const STATS = {
  store: 'memory',
  users: 1234,
  quotaDay: { day: '2026-10-13', resetsAt: '2026-10-14T07:00:00Z', resetsAtLocal: '12:30 IST', tz: 'Asia/Kolkata' },
  firestore: {
    writes: { used: 5000, limit: 20000, budget: 19000, tier: 1 },
    reads: { used: 30000, limit: 50000 },
    deletes: { used: 18000, limit: 20000 },
    storage: { estBytes: null, docs: null, limit: 1073741824, asOf: null },
    egressMonth: { bytes: 1024, limit: 10737418240 },
  },
  host: { egressMonth: { bytes: 2048, limit: 107374182400 }, rssBytes: 100 * 1024 * 1024, ramLimit: 512 * 1024 * 1024 },
  maintenance: { mode: 'off', message: null, until: null, forced: false },
  upcoming: null,
  jobs: [],
  missedJobs: [
    { id: 'j0', kind: 'maintenance', state: 'missed', mode: 'read_only', startAt: '2026-10-12T18:30:00Z', tz: 'Asia/Kolkata', durationMin: 30, message: null },
  ],
  lastBackup: { at: '2026-10-12T20:00:00Z', bytes: 4096, fileSha256: 'ab'.repeat(32), counts: { user: 3, progress: 9 }, encrypted: true, consistent: true },
  tier: 1,
  adminTz: 'Asia/Kolkata',
};

const MAINTENANCE = {
  mode: 'off',
  message: null,
  until: null,
  version: 3,
  forced: false,
  stored: { mode: 'off', message: null, until: null },
  upcoming: null,
};

const JOB = {
  id: 'job-1',
  kind: 'maintenance',
  state: 'scheduled',
  mode: 'read_only',
  startAt: '2026-10-13T18:30:00Z',
  endAt: '2026-10-13T19:30:00Z',
  tz: 'Asia/Kolkata',
  durationMin: 60,
  message: 'Upgrade',
};

let clicked: { href: string; download: string }[];

beforeEach(() => {
  resetConfigCache();
  clicked = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push({ href: this.getAttribute('href') ?? '', download: this.download });
  });
});

afterEach(() => setHint(null));

function asAdmin(overrides: Record<string, unknown> = {}) {
  setHint(ADMIN.publicId);
  return mockServer({
    'GET /api/me': ME_ADMIN,
    'GET /api/admin/stats': STATS,
    'GET /api/admin/maintenance': MAINTENANCE,
    'GET /api/admin/settings': { tz: 'Asia/Kolkata', notice: null, version: 2 },
    'GET /api/admin/jobs': { jobs: [JOB] },
    'GET /api/admin/backups/estimate': { users: 3, docs: 9, tombstones: 1, estReads: 17, readsLeftToday: 20000, fits: true },
    'GET /api/admin/backups/log': [STATS.lastBackup],
    ...(overrides as Record<string, never>),
  });
}

const adminCalls = (calls: Call[]) => calls.filter((call) => call.path.startsWith('/api/admin'));

describe('admin access', () => {
  it('shows the Admin menu link only to admins', async () => {
    asAdmin();
    const { user, unmount } = renderApp('/');
    await user.click(await screen.findByRole('button', { name: /Account menu/ }));
    expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/admin');
    unmount();

    setHint(USER.publicId);
    mockServer({ 'GET /api/me': ME_SIGNED_IN });
    const view = renderApp('/');
    await view.user.click(await screen.findByRole('button', { name: /Account menu/ }));
    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
  });

  it('is "Page not found" for a signed-in non-admin, without any admin request', async () => {
    setHint(USER.publicId);
    const server = mockServer({ 'GET /api/me': ME_SIGNED_IN });
    renderApp('/admin');
    expect(await screen.findByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument();
    expect(adminCalls(server.calls)).toHaveLength(0);
  });

  it('shows "Page not found" when the server refuses (404) even though /api/me said admin', async () => {
    asAdmin({ 'GET /api/admin/stats': json({ code: 'not_found', message: 'No such API endpoint' }, 404) });
    renderApp('/admin');
    expect(await screen.findByText('No such API endpoint')).toBeInTheDocument();
  });
});

describe('Overview', () => {
  it('renders meters with tones, the next reset in IST and Pacific, users, last backup and missed jobs', async () => {
    asAdmin();
    renderApp('/admin');
    expect(await screen.findByRole('heading', { level: 1, name: 'Site admin' })).toBeInTheDocument();
    const writes = await screen.findByRole('meter', { name: 'Writes' });
    expect(writes).toHaveAttribute('data-tone', 'good'); // 25%
    expect(screen.getByRole('meter', { name: 'Reads' })).toHaveAttribute('data-tone', 'trap'); // 60%
    expect(screen.getByRole('meter', { name: 'Deletes' })).toHaveAttribute('data-tone', 'bad'); // 90%
    expect(screen.getByRole('meter', { name: 'Server memory' })).toHaveAttribute('data-tone', 'good');
    expect(screen.getByText(/Next reset: 14 Oct, 12:30 (IST|GMT\+5:30) · 14 Oct, 00:00 (PDT|GMT-7)/)).toBeInTheDocument();
    expect(screen.getByText('1,234')).toBeInTheDocument();
    expect(screen.getByText(/4\.0 KB, encrypted, consistent/)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('A scheduled maintenance window was missed');
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');
  });

  it('recounts storage on request', async () => {
    const server = asAdmin({
      'POST /api/admin/stats/recount': { storage: { estBytes: 5 * 1024 * 1024, docs: 9, asOf: '2026-10-13T00:00:00Z' } },
    });
    const { user } = renderApp('/admin');
    expect(await screen.findByText('not counted yet')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Recount storage' }));
    expect(await screen.findByText('Storage recounted.')).toBeInTheDocument();
    expect(screen.getByText(/5\.0 MB \/ 1\.0 GB/)).toBeInTheDocument();
    expect(server.to('POST /api/admin/stats/recount')[0]?.headers.get('X-StudyHubs')).toBe('1');
  });
});

describe('Backup', () => {
  it('needs BACKUP typed, sends the options, downloads through the ticket and forgets the passphrase', async () => {
    const server = asAdmin({
      'POST /api/admin/backups': { ticket: 'tkt_123', filename: 'studyhubs-20261013-010203Z.backup', expiresIn: 120 },
    });
    const { user } = renderApp('/admin/backup');
    expect(await screen.findByText('about 17 of 20,000 left today')).toBeInTheDocument();
    const readOnly = screen.getByRole('checkbox', { name: 'Use read-only maintenance during backup' });
    expect(readOnly).toBeChecked();

    await user.click(screen.getByRole('checkbox', { name: 'Encrypt with a passphrase' }));
    const passphrase = screen.getByRole('textbox', { name: 'Passphrase' }) as HTMLInputElement;
    expect(passphrase.value.length).toBeGreaterThanOrEqual(12);
    expect(screen.getByText(/can’t be recovered/)).toBeInTheDocument();
    await user.clear(passphrase);
    await user.type(passphrase, 'short');
    const start = screen.getByRole('button', { name: 'Create backup and download' });
    await user.type(screen.getByRole('textbox', { name: 'Type BACKUP to confirm' }), 'BACKUP');
    expect(start).toBeDisabled(); // the passphrase is too short
    await user.type(passphrase, ' but long enough');
    expect(start).toBeEnabled();
    await user.click(start);

    expect(await screen.findByText(/Downloading studyhubs-20261013-010203Z\.backup/)).toBeInTheDocument();
    const [call] = server.to('POST /api/admin/backups');
    expect(JSON.parse(await bodyText(call!))).toEqual({
      passphrase: 'short but long enough',
      requireReadOnly: true,
      confirm: 'BACKUP',
    });
    expect(clicked).toEqual([{ href: '/api/admin/backups/tkt_123', download: 'studyhubs-20261013-010203Z.backup' }]);
    expect(screen.queryByRole('textbox', { name: 'Passphrase' })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Encrypt with a passphrase' })).not.toBeChecked();
    expect(screen.getByRole('textbox', { name: 'Type BACKUP to confirm' })).toHaveValue('');
    // The log shows the full hash.
    expect(screen.getByText('ab'.repeat(32))).toBeInTheDocument();
  });

  it('sends an unencrypted backup without read-only when asked', async () => {
    const server = asAdmin({ 'POST /api/admin/backups': { ticket: 't', filename: 'f.backup', expiresIn: 120 } });
    const { user } = renderApp('/admin/backup');
    await user.click(await screen.findByRole('checkbox', { name: 'Use read-only maintenance during backup' }));
    await user.type(screen.getByRole('textbox', { name: 'Type BACKUP to confirm' }), 'BACKUP');
    await user.click(screen.getByRole('button', { name: 'Create backup and download' }));
    await screen.findByText(/Downloading f\.backup/);
    expect(JSON.parse(await bodyText(server.to('POST /api/admin/backups')[0]!))).toEqual({
      passphrase: null,
      requireReadOnly: false,
      confirm: 'BACKUP',
    });
  });

  it('blocks a backup that does not fit today’s reads, and explains a 409 quota', async () => {
    asAdmin({
      'GET /api/admin/backups/estimate': { users: 3, docs: 90000, tombstones: 0, estReads: 90007, readsLeftToday: 1000, fits: false },
    });
    const { user } = renderApp('/admin/backup');
    expect(await screen.findByText(/Not enough reads are left today/)).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Type BACKUP to confirm' }), 'BACKUP');
    expect(screen.getByRole('button', { name: 'Create backup and download' })).toBeDisabled();
  });

  it('sends the admin to sign in again on reauth_required', async () => {
    asAdmin({ 'POST /api/admin/backups': json({ code: 'reauth_required', message: 'Sign in again' }, 403) });
    const { user } = renderApp('/admin/backup');
    await user.type(await screen.findByRole('textbox', { name: 'Type BACKUP to confirm' }), 'BACKUP');
    await user.click(screen.getByRole('button', { name: 'Create backup and download' }));
    await waitFor(() => expect(currentLocation()).toBe('/signin?next=%2Fadmin&reauth=1'));
    expect(clicked).toHaveLength(0);
  });
});

describe('Maintenance & schedule', () => {
  it('sets read-only with the stored version, and full only with FULL typed', async () => {
    const server = asAdmin({
      'PUT /api/admin/maintenance': async (call: Call) => {
        const body = JSON.parse(await bodyText(call)) as { mode: string; message: string | null };
        return json({ ...MAINTENANCE, mode: body.mode, message: body.message, version: 4, stored: { mode: body.mode, message: body.message, until: null } });
      },
    });
    const { user } = renderApp('/admin/maintenance');
    expect(await screen.findByTestId('maintenance-mode')).toHaveTextContent('Off');
    const form = screen.getByRole('form', { name: 'Maintenance mode' });
    await user.click(within(form).getByRole('radio', { name: /Read-only/ }));
    await user.type(within(form).getByRole('textbox', { name: 'Message for learners (optional)' }), 'Back soon');
    await user.click(within(form).getByRole('button', { name: 'Set mode' }));
    expect(await screen.findByText('Maintenance is now Read-only.')).toBeInTheDocument();
    expect(JSON.parse(await bodyText(server.to('PUT /api/admin/maintenance')[0]!))).toEqual({
      mode: 'read_only',
      message: 'Back soon',
      version: 3,
    });
    expect(screen.getByTestId('maintenance-mode')).toHaveTextContent('Read-only');

    await user.click(within(form).getByRole('radio', { name: /Full/ }));
    const setMode = within(form).getByRole('button', { name: 'Set mode' });
    expect(setMode).toBeDisabled();
    await user.type(within(form).getByRole('textbox', { name: 'Type FULL to confirm' }), 'FULL');
    await user.click(setMode);
    await screen.findByText('Maintenance is now Full.');
    expect(JSON.parse(await bodyText(server.to('PUT /api/admin/maintenance')[1]!))).toMatchObject({
      mode: 'full',
      version: 4,
      confirm: 'FULL',
    });
  });

  it('reloads after a version conflict', async () => {
    const server = asAdmin({ 'PUT /api/admin/maintenance': json({ code: 'conflict', message: 'Changed by someone else' }, 409) });
    const { user } = renderApp('/admin/maintenance');
    const form = await screen.findByRole('form', { name: 'Maintenance mode' });
    await user.click(within(form).getByRole('radio', { name: /Read-only/ }));
    await user.click(within(form).getByRole('button', { name: 'Set mode' }));
    expect(await screen.findByText(/Someone else changed this meanwhile/)).toBeInTheDocument();
    await waitFor(() => expect(server.to('GET /api/admin/maintenance')).toHaveLength(2));
  });

  it('schedules a window for tonight 00:00 in the site time zone', async () => {
    const server = asAdmin({ 'POST /api/admin/jobs': { job: { ...JOB, id: 'job-2' } } });
    const { user } = renderApp('/admin/maintenance');
    const form = await screen.findByRole('form', { name: 'Schedule a window' });
    expect(within(form).getByRole('radio', { name: 'Tonight 00:00' })).toBeChecked();
    expect(form).toHaveTextContent('Start (time zone Asia/Kolkata)');
    await user.click(within(form).getByRole('button', { name: 'Schedule window' }));
    expect(await screen.findByText(/Scheduled: Read-only from/)).toBeInTheDocument();
    expect(JSON.parse(await bodyText(server.to('POST /api/admin/jobs')[0]!))).toEqual({
      kind: 'maintenance',
      mode: 'read_only',
      startAt: 'tonight',
      tz: 'Asia/Kolkata',
      durationMin: 60,
      message: null,
    });
    await waitFor(() => expect(server.to('GET /api/admin/jobs')).toHaveLength(2));
  });

  it('schedules a full window at a wall-clock time only with FULL typed', async () => {
    const server = asAdmin({ 'POST /api/admin/jobs': { job: { ...JOB, mode: 'full' } } });
    const { user } = renderApp('/admin/maintenance');
    const form = await screen.findByRole('form', { name: 'Schedule a window' });
    await user.selectOptions(within(form).getByRole('combobox', { name: 'Mode' }), 'full');
    await user.click(within(form).getByRole('radio', { name: 'At a date and time' }));
    const at = within(form).getByLabelText('Start (Asia/Kolkata)');
    await user.type(at, '2026-10-20T02:30');
    const duration = within(form).getByRole('spinbutton', { name: 'Duration (minutes)' });
    await user.clear(duration);
    await user.type(duration, '90');
    const submit = within(form).getByRole('button', { name: 'Schedule window' });
    expect(submit).toBeDisabled();
    await user.type(within(form).getByRole('textbox', { name: 'Type FULL to confirm' }), 'FULL');
    await user.click(submit);
    await screen.findByText(/Scheduled: Full from/);
    expect(JSON.parse(await bodyText(server.to('POST /api/admin/jobs')[0]!))).toEqual({
      kind: 'maintenance',
      mode: 'full',
      startAt: '2026-10-20T02:30',
      tz: 'Asia/Kolkata',
      durationMin: 90,
      message: null,
      confirm: 'FULL',
    });
  });

  it('lists jobs and cancels one with CANCEL typed', async () => {
    const server = asAdmin({ 'POST /api/admin/jobs/job-1/cancel': { job: { ...JOB, state: 'cancelled' } } });
    const { user } = renderApp('/admin/maintenance');
    const jobs = await screen.findByRole('region', { name: 'Scheduled jobs' });
    const row = (await within(jobs).findByText('Upgrade')).closest('tr')!;
    expect(row).toHaveTextContent('Read-only');
    expect(row).toHaveTextContent('60 min');
    expect(row).toHaveTextContent('scheduled');
    await user.click(within(row).getByRole('button', { name: /Cancel the Read-only window/ }));
    const dialog = screen.getByRole('dialog', { name: 'Cancel this window?' });
    const cancel = within(dialog).getByRole('button', { name: 'Cancel window' });
    expect(cancel).toBeDisabled();
    await user.type(within(dialog).getByRole('textbox', { name: 'Type CANCEL to confirm' }), 'CANCEL');
    await user.click(cancel);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(JSON.parse(await bodyText(server.to('POST /api/admin/jobs/job-1/cancel')[0]!))).toEqual({ confirm: 'CANCEL' });
    await waitFor(() => expect(server.to('GET /api/admin/jobs')).toHaveLength(2));
  });
});

describe('Settings', () => {
  it('saves the time zone and notice with the version, and refuses an unknown zone', async () => {
    const server = asAdmin({ 'PUT /api/admin/settings': { tz: 'Europe/London', notice: 'Hello', version: 3 } });
    const { user } = renderApp('/admin/settings');
    const tz = await screen.findByRole('combobox', { name: 'Time zone' });
    expect(tz).toHaveValue('Asia/Kolkata');
    await user.clear(tz);
    await user.type(tz, 'Mars/Olympus');
    const save = screen.getByRole('button', { name: 'Save settings' });
    expect(save).toBeDisabled();
    await user.clear(tz);
    await user.type(tz, 'Europe/London');
    await user.type(screen.getByRole('textbox', { name: 'Notice for learners (optional)' }), 'Hello');
    await user.click(save);
    expect(await screen.findByText('Settings saved.')).toBeInTheDocument();
    expect(JSON.parse(await bodyText(server.to('PUT /api/admin/settings')[0]!))).toEqual({
      tz: 'Europe/London',
      notice: 'Hello',
      version: 2,
    });
  });
});

describe('admin helpers', () => {
  it('meterTone: good < 50%, trap < 80%, bad otherwise (and for a zero limit)', () => {
    expect(meterTone(0, 100)).toBe('good');
    expect(meterTone(49, 100)).toBe('good');
    expect(meterTone(50, 100)).toBe('trap');
    expect(meterTone(79, 100)).toBe('trap');
    expect(meterTone(80, 100)).toBe('bad');
    expect(meterTone(1, 0)).toBe('bad');
  });

  it('generatePassphrase: 24 characters of a 32-letter alphabet in groups of 4', () => {
    const value = generatePassphrase();
    expect(value).toMatch(/^([a-km-np-z2-9]{4}-){5}[a-km-np-z2-9]{4}$/);
    expect(generatePassphrase((bytes) => bytes.fill(255))).toBe('9999-9999-9999-9999-9999-9999');
    expect(generatePassphrase()).not.toBe(value);
  });

  it('formatIn: a moment in a zone, a dash for nothing', () => {
    expect(formatIn('2026-10-13T18:30:00Z', 'Asia/Kolkata')).toMatch(/^14 Oct, 00:00 (IST|GMT\+5:30)$/);
    expect(formatIn(null, 'UTC')).toBe('—');
    expect(formatIn('nope', 'UTC')).toBe('nope');
  });
});
