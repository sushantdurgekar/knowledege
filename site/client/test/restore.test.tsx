// The admin Restore wizard (build-contracts §25) and its library (§24 client side).
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetConfigCache } from '../src/lib/api';
import {
  confirmPhrase,
  fileKey,
  HeaderError,
  loadSaved,
  parseHeader,
  POLL,
  readHeader,
  receivedBytes,
  saveSaved,
  sha256Hex,
  STORAGE_KEY,
  type Upload,
  uploadMissing,
  type ValidationReport,
} from '../src/lib/restore';
import { bodyText, type Call, json, ME_SIGNED_IN, mockServer, setHint, USER } from './api-mock';
import { renderApp } from './render';

const ADMIN = { ...USER, email: 'admin@studyhubs.test', provider: 'google.com', admin: true };
const ME_ADMIN = { ...ME_SIGNED_IN, user: ADMIN };
const STATS = {
  store: 'postgres',
  users: 12,
  quotaDay: { day: '2026-10-13', resetsAt: '2026-10-14T07:00:00Z', resetsAtLocal: '12:30 IST', tz: 'Asia/Kolkata' },
  maintenance: { mode: 'off', message: null, until: null },
  adminTz: 'Asia/Kolkata',
  jobs: [],
};
const MODIFIED = 1_760_000_000_000;
const HEADER_JSON = {
  format: 'studyhubs-backup',
  v: 1,
  createdAt: '2026-10-12T20:00:00Z',
  app: { version: '1.0.0', commit: 'abc' },
  source: { store: 'memory', project: null, origin: 'http://127.0.0.1:10000' },
  consistent: true,
  compression: 'gzip',
  encryption: null,
  estimated: { user: 3, progress: 9 },
};
const ENCRYPTION = { alg: 'AES-256-GCM-STREAM-1', kdf: 'scrypt', n: 32768, r: 8, p: 1, salt: 'AAAA', noncePrefix: 'AAAA', segment: 1048576 };

/** A `.backup` file: magic, version, flags, header, then `body` bytes. */
function backupBytes(opts: { encrypted?: boolean; body?: number; header?: Record<string, unknown> } = {}): Uint8Array<ArrayBuffer> {
  const header = new TextEncoder().encode(
    JSON.stringify(opts.header ?? { ...HEADER_JSON, encryption: opts.encrypted ? ENCRYPTION : null }),
  );
  const out = new Uint8Array(10 + header.length + (opts.body ?? 150));
  out.set([0x53, 0x48, 0x42, 0x4b, 1, opts.encrypted ? 1 : 0]);
  new DataView(out.buffer).setUint32(6, header.length);
  out.set(header, 10);
  for (let i = 10 + header.length; i < out.length; i++) out[i] = i % 251;
  return out;
}

const backupFile = (bytes = backupBytes(), name = 'site.backup', lastModified = MODIFIED) =>
  new File([bytes], name, { lastModified });

const REPORT = {
  header: { createdAt: '2026-10-12T20:00:00Z', source: { store: 'memory' }, consistent: true, encrypted: false, estimated: { user: 3, progress: 9 } },
  counts: { settings: 1, tombstone: 1, user: 3, progress: 9 },
  records: 14,
  linesSha256: 'aa'.repeat(32),
  fileSha256: 'bb'.repeat(32),
  bytes: 1000,
  target: { store: 'postgres', users: 12, progress: 30 },
  plan: {
    compared: true,
    users: { new: 2, existing: 1 },
    progress: { newer: 6, older: 2, identical: 1 },
    skipped: { tombstonedInBackup: { user: 1, progress: 2 }, tombstonedInTarget: { user: 0, progress: 0 } },
  },
  modes: ['merge', 'replace'],
};

