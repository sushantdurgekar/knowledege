/**
 * M2 admin scenarios (build-contracts.md sections 17, 19, 21, 22), in the serial project:
 *   - the admin overview renders for an admin (a Google account in ADMIN_EMAILS) and every
 *     /api/admin route 404s for anyone else
 *   - read_only maintenance: the hub shows "Sync paused" and saves locally; off: it drains
 *   - full maintenance: an open hub pauses, a reload runs locally, off syncs every change
 *   - a scheduled window with a near startAt fires and ends (test clock + scheduler tick)
 *   - a backup downloaded through the ticket passes `backup_tool.py verify` (plain and encrypted)
 */
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { openQuizModule, settle } from './support/hub';
import { ADMIN, ADMIN_TZ, GOOGLE, saveDownload, signInAdmin, signInAs, tick, verifyBackup, wallClock } from './support/m2';
import {
  API_HEADERS,
  PILL,
  V2_HUB,
  answerNext,
  chromeText,
  expectSignedInHub,
  flushNow,
  localStamps,
  notices,
  pill,
  resetServer,
  setServerClock,
  signIn,
  storedUpd,
  userA,
} from './support/sync';

const hub = V2_HUB;

test.beforeEach(async ({ request }) => {
  await resetServer(request);
});

test.afterEach(async ({ request }) => {
  await setServerClock(request, 0);
});

/** A learner on the hub, signed in, with one answer synced; returns the server's main stamp. */
async function learnerSynced(page: Page): Promise<number> {
  await signIn(page.context(), userA);
  await openQuizModule(page, hub);
  await expectSignedInHub(page);
  await answerNext(page, hub);
  await flushNow(page);
  await expect(pill(page)).toHaveText(PILL.cloud);
  return (await localStamps(page, hub)).main;
}

