/**
 * M1 account lifecycle on one browser (build-contracts.md §13, §14, §16):
 *   S10  sign-out wipes this browser's hub progress (keeps studyhub.codeLang and
 *        studyhubs.ui.*), the server keeps the data, and signing back in restores it
 *   S13  another account signing in on the same browser gets the account-switch dialog, and
 *        no write ever lands under the wrong uid (checked through /api/test/store)
 */
import { expect, test, type Page } from '@playwright/test';
import { hubPath, progressKey } from './support/catalog';
import { openQuizModule, readItem, readJson, settle, watchPage, type HubRecord } from './support/hub';
import {
  PILL,
  V2_HUB,
  answerNext,
  chromeText,
  expectSignedInHub,
  firePagehide,
  flushNow,
  localStamps,
  notices,
  pill,
  resetServer,
  signIn,
  storeDump,
  storedUpd,
  submitTestSignIn,
  syncStats,
  trackSync,
  userA,
  userB,
} from './support/sync';

const hub = V2_HUB;
const OWNER_KEY = 'studyhubs.owner';

test.beforeEach(async ({ request }) => {
  await resetServer(request);
});

const allKeys = (page: Page) => page.evaluate(() => Object.keys(localStorage).sort());

test('S10 sign-out wipes hub progress but keeps the code language; signing back in restores it', async ({
  context,
  page,
  request,
}) => {
  await watchPage(page);
  await signIn(context, userA);
  await openQuizModule(page, hub);
  await expectSignedInHub(page);
  await page.evaluate(() => {
    localStorage.setItem('studyhub.codeLang', 'python');
    localStorage.setItem('studyhubs.ui.e2e', '1');
  });
  await answerNext(page, hub);
  const upd = await answerNext(page, hub);
  expect(await storedUpd(request, userA.uid, hub, 'main'), 'not synced yet (tier-1 window)').toBe(0);

  // Sign out in a second tab: it asks the open hub tab to flush, pushes the rest, ends the
  // session, wipes this browser and tells the hub tab, which reloads anonymous.
  const shell = await context.newPage();
  await watchPage(shell);
  await shell.goto('/signout');
  await shell.waitForURL((u) => u.pathname === '/');
  expect(await storedUpd(request, userA.uid, hub, 'main'), 'the server has the last answer').toBe(upd);

  const keys = await allKeys(shell);
  // The hub tab reloads anonymous and may already have saved a fresh, empty record (the hub
  // writes S.last on its first render), so "wiped" means: nothing of A's progress is left.
  const left = await readJson<HubRecord>(shell, progressKey(hub));
  expect(left?.U ?? { main: 0, mocks: 0, cards: 0 }, "A's progress is wiped").toEqual({ main: 0, mocks: 0, cards: 0 });
  expect(Object.keys(left?.S.done ?? {}), 'no module is done any more').toEqual([]);
  expect(keys.filter((k) => k.startsWith('studyhubs.') && !k.startsWith('studyhubs.ui.')), 'bridge state is wiped').toEqual([]);
  expect(await readItem(shell, 'studyhub.codeLang'), 'the code language survives').toBe('python');
  expect(await readItem(shell, 'studyhubs.ui.e2e'), 'UI preferences survive').toBe('1');
  const cookies = (await context.cookies()).map((c) => c.name);
  expect(cookies).not.toContain('sh_session');
  expect(cookies).not.toContain('sh_hint');
  const me = await (await context.request.get('/api/me')).json();
  expect(me.signedIn).toBe(false);

  // The hub tab got {type:"logout"}: reloaded, anonymous, empty.
  await expect.poll(async () => (await syncStats(page)).mode).toBe('anonymous');
  await expect(pill(page)).toHaveText(PILL.local);
  expect((await localStamps(page, hub)).main).toBe(0);
  await page.close();

  // The server kept everything; signing back in brings it back.
  expect(await storedUpd(request, userA.uid, hub, 'main')).toBe(upd);
  await shell.goto(`/signin?next=${encodeURIComponent(hubPath(hub))}`);
  await submitTestSignIn(shell, userA);
  await shell.waitForURL((u) => u.pathname === hubPath(hub));
  await expectSignedInHub(shell);
  await expect.poll(async () => (await localStamps(shell, hub)).main, { message: 'restored from the server' }).toBe(upd);
  await expect(pill(shell)).toHaveText(PILL.cloud);
});

test.describe('S13 account switch on one browser', () => {
  test('the dialog appears and nothing of A is written under B', async ({ context, page, request }) => {
    await watchPage(page);
    const publicA = await signIn(context, userA);
    await openQuizModule(page, hub);
    await expectSignedInHub(page);
    expect(await readItem(page, OWNER_KEY)).toBe(publicA);
    const upd = await answerNext(page, hub); // unsynced: still in the tier-1 window
    await settle(page, 1600);

    // A's session ends (cookies gone); B signs in on the same browser while A's hub tab is open.
    await context.clearCookies();
    const shell = await context.newPage();
    await watchPage(shell);
    await shell.goto('/signin');
    await submitTestSignIn(shell, userB);
    const dialog = shell.getByRole('dialog', { name: 'This browser has progress from another account' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('1 change');
    expect(await storedUpd(request, userB.uid, hub, 'main'), 'nothing is pushed before the choice').toBe(0);
    await dialog.getByRole('button', { name: 'Discard and continue' }).click();
    await shell.waitForURL((u) => u.pathname === '/');

    expect(await readItem(shell, progressKey(hub)), "A's progress is discarded").toBeNull();
    expect(await readItem(shell, OWNER_KEY), 'the browser now belongs to B').not.toBe(publicA);
    expect(await readItem(shell, OWNER_KEY)).toBeTruthy();

    // A's hub tab still holds A's change in memory: it must never send it with B's cookie.
    await flushNow(page).catch(() => undefined); // the tab may be reloading
    await firePagehide(page).catch(() => undefined);
    await settle(shell, 500);

    const dump = await storeDump(request);
    expect(dump.progress.filter((p) => p.uid === userB.uid), 'no progress stored under B').toEqual([]);
    expect(dump.progress.filter((p) => p.upd === upd), "A's change is stored nowhere").toEqual([]);
    expect(dump.users.map((u) => u.uid)).toContain(userB.uid);
  });

  test("a hub opened by B on A's browser stays local and shows the mismatch notice", async ({ context, page, request }) => {
    await watchPage(page);
    await signIn(context, userA);
    await openQuizModule(page, hub);
    await expectSignedInHub(page);
    await answerNext(page, hub);
    await flushNow(page);
    const aUpd = await storedUpd(request, userA.uid, hub, 'main');
    expect(aUpd).toBeGreaterThan(0);

    // B signs in without the shell (no dialog, no wipe): the owner tag still says A.
    await context.clearCookies();
    const sync = trackSync(context);
    await signIn(context, userB);
    await page.reload();
    await expect.poll(async () => (await syncStats(page)).mode).toBe('mismatch');
    await expect.poll(() => notices(page)).toContain('mismatch');
    expect(await chromeText(page)).toContain('This browser has progress from another account');
    await expect(pill(page)).toHaveText(PILL.local);

    await answerNext(page, hub);
    await settle(page, 1600);
    await flushNow(page);
    await firePagehide(page);
    await settle(page, 300);
    expect(sync, 'a mismatched page sends nothing').toHaveLength(0);
    const dump = await storeDump(request);
    expect(dump.progress.filter((p) => p.uid === userB.uid)).toEqual([]);
    expect(await storedUpd(request, userA.uid, hub, 'main'), "A's copy is untouched").toBe(aUpd);
  });
});