/** A small stand-in for the restore API: chunks of `chunkSize` bytes, sha-checked like the server. */
function restoreServer(file: File, opts: { chunkSize?: number; received?: number[]; validation?: 'validated' | 'invalid'; report?: typeof REPORT } = {}) {
  const chunkSize = opts.chunkSize ?? 64;
  const chunks = Math.ceil(file.size / chunkSize);
  let upload: Upload = {
    uploadId: 'u0123456789abcdef01234567',
    name: file.name,
    size: file.size,
    lastModified: file.lastModified,
    chunkSize,
    chunks,
    state: 'uploading',
    received: [...(opts.received ?? [])],
  };
  const expected = async (n: number) =>
    sha256Hex(new Uint8Array(await file.slice(n * chunkSize, Math.min(file.size, (n + 1) * chunkSize)).arrayBuffer()));
  let job: Record<string, unknown> | null = null;
  let jobPolls = 0;
  const routes = {
    'POST /api/admin/restore/uploads': () => json(upload, 201),
    'GET /api/admin/restore/uploads': () => json({ uploads: opts.received ? [upload] : [] }),
    [`GET /api/admin/restore/uploads/${upload.uploadId}`]: () => {
      if (upload.state === 'validating') {
        upload =
          opts.validation === 'invalid'
            ? { ...upload, state: 'invalid', error: 'wrong passphrase or tampered file' }
            : { ...upload, state: 'validated', report: (opts.report ?? REPORT) as unknown as ValidationReport };
      }
      return json(upload);
    },
    [`POST /api/admin/restore/uploads/${upload.uploadId}/validate`]: () => {
      upload = { ...upload, state: 'validating', error: undefined };
      return json(upload, 202);
    },
    [`DELETE /api/admin/restore/uploads/${upload.uploadId}`]: () => new Response(null, { status: 204 }),
    'POST /api/admin/jobs': async (call: Call) => {
      const body = JSON.parse(await bodyText(call)) as Record<string, unknown>;
      job = { id: 'job-r1', kind: 'restore', state: 'scheduled', uploadId: upload.uploadId, fileName: upload.name, mode: body.mode, runAt: '2026-10-13T10:00:00Z', tz: body.tz, total: 14, progress: { done: 0, total: 14 }, exitMaintenanceOnSuccess: body.exitMaintenanceOnSuccess };
      return json({ job }, 201);
    },
    'GET /api/admin/jobs/job-r1': () => {
      jobPolls++;
      job =
        jobPolls === 1
          ? { ...job, state: 'running', progress: { done: 7, total: 14 } }
          : {
              ...job,
              state: 'succeeded',
              progress: { done: 14, total: 14 },
              report: { mode: 'merge', endCounts: REPORT.counts, written: { user: 2, progress: 6 }, kept: { progress: 3 }, skipped: { user: 1, progress: 2 }, countsOk: true, sample: { checked: 6, mismatched: 0 }, ok: true },
            };
      return json({ job });
    },
  } as Record<string, (call: Call) => Response | Promise<Response>>;
  // Chunk PUTs: any n, checked against the file.
  const chunkRoute = async (call: Call) => {
    const n = Number(call.path.split('/').pop());
    if (call.headers.get('X-Chunk-SHA256') !== (await expected(n))) return json({ code: 'checksum', message: 'mismatch' }, 422);
    if (!upload.received.includes(n)) upload.received = [...upload.received, n].sort((a, b) => a - b);
    upload = { ...upload, state: upload.received.length === chunks ? 'assembled' : 'uploading' };
    return json({ uploadId: upload.uploadId, state: upload.state, received: upload.received });
  };
  for (let n = 0; n < chunks; n++) routes[`PUT /api/admin/restore/uploads/${upload.uploadId}/chunks/${n}`] = chunkRoute;
  return { routes, get upload() { return upload; } };
}

function asAdmin(overrides: Record<string, unknown> = {}) {
  setHint(ADMIN.publicId);
  return mockServer({
    'GET /api/me': ME_ADMIN,
    'GET /api/admin/stats': STATS,
    'GET /api/admin/jobs': { jobs: [] },
    'GET /api/admin/restore/uploads': { uploads: [] },
    ...(overrides as Record<string, never>),
  });
}

const fileInput = () => screen.getByLabelText(/Backup file|again to resume/) as HTMLInputElement;
const SAVED_POLL = { ...POLL };