test('admin overview renders for an admin and /api/admin 404s for everyone else', async ({ browser, page, request }) => {
  // Through the client's test sign-in form, as a Google account (only those can be admins).
  await page.goto('/signin?next=/admin');
  const form = page.locator('form.form--test');
  await form.getByRole('textbox', { name: 'User id' }).fill(ADMIN.uid);
  await form.getByRole('textbox', { name: 'Email' }).fill(ADMIN.email);
  await form.getByRole('combobox', { name: 'Sign-in method' }).selectOption('google.com');
  await form.getByRole('button', { name: 'Test sign-in' }).click();
  await page.waitForURL((url) => url.pathname === '/admin');

  await expect(page.getByRole('heading', { level: 1, name: 'Site admin' })).toBeVisible();
  await expect(page.getByRole('meter', { name: 'Writes' })).toHaveAttribute('data-tone', 'good');
  await expect(page.getByRole('meter', { name: 'Reads' })).toBeVisible();
  await expect(page.getByText(/Next reset: .+ · .+/)).toContainText(/IST|GMT\+5:30/);
  await expect(page.getByText(/Next reset: .+ · .+/)).toContainText(/PDT|PST|GMT-[78]/);
  const site = page.getByRole('region', { name: 'Site', exact: true });
  await expect(site).toContainText('Users');
  await expect(site).toContainText('none yet'); // no backup yet
  await page.getByRole('button', { name: /Account menu/ }).click();
  await expect(page.getByRole('link', { name: 'Admin', exact: true })).toHaveAttribute('href', '/admin');
  expect((await page.request.get('/api/admin/stats')).status()).toBe(200);

  const unknown = await (await request.get('/api/no-such-endpoint')).json();
  // Anonymous.
  const anon = await request.get('/api/admin/stats');
  expect(anon.status()).toBe(404);
  expect(await anon.json()).toEqual(unknown);

  // A learner (password account) and the admin's email signed in with a password: not admins.
  for (const [user, extra] of [
    [userA, {}],
    [ADMIN, {}],
    [{ uid: 'e2e-other-google', email: 'someone@studyhubs.test' }, GOOGLE],
  ] as const) {
    const context = await browser.newContext();
    await signInAs(context, user, extra);
    const other = await context.newPage();
    await other.goto('/admin');
    await expect(other.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
    for (const route of ['/api/admin/stats', '/api/admin/maintenance', '/api/admin/backups/log']) {
      const r = await context.request.get(route);
      expect(r.status(), `${user.email} ${JSON.stringify(extra)} GET ${route}`).toBe(404);
      expect(await r.json()).toEqual(unknown);
    }
    const me = (await (await context.request.get('/api/me')).json()) as { user: { admin: boolean } };
    expect(me.user.admin).toBe(false);
    await context.close();
  }
});

test('read_only maintenance: the hub shows "Sync paused" and saves locally; off drains it', async ({ browser, page, request }) => {
  const first = await learnerSynced(page);

  const adminContext = await browser.newContext();
  await signInAdmin(adminContext);
  const admin = await adminContext.newPage();
  await admin.goto('/admin/maintenance');
  const modeForm = admin.getByRole('form', { name: 'Maintenance mode' });
  await modeForm.getByRole('radio', { name: /Read-only/ }).check();
  await modeForm.getByRole('textbox', { name: 'Message for learners (optional)' }).fill('Upgrading the server');
  await modeForm.getByRole('button', { name: 'Set mode' }).click();
  await expect(admin.getByText('Maintenance is now Read-only.')).toBeVisible();
  await expect(admin.getByTestId('maintenance-mode')).toHaveText('Read-only');

  const upd = await answerNext(page, hub);
  await settle(page, 1600); // the hub's save debounce
  await flushNow(page);
  await expect(pill(page)).toHaveText(PILL.error);
  await expect.poll(() => notices(page)).toContain('maintenance');
  expect(await chromeText(page)).toContain('Site maintenance: sync is paused');
  expect(await chromeText(page)).toContain('Upgrading the server');
  expect((await localStamps(page, hub)).main, 'the browser keeps the change').toBe(upd);
  expect(await storedUpd(request, userA.uid, hub, 'main'), 'nothing written in read_only').toBe(first);

  await modeForm.getByRole('radio', { name: /^Off/ }).check();
  await modeForm.getByRole('button', { name: 'Set mode' }).click();
  await expect(admin.getByText('Maintenance is now Off.')).toBeVisible();

  await flushNow(page);
  expect(await storedUpd(request, userA.uid, hub, 'main'), 'the outbox drained').toBe(upd);
  await expect(pill(page)).toHaveText(PILL.cloud);
  await expect.poll(() => notices(page)).not.toContain('maintenance');
  await adminContext.close();
});

test('full maintenance: an open hub pauses, a reload stays local, nothing is lost; off syncs it all', async ({ browser, page, request }) => {
  const first = await learnerSynced(page);

  const adminContext = await browser.newContext();
  await signInAdmin(adminContext);
  const setMode = async (data: Record<string, unknown>): Promise<void> => {
    const r = await adminContext.request.put('/api/admin/maintenance', { headers: API_HEADERS, data });
    expect(r.status(), `PUT /api/admin/maintenance ${JSON.stringify(data)}: ${await r.text()}`).toBe(200);
  };
  await setMode({ mode: 'full', message: 'Moving the database', confirm: 'FULL' });

  // The open page: its writes pause and stay in this browser.
  const during = await answerNext(page, hub);
  await settle(page, 1600);
  await flushNow(page);
  await expect(pill(page)).toHaveText(PILL.error);
  await expect.poll(() => notices(page)).toContain('maintenance');
  expect(await storedUpd(request, userA.uid, hub, 'main'), 'nothing written in full').toBe(first);

  // A reload during full: the hub runs from this browser alone, with everything kept.
  await page.reload();
  await expect(pill(page)).toHaveText(PILL.local);
  expect((await localStamps(page, hub)).main, 'the paused change survived the reload').toBe(during);
  await openQuizModule(page, hub);
  const offline = await answerNext(page, hub);
  await settle(page, 1600);
  expect(offline).toBeGreaterThan(during);

  await setMode({ mode: 'off' });
  await page.reload();
  await expectSignedInHub(page);
  await flushNow(page);
  await expect.poll(() => storedUpd(request, userA.uid, hub, 'main'), { message: 'every local change reached the account' }).toBe(offline);
  await expect(pill(page)).toHaveText(PILL.cloud);
  await adminContext.close();
});

test('a scheduled window with a near startAt fires and ends (test clock)', async ({ page, request }) => {
  await signInAdmin(page.context());
  await page.goto('/admin/maintenance');

  // The next whole minute at least 3 minutes ahead, as a wall-clock time in ADMIN_TZ.
  const startMs = Math.ceil((Date.now() + 3 * 60_000) / 60_000) * 60_000;
  const form = page.getByRole('form', { name: 'Schedule a window' });
  await expect(form).toContainText(`Start (time zone ${ADMIN_TZ})`);
  await form.getByRole('radio', { name: 'At a date and time' }).check();
  await form.getByLabel(`Start (${ADMIN_TZ})`).fill(wallClock(startMs, ADMIN_TZ));
  await form.getByRole('spinbutton', { name: 'Duration (minutes)' }).fill('30');
  await form.getByRole('textbox', { name: 'Message for learners (optional)' }).fill('Scheduled e2e window');
  await form.getByRole('button', { name: 'Schedule window' }).click();
  await expect(page.getByText(/Scheduled: Read-only from .+ for 30 min\./)).toBeVisible();
  const jobs = page.getByRole('region', { name: 'Scheduled jobs' });
  const row = jobs.getByRole('row').filter({ hasText: 'Scheduled e2e window' });
  await expect(row).toContainText('scheduled');

  // Within 10 minutes of the start, /api/me carries the upcoming window.
  const me = (await (await page.request.get('/api/me')).json()) as { upcoming: { mode: string; startAt: string } | null };
  expect(me.upcoming?.mode).toBe('read_only');
  expect(Date.parse(me.upcoming!.startAt)).toBe(startMs);

  // Past the start: the tick enters read_only.
  await setServerClock(request, startMs - Date.now() + 5_000);
  expect((await tick(request)).maintenance.mode).toBe('read_only');
  await page.reload();
  await expect(page.getByTestId('maintenance-mode')).toHaveText('Read-only');
  await expect(row).toContainText('running');

  // Past the end: the previous mode (off) comes back and the job succeeded.
  await setServerClock(request, startMs + 30 * 60_000 - Date.now() + 5_000);
  expect((await tick(request)).maintenance.mode).toBe('off');
  await page.reload();
  await expect(page.getByTestId('maintenance-mode')).toHaveText('Off');
  await expect(row).toContainText('succeeded');
});

test('backup download through the ticket passes backup_tool.py verify (plain, then encrypted)', async ({ browser, page }) => {
  const learner = await browser.newContext();
  await learnerSynced(await learner.newPage());
  await learner.close();

  await signInAdmin(page.context());
  await page.goto('/admin/backup');
  await expect(page.getByRole('region', { name: 'Estimate' })).toContainText('Reads needed');
  await expect(page.getByRole('checkbox', { name: 'Use read-only maintenance during backup' })).toBeChecked();

  // 1. Unencrypted, with read-only maintenance during the run.
  await page.getByRole('textbox', { name: 'Type BACKUP to confirm' }).fill('BACKUP');
  const [plain] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Create backup and download' }).click(),
  ]);
  expect(plain.suggestedFilename()).toMatch(/^studyhubs-\d{8}-\d{6}Z\.backup$/);
  const plainFile = await saveDownload(plain);
  expect(await plain.failure()).toBeNull();
  const summary = verifyBackup(plainFile);
  expect(summary).toMatchObject({ ok: true, encrypted: false, consistent: true });
  expect(summary.counts).toMatchObject({ settings: 1, user: 2 }); // the learner and the admin
  expect(summary.counts.progress).toBeGreaterThanOrEqual(1);
  const maintenance = (await (await page.request.get('/api/admin/maintenance')).json()) as { mode: string };
  expect(maintenance.mode, 'the previous mode is back after the run').toBe('off');
  await page.getByRole('button', { name: 'Refresh log' }).click();
  await expect(page.getByRole('region', { name: 'Backup log' })).toContainText(String(summary.fileSha256));

  // 2. Encrypted with the generated passphrase (read once from the form), without read-only.
  await page.getByRole('checkbox', { name: 'Encrypt with a passphrase' }).check();
  const passphrase = await page.getByRole('textbox', { name: 'Passphrase' }).inputValue();
  expect(passphrase.length).toBeGreaterThanOrEqual(12);
  await expect(page.getByText(/can’t be recovered/)).toBeVisible();
  await page.getByRole('checkbox', { name: 'Use read-only maintenance during backup' }).uncheck();
  await page.getByRole('textbox', { name: 'Type BACKUP to confirm' }).fill('BACKUP');
  const [encrypted] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Create backup and download' }).click(),
  ]);
  const encryptedFile = await saveDownload(encrypted);
  await expect(page.getByRole('textbox', { name: 'Passphrase' }), 'shown once').toHaveCount(0);
  const secret = verifyBackup(encryptedFile, passphrase);
  expect(secret).toMatchObject({ ok: true, encrypted: true, consistent: false });
  expect(secret.counts).toEqual(summary.counts);
  expect(() => verifyBackup(encryptedFile, `${passphrase}x`)).toThrow(/wrong passphrase|bad tag/);
  // The passphrase never reaches the file in the clear.
  expect(fs.readFileSync(encryptedFile).includes(Buffer.from(passphrase))).toBe(false);

  for (const file of [plainFile, encryptedFile]) fs.rmSync(path.dirname(file), { recursive: true, force: true });
});
