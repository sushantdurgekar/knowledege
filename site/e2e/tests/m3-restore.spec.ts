/**
 * M3 restore (build-contracts.md sections 24-26), in the serial project. Meant for a
 * Postgres-backed server (scripts/dev-e2e-pg.sh sets E2E_STORE=postgres, and the store kind is
 * then checked); on the memory store it runs the same way.
 *
 * The admin restore wizard end to end: a backup produced by the app (Backup tab) is uploaded
 * after the data is lost, validated, run "Now", watched until it succeeds, and a synced hub on a
 * new browser shows the restored progress.
 */
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { progressKey } from './support/catalog';
import { E2E_STORE } from './support/env';
import { openQuizModule } from './support/hub';
import { saveDownload, signInAdmin, verifyBackup } from './support/m2';
import {
  answerNext,
  expectSignedInHub,
  flushNow,
  localStamps,
  PILL,
  pill,
  resetServer,
  signIn,
  storeDump,
  storedParts,
  userA,
  V2_HUB,
} from './support/sync';

const hub = V2_HUB;

test.beforeEach(async ({ request }) => {
  await resetServer(request);
});

test.afterEach(async ({ request }) => {
  await resetServer(request); // leaves no full maintenance or staged upload behind
});

test('the admin restore wizard restores a backup made by the app, and a synced hub shows it', async ({
  browser,
  page,
  request,
}) => {
  test.setTimeout(180_000);
  await signInAdmin(page.context());
  const stats = (await (await page.request.get('/api/admin/stats')).json()) as { store: string };
  if (E2E_STORE) expect(stats.store, 'the store the server runs on').toBe(E2E_STORE);

  // 1. A learner with synced progress.
  const learner = await browser.newContext();
  const lp = await learner.newPage();
  await signIn(learner, userA);
  await openQuizModule(lp, hub);
  await expectSignedInHub(lp);
  await answerNext(lp, hub);
  await answerNext(lp, hub);
  await lp.locator('#doneM').click(); // "Mark module done": progress the hub shows after a reload
  await expect(lp.locator('#progTxt')).toHaveText(/^1 \/ \d+ modules$/);
  const progressText = await lp.locator('#progTxt').innerText();
  await flushNow(lp);
  await expect(pill(lp)).toHaveText(PILL.cloud);
  const stamp = (await localStamps(lp, hub)).main;
  const before = await storedParts(request, userA.uid, hub);
  expect(before.main?.upd, 'the server has the learner’s progress').toBe(stamp);
  await learner.close();

  // 2. A backup through the Backup tab: the file the app itself produces.
  await page.goto('/admin/backup');
  await page.getByRole('textbox', { name: 'Type BACKUP to confirm' }).fill('BACKUP');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Create backup and download' }).click(),
  ]);
  const file = await saveDownload(download);
  const summary = verifyBackup(file);
  expect(summary).toMatchObject({ ok: true, encrypted: false });
  expect(summary.counts).toMatchObject({ user: 2 }); // the learner and the admin
  const parts = summary.counts.progress ?? 0;
  expect(parts).toBeGreaterThanOrEqual(1);

  try {
    // 3. The data is lost: every table and the staging area are emptied.
    await resetServer(request);
    expect((await storeDump(request)).progress).toEqual([]);
    await signInAdmin(page.context()); // the admin again (a sign-in within 24 h for the restore)

    // 4. Pick the file: the header is read in the browser.
    await page.goto('/admin/restore');
    await expect(page.getByRole('link', { name: 'Restore' })).toHaveAttribute('aria-current', 'page');
    await page.getByLabel('Backup file (.backup)').setInputFiles(file);
    const header = page.getByLabel('Backup header');
    await expect(header).toContainText(stats.store);
    await expect(header).toContainText('2 users');
    await expect(header.getByText('no', { exact: true })).toBeVisible(); // not encrypted

    // 5. Upload (4 MiB chunks with SHA-256), then validate on the server.
    await page.getByRole('button', { name: `Upload ${path.basename(file)}` }).click();
    const validate = page.getByRole('form', { name: 'Validate' });
    await expect(validate).toBeVisible();
    await expect(validate.getByLabel(/Passphrase/)).toHaveCount(0);
    await validate.getByRole('button', { name: 'Validate' }).click();
    const plan = page.getByRole('table', { name: 'Plan' });
    await expect(plan).toContainText('1 new, 1 already here'); // the learner is new, the admin signed in again
    await expect(plan).toContainText(`${parts} newer in the backup (written), 0 older`);
    await expect(page.getByLabel('Validation report')).toContainText(`${stats.store}: 1 users, 0 progress documents`);

    // 6. Choose (merge, now) and confirm.
    const form = page.getByRole('form', { name: 'Choose and confirm' });
    await expect(form.getByRole('radio', { name: /Merge/ })).toBeChecked();
    await expect(form.getByRole('radio', { name: /^Now/ })).toBeChecked();
    if (stats.store === 'postgres') await expect(form.getByRole('radio', { name: /Replace/ })).toBeVisible();
    await expect(form.getByRole('radio', { name: /quota reset/ })).toHaveCount(0); // Firestore only
    const start = form.getByRole('button', { name: 'Start restore' });
    await expect(start).toBeDisabled();
    await form.getByRole('textbox', { name: 'Type RESTORE to confirm' }).fill('RESTORE');
    await start.click();

    // 7. Watch the job until it succeeds.
    const job = page.getByRole('group', { name: 'Restore job' });
    await expect(job.getByText('Restored and verified.', { exact: false })).toBeVisible({ timeout: 90_000 });
    await expect(job.getByText('succeeded', { exact: true })).toBeVisible();
    const records = Object.values(summary.counts).reduce((sum, n) => sum + n, 0);
    const bar = job.getByRole('progressbar', { name: 'Records applied' });
    await expect(bar).toHaveAttribute('aria-valuemax', String(records));
    await expect(bar).toHaveAttribute('aria-valuenow', String(records));
    await expect(job.getByLabel('Job report')).toContainText('counts match');
    await expect(job.getByLabel('Job report')).toContainText(/, 0 mismatched/);
    const maintenance = (await (await page.request.get('/api/admin/maintenance')).json()) as { mode: string };
    expect(maintenance.mode, 'the previous mode is back').toBe('off');
    const staged = (await (await page.request.get('/api/admin/restore/uploads')).json()) as { uploads: unknown[] };
    expect(staged.uploads, 'staging is deleted after a success').toEqual([]);

    // The stored parts are the backed-up ones, byte for byte.
    const after = await storedParts(request, userA.uid, hub);
    expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
    for (const [part, stored] of Object.entries(before)) {
      expect(after[part as keyof typeof after]?.upd, `${part} upd`).toBe(stored.upd);
      expect(after[part as keyof typeof after]?.data, `${part} data`).toEqual(stored.data);
    }

    // 8. A new browser (no local progress) signs in as the learner: the hub shows the restored progress.
    const device = await browser.newContext();
    try {
      const dp = await device.newPage();
      await signIn(device, userA);
      await openQuizModule(dp, hub);
      await expectSignedInHub(dp);
      await expect.poll(async () => (await localStamps(dp, hub)).main, { message: 'the hub adopts the restored part' }).toBe(stamp);
      const local = await dp.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}'), progressKey(hub));
      expect(local.S.done, 'the restored state').toEqual((before.main!.data.S as { done?: unknown }).done);
      expect(Object.keys(local.S.done)).toHaveLength(1);
      await expect(dp.locator('#progTxt'), 'the hub shows the restored progress').toHaveText(progressText);
      await expect(dp.locator('#doneM')).toContainText('Marked done');
      await expect(pill(dp)).toHaveText(PILL.cloud);
    } finally {
      await device.close();
    }
  } finally {
    fs.rmSync(path.dirname(file), { recursive: true, force: true });
  }
});