beforeEach(() => {
  resetConfigCache();
  Object.assign(POLL, { validateMs: 5, jobMs: 5, retryMs: 1 });
});

afterEach(() => {
  Object.assign(POLL, SAVED_POLL);
  setHint(null);
});

describe('restore library', () => {
  it('parseHeader reads the header of a plain and an encrypted backup', () => {
    expect(parseHeader(backupBytes())).toEqual({
      createdAt: '2026-10-12T20:00:00Z',
      source: { store: 'memory', project: null, origin: 'http://127.0.0.1:10000' },
      app: { version: '1.0.0', commit: 'abc' },
      consistent: true,
      encrypted: false,
      estimated: { user: 3, progress: 9 },
    });
    expect(parseHeader(backupBytes({ encrypted: true })).encrypted).toBe(true);
  });

  it('parseHeader refuses what is not an intact v1 header', () => {
    const bad = (bytes: Uint8Array, message: RegExp) => expect(() => parseHeader(bytes)).toThrow(message);
    bad(new TextEncoder().encode('PK\u0003\u0004 not a backup at all'), /not a Study Hubs backup/);
    const v2 = backupBytes();
    v2[4] = 2;
    bad(v2, /Unsupported backup version 2/);
    const flags = backupBytes();
    flags[5] = 4;
    bad(flags, /unknown flags/);
    bad(backupBytes().subarray(0, 40), /truncated/);
    const mismatch = backupBytes();
    mismatch[5] = 1; // flagged encrypted, header says not
    bad(mismatch, /damaged/);
    bad(backupBytes({ header: { ...HEADER_JSON, format: 'other' } }), /not a Study Hubs backup/);
    const huge = new Uint8Array(64 * 1024);
    huge.set([0x53, 0x48, 0x42, 0x4b, 1, 0]);
    new DataView(huge.buffer).setUint32(6, 70_000);
    bad(huge, /too large/);
    expect(() => parseHeader(new Uint8Array(3))).toThrow(HeaderError);
  });

  it('readHeader reads only the first 64 KiB of the file', async () => {
    const big = new File([backupBytes({ body: 300_000 })], 'big.backup');
    expect((await readHeader(big)).estimated).toEqual({ user: 3, progress: 9 });
  });

  it('sha256Hex, receivedBytes, fileKey, confirmPhrase and the saved state', async () => {
    expect(await sha256Hex(new TextEncoder().encode('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(receivedBytes({ received: [0, 2], chunkSize: 4, size: 10 })).toBe(6); // 4 + the 2-byte tail
    expect(fileKey({ name: 'a.backup', size: 5, lastModified: 9 })).toBe('5:9:a.backup');
    expect(confirmPhrase('merge', 12)).toBe('RESTORE');
    expect(confirmPhrase('replace', 12)).toBe('REPLACE 12 USERS');
    saveSaved({ uploadId: 'u1', key: 'k' });
    expect(loadSaved()).toEqual({ uploadId: 'u1', key: 'k' });
    saveSaved({});
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    localStorage.setItem(STORAGE_KEY, '{oops');
    expect(loadSaved()).toEqual({});
  });

  it('uploadMissing sends only the missing chunks with their SHA-256 and retries a 503', async () => {
    const file = backupFile();
    const fake = restoreServer(file, { received: [1] });
    let failures = 1;
    const put0 = fake.routes[`PUT /api/admin/restore/uploads/${fake.upload.uploadId}/chunks/0`]!;
    fake.routes[`PUT /api/admin/restore/uploads/${fake.upload.uploadId}/chunks/0`] = (call) =>
      failures-- > 0 ? json({ code: 'unavailable', message: 'busy' }, 503) : put0(call);
    const server = mockServer(fake.routes);
    const seen: number[][] = [];
    const out = await uploadMissing(file, fake.upload, { onProgress: (u) => seen.push(u.received) });
    expect(out.state).toBe('assembled');
    const puts = server.calls.filter((c) => c.method === 'PUT').map((c) => Number(c.path.split('/').pop()));
    const chunks = fake.upload.chunks;
    const rest = Array.from({ length: chunks - 2 }, (_, i) => i + 2);
    expect(puts).toEqual([0, 0, ...rest]); // chunk 1 was already there; chunk 0 was retried once
    const last = server.calls.at(-1)!;
    expect(last.headers.get('Content-Type')).toBe('application/octet-stream');
    expect((last.body as Uint8Array).length).toBe(file.size - (chunks - 1) * 64);
    expect(seen.at(-1)).toEqual([0, 1, ...rest]);
  });

  it('uploadMissing stops at a refusal that a retry cannot fix, and on abort', async () => {
    const file = backupFile();
    const fake = restoreServer(file);
    fake.routes[`PUT /api/admin/restore/uploads/${fake.upload.uploadId}/chunks/0`] = () => json({ code: 'busy', message: 'A restore job uses this upload' }, 409);
    const server = mockServer(fake.routes);
    await expect(uploadMissing(file, fake.upload)).rejects.toMatchObject({ status: 409, code: 'busy' });
    expect(server.calls).toHaveLength(1);
    const controller = new AbortController();
    controller.abort();
    await expect(uploadMissing(file, fake.upload, { signal: controller.signal })).rejects.toThrow();
    expect(server.calls).toHaveLength(1);
  });
});

describe('Restore wizard', () => {
  it('picks, uploads, validates, merges now after RESTORE is typed, and watches the job succeed', async () => {
    const file = backupFile();
    const fake = restoreServer(file);
    const server = asAdmin(fake.routes);
    const { user } = renderApp('/admin/restore');
    expect(await screen.findByRole('link', { name: 'Restore' })).toHaveAttribute('aria-current', 'page');
    await user.upload(await waitFor(fileInput), file);
    const header = await screen.findByLabelText('Backup header');
    expect(header).toHaveTextContent('memory · http://127.0.0.1:10000');
    expect(header).toHaveTextContent('no');
    expect(header).toHaveTextContent('3 users, 9 progress documents');

    await user.click(screen.getByRole('button', { name: 'Upload site.backup' }));
    expect(await screen.findByRole('form', { name: 'Validate' })).toBeInTheDocument();
    expect(server.to('POST /api/admin/restore/uploads')).toHaveLength(1);
    expect(JSON.parse(await bodyText(server.to('POST /api/admin/restore/uploads')[0]!))).toEqual({
      name: 'site.backup',
      size: file.size,
      lastModified: MODIFIED,
    });
    expect(server.calls.filter((c) => c.method === 'PUT')).toHaveLength(fake.upload.chunks);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toMatchObject({ key: fileKey(file), uploadId: fake.upload.uploadId });
    // Not encrypted: no passphrase field.
    expect(screen.queryByLabelText(/Passphrase/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Validate' }));
    const plan = await screen.findByRole('table', { name: 'Plan' });
    expect(JSON.parse(await bodyText(server.to(`POST /api/admin/restore/uploads/${fake.upload.uploadId}/validate`)[0]!))).toEqual({});
    expect(plan).toHaveTextContent('2 new, 1 already here');
    expect(plan).toHaveTextContent('6 newer in the backup (written), 2 older');
    expect(plan).toHaveTextContent('1 users, 2 progress parts');
    expect(screen.getByLabelText('Validation report')).toHaveTextContent('postgres: 12 users, 30 progress documents');

    const form = screen.getByRole('form', { name: 'Choose and confirm' });
    expect(within(form).getByRole('radio', { name: /Merge/ })).toBeChecked();
    expect(within(form).getByRole('radio', { name: /Now/ })).toBeChecked();
    expect(within(form).queryByRole('radio', { name: /quota reset/ })).not.toBeInTheDocument(); // Firestore only
    expect(within(form).getByRole('checkbox', { name: /Leave maintenance/ })).toBeChecked();
    const start = within(form).getByRole('button', { name: 'Start restore' });
    expect(start).toBeDisabled();
    await user.type(within(form).getByRole('textbox', { name: 'Type RESTORE to confirm' }), 'RESTORE');
    await user.click(start);

    expect(await screen.findByText(/Restored and verified/)).toBeInTheDocument();
    expect(JSON.parse(await bodyText(server.to('POST /api/admin/jobs')[0]!))).toEqual({
      kind: 'restore',
      uploadId: fake.upload.uploadId,
      mode: 'merge',
      runAt: 'now',
      tz: 'Asia/Kolkata',
      exitMaintenanceOnSuccess: true,
      confirm: 'RESTORE',
    });
    expect(screen.getByRole('progressbar', { name: 'Records applied' })).toHaveAttribute('aria-valuenow', '14');
    expect(screen.getByLabelText('Job report')).toHaveTextContent('2 users, 6 progress parts');
    expect(screen.getByLabelText('Job report')).toHaveTextContent('counts match; 6 sampled parts, 0 mismatched');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toMatchObject({ jobId: 'job-r1' });
    expect(screen.queryByRole('button', { name: 'Cancel restore' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start a new restore' })).toBeInTheDocument();
  });

  it('asks for the passphrase of an encrypted backup, shows an invalid result, and forgets the passphrase', async () => {
    const file = backupFile(backupBytes({ encrypted: true }));
    const fake = restoreServer(file, { validation: 'invalid' });
    const server = asAdmin(fake.routes);
    const { user } = renderApp('/admin/restore');
    await user.upload(await waitFor(fileInput), file);
    expect(await screen.findByLabelText('Backup header')).toHaveTextContent('yes (passphrase needed)');
    await user.click(screen.getByRole('button', { name: 'Upload site.backup' }));
    const validate = await screen.findByRole('button', { name: 'Validate' });
    expect(validate).toBeDisabled();
    await user.type(screen.getByLabelText('Passphrase'), 'correct horse battery');
    await user.click(validate);
    expect(await screen.findByRole('alert')).toHaveTextContent('The backup is not valid: wrong passphrase or tampered file');
    expect(JSON.parse(await bodyText(server.to(`POST /api/admin/restore/uploads/${fake.upload.uploadId}/validate`)[0]!))).toEqual({
      passphrase: 'correct horse battery',
    });
    expect(screen.getByLabelText('Passphrase')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Validate again' })).toBeDisabled();
    expect(localStorage.getItem(STORAGE_KEY)).not.toContain('correct horse');
  });

  it('resumes an upload after a reload when the same file is picked again', async () => {
    const file = backupFile();
    const fake = restoreServer(file, { received: [0, 1] });
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ key: fileKey(file), uploadId: fake.upload.uploadId }));
    const server = asAdmin(fake.routes);
    const { user } = renderApp('/admin/restore');
    const bar = await screen.findByRole('progressbar', { name: 'Uploading site.backup' });
    expect(bar).toHaveAttribute('aria-valuenow', '128');
    // Another file is refused before anything is sent.
    await user.upload(fileInput(), backupFile(backupBytes(), 'other.backup'));
    expect(await screen.findByRole('alert')).toHaveTextContent('That isn’t site.backup');
    await user.upload(fileInput(), file);
    await user.click(await screen.findByRole('button', { name: 'Resume upload' }));
    expect(await screen.findByRole('form', { name: 'Validate' })).toBeInTheDocument();
    expect(server.to('POST /api/admin/restore/uploads')).toHaveLength(0);
    const puts = server.calls.filter((c) => c.method === 'PUT').map((c) => Number(c.path.split('/').pop()));
    expect(puts).toEqual(Array.from({ length: fake.upload.chunks - 2 }, (_, i) => i + 2));
  });

  it('discards an upload', async () => {
    const file = backupFile();
    const fake = restoreServer(file, { received: [0] });
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ key: fileKey(file), uploadId: fake.upload.uploadId }));
    const server = asAdmin(fake.routes);
    const { user } = renderApp('/admin/restore');
    await user.click(await screen.findByRole('button', { name: 'Discard upload' }));
    expect(await screen.findByLabelText('Backup file (.backup)')).toBeInTheDocument();
    expect(server.to(`DELETE /api/admin/restore/uploads/${fake.upload.uploadId}`)).toHaveLength(1);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('offers replace with the target user count as the phrase, and tonight in ADMIN_TZ', async () => {
    const file = backupFile();
    const fake = restoreServer(file, { received: [0, 1, 2, 3] });
    const validated = { ...fake.upload, state: 'validated', report: REPORT };
    const server = asAdmin({ ...fake.routes, 'GET /api/admin/restore/uploads': { uploads: [validated] } });
    const { user } = renderApp('/admin/restore');
    const form = await screen.findByRole('form', { name: 'Choose and confirm' });
    await user.click(within(form).getByRole('radio', { name: /Replace/ }));
    await user.click(within(form).getByRole('radio', { name: /Tonight 00:00/ }));
    await user.click(within(form).getByRole('checkbox', { name: /Leave maintenance/ }));
    expect(within(form).getByRole('alert')).toHaveTextContent('Replace deletes the 12 users');
    await user.type(within(form).getByRole('textbox', { name: 'Type REPLACE 12 USERS to confirm' }), 'REPLACE 12 USERS');
    await user.click(within(form).getByRole('button', { name: 'Start restore' }));
    await screen.findByRole('group', { name: 'Restore job' });
    expect(JSON.parse(await bodyText(server.to('POST /api/admin/jobs')[0]!))).toMatchObject({
      mode: 'replace',
      runAt: 'tonight',
      tz: 'Asia/Kolkata',
      exitMaintenanceOnSuccess: false,
      confirm: 'REPLACE 12 USERS',
    });
  });

  it('on Firestore: merge only, with the quota-reset time and the write estimate', async () => {
    const file = backupFile();
    const fake = restoreServer(file);
    const report = {
      ...REPORT,
      target: { store: 'firestore', users: 4, progress: 8 },
      plan: { ...REPORT.plan, estWrites: 45_000, daysNeeded: 3, fitsToday: false },
      modes: ['merge'],
    };
    asAdmin({
      ...fake.routes,
      'GET /api/admin/stats': { ...STATS, store: 'firestore' },
      'GET /api/admin/restore/uploads': { uploads: [{ ...fake.upload, state: 'validated', report }] },
    });
    const { user } = renderApp('/admin/restore');
    const form = await screen.findByRole('form', { name: 'Choose and confirm' });
    expect(within(form).queryByRole('radio', { name: /Replace/ })).not.toBeInTheDocument();
    const reset = within(form).getByRole('radio', { name: /After the next Firestore quota reset/ });
    expect(reset.closest('.checkbox')).toHaveTextContent(/14 Oct, 00:05/);
    await user.click(reset);
    expect(screen.getByRole('table', { name: 'Plan' })).toHaveTextContent('about 45,000 (3 days of quota)');
  });

  it('shows a scheduled job after a reload and cancels it with CANCEL typed', async () => {
    const job = { id: 'job-r1', kind: 'restore', state: 'scheduled', uploadId: 'u1', fileName: 'site.backup', mode: 'merge', runAt: '2026-10-13T18:30:00Z', tz: 'Asia/Kolkata', total: 14, progress: { done: 0, total: 14 } };
    const server = asAdmin({
      'GET /api/admin/jobs': { jobs: [job] },
      'GET /api/admin/jobs/job-r1': { job },
      'POST /api/admin/jobs/job-r1/cancel': { job: { ...job, state: 'cancelled' } },
    });
    const { user } = renderApp('/admin/restore');
    const group = await screen.findByRole('group', { name: 'Restore job' });
    expect(group).toHaveTextContent('Merge from site.backup, starts 14 Oct, 00:00');
    await user.click(within(group).getByRole('button', { name: 'Cancel restore' }));
    const dialog = screen.getByRole('dialog', { name: 'Cancel this restore?' });
    await user.type(within(dialog).getByRole('textbox', { name: 'Type CANCEL to confirm' }), 'CANCEL');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel restore' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(JSON.parse(await bodyText(server.to('POST /api/admin/jobs/job-r1/cancel')[0]!))).toEqual({ confirm: 'CANCEL' });
    expect(within(group).getByText('cancelled')).toBeInTheDocument();
  });

  it('explains a job that needs attention', async () => {
    const job = { id: 'job-r2', kind: 'restore', state: 'needs_attention', uploadId: 'u1', fileName: 'site.backup', mode: 'merge', runAt: '2026-10-13T08:30:00Z', tz: 'Asia/Kolkata', progress: { done: 5, total: 14 }, error: 'verification failed: see the report' };
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ jobId: 'job-r2' }));
    asAdmin({ 'GET /api/admin/jobs': { jobs: [job] } });
    renderApp('/admin/restore');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The restore needs attention: verification failed: see the report. The site stays in full maintenance',
    );
  });

  it('sends the admin to sign in again on reauth_required', async () => {
    const file = backupFile();
    const fake = restoreServer(file, { received: [0, 1, 2, 3] });
    asAdmin({
      ...fake.routes,
      'GET /api/admin/restore/uploads': { uploads: [{ ...fake.upload, state: 'validated', report: REPORT }] },
      'POST /api/admin/jobs': json({ code: 'reauth_required', message: 'Sign in again' }, 403),
    });
    const { user } = renderApp('/admin/restore');
    const form = await screen.findByRole('form', { name: 'Choose and confirm' });
    await user.type(within(form).getByRole('textbox', { name: 'Type RESTORE to confirm' }), 'RESTORE');
    await user.click(within(form).getByRole('button', { name: 'Start restore' }));
    await waitFor(() => expect(screen.getByTestId('location').textContent).toMatch(/^\/signin\?next=%2Fadmin/));
  });
});

describe('restore jobs elsewhere in /admin', () => {
  it('Overview shows a banner for a restore that needs attention', async () => {
    asAdmin({
      'GET /api/admin/stats': {
        ...STATS,
        firestore: {
          writes: { used: 0, limit: 20000, budget: 19000, tier: 1 },
          reads: { used: 0, limit: 50000 },
          deletes: { used: 0, limit: 20000 },
          storage: { estBytes: null, docs: null, limit: 1, asOf: null },
          egressMonth: { bytes: 0, limit: 1 },
        },
        host: { egressMonth: { bytes: 0, limit: 1 }, rssBytes: null, ramLimit: 1 },
        upcoming: null,
        lastBackup: null,
        tier: 1,
        maintenance: { mode: 'full', message: null, until: null },
        attentionJobs: [{ id: 'job-r2', kind: 'restore', state: 'needs_attention', mode: 'merge', runAt: '2026-10-13T08:30:00Z', tz: 'Asia/Kolkata', fileName: 'site.backup', error: 'verification failed' }],
      },
    });
    renderApp('/admin');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('A restore needs attention: site.backup: verification failed');
    expect(within(alert).getByRole('link', { name: 'Open Restore' })).toHaveAttribute('href', '/admin/restore');
  });

  it('the jobs list labels restore jobs and offers no cancel once one runs', async () => {
    const running = { id: 'job-r3', kind: 'restore', state: 'running', mode: 'merge', runAt: '2026-10-13T08:30:00Z', tz: 'Asia/Kolkata', fileName: 'site.backup' };
    asAdmin({
      'GET /api/admin/maintenance': { mode: 'full', message: null, until: null, version: 1, forced: false, stored: { mode: 'full', message: null, until: null }, upcoming: null },
      'GET /api/admin/settings': { tz: 'Asia/Kolkata', notice: null, version: 1 },
      'GET /api/admin/jobs': { jobs: [running] },
    });
    renderApp('/admin/maintenance');
    const jobs = await screen.findByRole('region', { name: 'Scheduled jobs' });
    const row = (await within(jobs).findByText('site.backup')).closest('tr')!;
    expect(row).toHaveTextContent('Restore (merge)');
    expect(row).toHaveTextContent('13 Oct, 14:00');
    expect(row).toHaveTextContent('—');
    expect(within(row).queryByRole('button')).not.toBeInTheDocument();
  });
});
