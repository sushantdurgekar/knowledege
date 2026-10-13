/**
 * M1 signed-in sync (build-contracts.md §16):
 *   S3  signed-in progress reaches the server in one coalesced request
 *   S4  a newer remote part (another device) is adopted on load
 *   S5  anonymous progress merges at the first sign-in, through the hub on reload and
 *       through the sign-in page's reconcileUp
 */
import { expect, test } from '@playwright/test';
import { hubPath, progressKey } from './support/catalog';
import { openQuizModule, readItem, settle, watchPage } from './support/hub';
import {
  PILL,
  V2_HUB,
  answerNext,
  expectSignedInHub,
  flushNow,
  localStamps,
  pill,
  resetServer,
  signIn,
  storedParts,
  storedUpd,
  submitTestSignIn,
  syncStats,
  trackSync,
  userA,
} from './support/sync';

const hub = V2_HUB;

test.beforeEach(async ({ request }) => {
  await resetServer(request);
});

test('S3 signed-in progress syncs in one coalesced request', async ({ page, context, request }) => {
  const watch = await watchPage(page);
  const sync = trackSync(context);
  await signIn(context, userA);
  await openQuizModule(page, hub);
  await expectSignedInHub(page);
  await expect(pill(page)).toHaveText(PILL.cloud);
  expect(await readItem(page, 'studyhubs.owner'), 'the first signed-in load claims the owner tag').toBeTruthy();

  for (let i = 0; i < 3; i++) await answerNext(page, hub);
  await settle(page, 1600); // past the hub's 1.2 s save debounce
  expect(sync, 'tier 1 batches changes: nothing is sent before the flush window').toHaveLength(0);
  expect((await syncStats(page)).outbox.pending, 'the change waits in the outbox').toBeGreaterThan(0);

  const local = await localStamps(page, hub);
  await flushNow(page);
  await settle(page, 300);
  expect(sync, 'three answers, one request').toHaveLength(1);
  expect(Object.keys(sync[0].hubs)).toEqual([hub.id]);
  expect(sync[0].hubs[hub.id].main?.upd, 'the request carries the newest main part').toBe(local.main);
  expect(await storedUpd(request, userA.uid, hub, 'main')).toBe(local.main);
  await expect(pill(page)).toHaveText(PILL.cloud);
  expect((await syncStats(page)).outbox).toMatchObject({ pending: 0, errors: 0, lastError: null });
  expect(watch.errors).toEqual([]);
});

test('S4 a newer remote part from another device is adopted', async ({ browser, page, context, request }) => {
  await watchPage(page);
  await signIn(context, userA);
  await openQuizModule(page, hub);
  await expectSignedInHub(page);
  await answerNext(page, hub);
  await flushNow(page);
  const older = await storedUpd(request, userA.uid, hub, 'main');
  expect(older).toBe((await localStamps(page, hub)).main);

  // Another device: loads the older server copy, answers two more items, syncs.
  const other = await browser.newContext();
  try {
    const page2 = await other.newPage();
    await watchPage(page2);
    await signIn(other, userA);
    await openQuizModule(page2, hub);
    await expectSignedInHub(page2);
    await expect.poll(async () => (await localStamps(page2, hub)).main, { message: 'device 2 adopts the server copy' }).toBe(older);
    await answerNext(page2, hub);
    await answerNext(page2, hub);
    await flushNow(page2);
    const newer = await storedUpd(request, userA.uid, hub, 'main');
    expect(newer).toBeGreaterThan(older);
    const remoteS = (await storedParts(request, userA.uid, hub)).main!.data.S as Record<string, unknown>;

    // Device 1 reloads: its local record is older, so the remote part wins.
    await page.reload();
    await expectSignedInHub(page);
    await expect.poll(async () => (await localStamps(page, hub)).main, { message: 'device 1 adopts the newer part' }).toBe(newer);
    const local = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}'), progressKey(hub));
    expect(local.S.done ?? null, 'the adopted state is the remote one').toEqual(remoteS.done ?? null);
    // Nothing older was pushed back over it.
    await flushNow(page);
    expect(await storedUpd(request, userA.uid, hub, 'main')).toBe(newer);
  } finally {
    await other.close();
  }
});

test.describe('S5 anonymous progress merges at the first sign-in', () => {
  test('through the hub, on the first signed-in load', async ({ page, context, request }) => {
    await watchPage(page);
    await openQuizModule(page, hub);
    await expect(pill(page)).toHaveText(PILL.local);
    await answerNext(page, hub);
    const anon = (await localStamps(page, hub)).main;
    expect(await readItem(page, 'studyhubs.owner'), 'anonymous pages never claim an owner').toBeNull();

    await signIn(context, userA);
    await page.reload();
    await expectSignedInHub(page);
    // The server has nothing: the hub pushes its newer local part.
    await expect.poll(async () => (await syncStats(page)).outbox.pending, { message: 'local part queued' }).toBeGreaterThan(0);
    await flushNow(page);
    expect(await storedUpd(request, userA.uid, hub, 'main')).toBe(anon);
    await expect(pill(page)).toHaveText(PILL.cloud);
    expect(await readItem(page, 'studyhubs.owner')).toBeTruthy();
  });

  test('through the sign-in page (reconcileUp) before the hub loads', async ({ page, request }) => {
    await watchPage(page);
    await openQuizModule(page, hub);
    await answerNext(page, hub);
    await answerNext(page, hub);
    const anon = (await localStamps(page, hub)).main;

    await page.goto(`/signin?next=${encodeURIComponent(hubPath(hub))}`);
    const syncs = page.waitForResponse((r) => r.url().endsWith('/api/sync') && r.request().method() === 'POST');
    await submitTestSignIn(page, userA);
    expect((await syncs).status()).toBe(200);
    await page.waitForURL((u) => u.pathname === hubPath(hub));
    // reconcileUp stored the part before the hub page asked for it.
    expect(await storedUpd(request, userA.uid, hub, 'main')).toBe(anon);
    await expectSignedInHub(page);
    await expect(pill(page)).toHaveText(PILL.cloud);
    expect((await localStamps(page, hub)).main, 'local progress kept').toBe(anon);
  });
});
