/**
 * M2 account scenarios (build-contracts.md sections 18, 21, 22), in the serial project:
 *   - export ("Download my data") and delete: cookies cleared, this browser's hub data wiped,
 *     and /api/test/store holds nothing for that uid
 *   - delete with a sign-in older than 24 h: 403 reauth_required → sign in again → delete
 */
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { BASE_URL } from './support/env';
import { openQuizModule } from './support/hub';
import { saveDownload, storageKeys } from './support/m2';
import {
  PILL,
  V2_HUB,
  answerNext,
  expectSignedInHub,
  flushNow,
  pill,
  resetServer,
  setServerClock,
  signIn,
  storeDump,
  submitTestSignIn,
  userA,
} from './support/sync';

const hub = V2_HUB;

test.beforeEach(async ({ request }) => {
  await resetServer(request);
});

test.afterEach(async ({ request }) => {
  await setServerClock(request, 0);
});

async function deleteAccount(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Delete my account' }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete your account?' });
  const confirm = dialog.getByRole('button', { name: 'Delete my account' });
  await expect(confirm).toBeDisabled();
  await dialog.getByRole('textbox', { name: 'Type DELETE to confirm' }).fill('DELETE');
  await confirm.click();
}

test('account export and delete: cookies cleared, local data wiped, nothing left in the store', async ({ page, request }) => {
  await signIn(page.context(), userA);
  await openQuizModule(page, hub);
  await expectSignedInHub(page);
  await answerNext(page, hub);
  await flushNow(page);
  await expect(pill(page)).toHaveText(PILL.cloud);
  await page.evaluate(() => localStorage.setItem('studyhub.codeLang', 'python'));

  await page.goto('/account');
  const progress = page.getByRole('region', { name: 'Your progress' });
  const row = progress.getByRole('listitem').filter({ hasText: hub.title });
  await expect(row).toContainText(/Account: \d+ done/);
  await expect(row).toContainText('Synced');
  await expect(page.getByRole('region', { name: 'Browser storage' })).toContainText(hub.title);

  // Export.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download my data' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^studyhubs-export-\d{8}\.json$/);
  const file = await saveDownload(download);
  const text = fs.readFileSync(file, 'utf8');
  const exported = JSON.parse(text) as {
    exportedAt: string;
    user: Record<string, unknown>;
    progress: { hub: string; part: string; upd: number; data: Record<string, unknown> }[];
  };
  fs.rmSync(path.dirname(file), { recursive: true, force: true });
  expect(Date.parse(exported.exportedAt)).toBeGreaterThan(0);
  expect(exported.user).toMatchObject({ email: userA.email, provider: 'password' });
  expect(text, 'the raw uid never leaves the server').not.toContain(userA.uid);
  const main = exported.progress.find((p) => p.hub === hub.id && p.part === 'main');
  expect(main?.data).toMatchObject({ hub: hub.id });
  await expect(page.getByText(/^Downloaded studyhubs-export-\d{8}\.json\.$/)).toBeVisible();

  // Delete.
  await deleteAccount(page);
  await page.waitForURL(`${BASE_URL}/`);
  await expect(page.getByRole('banner').getByRole('link', { name: 'Sign in' })).toBeVisible();
  const cookies = (await page.context().cookies()).map((c) => c.name);
  expect(cookies).not.toContain('sh_session');
  expect(cookies).not.toContain('sh_hint');
  const keys = await storageKeys(page);
  expect(keys.filter((k) => k.startsWith('studyhub.') && k !== 'studyhub.codeLang'), 'hub data wiped').toEqual([]);
  expect(keys.filter((k) => k.startsWith('studyhubs.') && !k.startsWith('studyhubs.ui.')), 'bridge data wiped').toEqual([]);
  expect(keys).toContain('studyhub.codeLang');

  const dump = await storeDump(request);
  expect(dump.users.filter((u) => u.uid === userA.uid)).toEqual([]);
  expect(dump.progress.filter((p) => p.uid === userA.uid)).toEqual([]);
  const me = (await (await page.request.get('/api/me')).json()) as { signedIn: boolean };
  expect(me.signedIn).toBe(false);
});

test('delete after a sign-in older than 24 h: sign in again, then the delete goes through', async ({ page, request }) => {
  await signIn(page.context(), userA);
  await setServerClock(request, 25 * 3600_000);
  await page.goto('/account');
  await expect(page.getByRole('heading', { level: 1, name: 'Your account' })).toBeVisible();

  await deleteAccount(page);
  await page.waitForURL((url) => url.pathname === '/signin' && url.search === '?next=%2Faccount&reauth=1');
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in again' })).toBeVisible();
  expect((await storeDump(request)).users.map((u) => u.uid)).toContain(userA.uid);

  await setServerClock(request, 0);
  await submitTestSignIn(page, userA);
  await page.waitForURL((url) => url.pathname === '/account');
  await deleteAccount(page);
  await page.waitForURL(`${BASE_URL}/`);
  const dump = await storeDump(request);
  expect(dump.users.filter((u) => u.uid === userA.uid)).toEqual([]);
});
