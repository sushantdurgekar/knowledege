/**
 * M1 S6: the fault matrix (build-contracts.md §13 error mapping, §15 /api/test/faults).
 * Each fault on POST /api/sync must give the right pill, toast and notice, lose no data
 * (the browser keeps the progress, the server keeps its last good copy) and recover.
 */
import { expect, test, type Page } from '@playwright/test';
import { openQuizModule, settle, watchPage } from './support/hub';
import {
  PILL,
  STORAGE_FULL_TOAST,
  V2_HUB,
  answerNext,
  chromeText,
  expectSignedInHub,
  flushNow,
  injectFault,
  localStamps,
  notices,
  pill,
  resetServer,
  signIn,
  storedUpd,
  syncStats,
  userA,
} from './support/sync';

const hub = V2_HUB;

test.beforeEach(async ({ request }) => {
  await resetServer(request);
});

/** Signed in on the hub with one answer synced; returns the server's main stamp. */
async function syncedStart(page: Page): Promise<number> {
  await signIn(page.context(), userA);
  await openQuizModule(page, hub);
  await expectSignedInHub(page);
  await answerNext(page, hub);
  await flushNow(page);
  await expect(pill(page)).toHaveText(PILL.cloud);
  return (await localStamps(page, hub)).main;
}

/** Answer once more and let the hub hand the change to the bridge (its set() now waits for an ack). */
async function pendingChange(page: Page): Promise<number> {
  const upd = await answerNext(page, hub);
  await settle(page, 1600); // the hub's 1.2 s save debounce
  return upd;
}

const toast = (page: Page) => page.getByText(STORAGE_FULL_TOAST);

test('503 unavailable: "Sync paused" pill, then a retry recovers', async ({ page, request }) => {
  await watchPage(page);
  const first = await syncedStart(page);
  const upd = await pendingChange(page);
  await injectFault(request, { op: 'put', status: 503, code: 'unavailable', retryAfter: 30 });
  await flushNow(page);

  await expect(pill(page)).toHaveText(PILL.error);
  expect((await syncStats(page)).outbox).toMatchObject({ lastError: 'unavailable', dead: null });
  await expect(toast(page)).toHaveCount(0);
  expect(await storedUpd(request, userA.uid, hub, 'main'), 'the server keeps its last good copy').toBe(first);
  expect((await localStamps(page, hub)).main, 'the browser keeps the change').toBe(upd);

  await flushNow(page); // the fault was one-shot
  expect(await storedUpd(request, userA.uid, hub, 'main')).toBe(upd);
  await expect(pill(page), 'a background success rewrites the pill').toHaveText(PILL.cloud);
  expect((await syncStats(page)).outbox).toMatchObject({ pending: 0, lastError: null });
});

test('429 sync_paused: pill and a "sync is paused" notice with the resume time, then recovery', async ({ page, request }) => {
  await watchPage(page);
  const first = await syncedStart(page);
  const upd = await pendingChange(page);
  await injectFault(request, { op: 'put', status: 429, code: 'sync_paused', retryAfter: 3600 });
  await flushNow(page);

  await expect(pill(page)).toHaveText(PILL.error);
  await expect.poll(() => notices(page)).toContain('paused');
  expect(await chromeText(page)).toContain('Cloud sync is paused');
  expect(await chromeText(page)).toContain('Sync resumes at');
  expect((await syncStats(page)).outbox.hold).toBe('paused');
  await expect(toast(page)).toHaveCount(0);
  expect(await storedUpd(request, userA.uid, hub, 'main')).toBe(first);

  await flushNow(page);
  expect(await storedUpd(request, userA.uid, hub, 'main')).toBe(upd);
  await expect.poll(() => notices(page)).not.toContain('paused');
  await expect(pill(page)).toHaveText(PILL.cloud);
});

test('401: the session-ended notice, sync stops, nothing lost; reload resumes', async ({ page, request }) => {
  await watchPage(page);
  const first = await syncedStart(page);
  const upd = await pendingChange(page);
  await injectFault(request, { op: 'put', status: 401, code: 'unauthenticated' });
  await flushNow(page);

  await expect.poll(() => notices(page)).toContain('session');
  expect(await chromeText(page)).toContain('Session ended');
  expect((await syncStats(page)).outbox.dead).toBe('revoked');
  // The hub drops its db for this page load ("revoked") and says so.
  await expect(pill(page)).toHaveText(PILL.local);
  await expect(toast(page)).toHaveCount(0);
  expect(await storedUpd(request, userA.uid, hub, 'main')).toBe(first);
  expect((await localStamps(page, hub)).main).toBe(upd);

  // The fault was injected: the session cookie is still good, so a reload syncs again.
  await page.reload();
  await expectSignedInHub(page);
  await expect.poll(async () => (await syncStats(page)).outbox.pending, { message: 'newer local part queued' }).toBeGreaterThan(0);
  await flushNow(page);
  expect(await storedUpd(request, userA.uid, hub, 'main')).toBe(upd);
  await expect(pill(page)).toHaveText(PILL.cloud);
  expect(await notices(page)).not.toContain('session');
});

test('413 too_large: the hub toast, the too-large notice, then recovery', async ({ page, request }) => {
  await watchPage(page);
  const first = await syncedStart(page);
  const upd = await pendingChange(page);
  await injectFault(request, { op: 'put', status: 413, code: 'too_large' });
  await flushNow(page);

  await expect(pill(page)).toHaveText(PILL.error);
  await expect(toast(page).first()).toBeVisible();
  await expect.poll(() => notices(page)).toContain('too-large');
  expect(await storedUpd(request, userA.uid, hub, 'main')).toBe(first);
  expect((await localStamps(page, hub)).main).toBe(upd);

  // The next change goes through.
  const later = await pendingChange(page);
  await flushNow(page);
  expect(await storedUpd(request, userA.uid, hub, 'main')).toBe(later);
  await expect(pill(page)).toHaveText(PILL.cloud);
});
