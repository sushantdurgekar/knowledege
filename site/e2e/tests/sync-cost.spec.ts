/**
 * M1 S8: the cost of syncing (build-contracts.md §13 outbox, §16).
 *   - ten answers at a learner's pace cost at most two sync requests at tier 1
 *   - closing the tab right after an answer still delivers it (keepalive on pagehide)
 *   - a large state (> 60 KB) goes out gzipped on unload
 */
import { expect, test } from '@playwright/test';
import { progressKey } from './support/catalog';
import { openQuizModule, settle, watchPage } from './support/hub';
import {
  V2_HUB,
  advanceClock,
  answerNext,
  expectSignedInHub,
  firePagehide,
  flushNow,
  resetServer,
  signIn,
  storedParts,
  storedUpd,
  syncStats,
  trackSync,
  userA,
} from './support/sync';

const hub = V2_HUB;

test.beforeEach(async ({ request }) => {
  await resetServer(request);
});

test('S8 ten answers at a learner pace cost at most two sync requests (tier 1)', async ({ page, context, request }) => {
  const sync = trackSync(context);
  await page.clock.install();
  await watchPage(page);
  await signIn(context, userA);
  await openQuizModule(page, hub);
  await expectSignedInHub(page);
  expect((await syncStats(page)).outbox.tier).toBe(1);

  let last = 0;
  for (let i = 0; i < 10; i++) {
    last = await answerNext(page, hub);
    await advanceClock(page, 12_000); // read the explanation, pick the next answer
  }
  // Let the tier-1 window (120 s from the first unsent change) run out.
  await advanceClock(page, 125_000);
  await expect.poll(() => storedUpd(request, userA.uid, hub, 'main'), { message: 'the last answer is stored' }).toBe(last);
  expect(sync.length, 'sync requests for ten answers').toBeGreaterThanOrEqual(1);
  expect(sync.length, 'sync requests for ten answers').toBeLessThanOrEqual(2);
  expect((await syncStats(page)).outbox).toMatchObject({ pending: 0, errors: 0 });
});

test('S8 closing the tab right after an answer still delivers it (keepalive)', async ({ page, context, request }) => {
  const sync = trackSync(context);
  await watchPage(page);
  await signIn(context, userA);
  await openQuizModule(page, hub);
  await expectSignedInHub(page);
  const upd = await answerNext(page, hub);
  expect(sync, 'nothing sent before the tab closes').toHaveLength(0);

  // pagehide: the outbox sends what is pending with fetch(keepalive). A closed page's
  // requests are no longer reported to the test, so the server is the witness.
  // watchPage's route (font stub) makes Playwright pause every request of this page until the
  // test process lets it go; a keepalive request paused while its page closes is dropped by
  // the harness (no browser does that), which made this test fail now and then under load.
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.close();
  await expect.poll(() => storedUpd(request, userA.uid, hub, 'main'), { message: 'the answer reached the server' }).toBe(upd);
});

test('S8 a large state (> 60 KB) is sent gzipped on unload', async ({ page, context, request }) => {
  const sync = trackSync(context);
  await watchPage(page);
  await signIn(context, userA);
  await openQuizModule(page, hub);
  await expectSignedInHub(page);
  await answerNext(page, hub);
  await settle(page, 1600);
  await flushNow(page);
  const syncedBefore = sync.length;

  // Grow the stored state past the 60,000-byte keepalive limit (notes a learner might keep),
  // the way the hub saves it: one setItem of the whole record with a fresh U.main.
  const upd = await page.evaluate((key) => {
    const rec = JSON.parse(localStorage.getItem(key) || '{}');
    const notes: string[] = [];
    for (let i = 0; i < 900; i++) notes.push(`note ${i}: revisit the two-pointer pattern and the prefix-sum edge cases`);
    rec.S.e2eNotes = notes;
    rec.U.main = Date.now();
    localStorage.setItem(key, JSON.stringify(rec));
    return rec.U.main as number;
  }, progressKey(hub));
  const raw = (await page.evaluate((k) => localStorage.getItem(k)?.length ?? 0, progressKey(hub))) as number;
  expect(raw, 'the record is larger than the keepalive limit').toBeGreaterThan(60_000);
  // The outbox preloads the gzip helper once the pending body passes 48 KB.
  await expect.poll(() => page.evaluate(() => typeof (window as unknown as { __shFflate?: unknown }).__shFflate)).toBe('object');

  await firePagehide(page); // the unload path, on a page that stays open so the request is observable
  await expect.poll(() => storedUpd(request, userA.uid, hub, 'main'), { message: 'the large state reached the server' }).toBe(upd);
  const unload = sync.slice(syncedBefore);
  expect(unload.length).toBeGreaterThanOrEqual(1);
  expect(unload.map((r) => r.encoding)).toContain('gzip');
  const gz = unload.find((r) => r.encoding === 'gzip')!;
  expect(gz.bytes, 'the gzipped body fits a keepalive request').toBeLessThanOrEqual(60_000);
  const stored = (await storedParts(request, userA.uid, hub)).main!;
  expect(((stored.data.S as { e2eNotes?: unknown[] }).e2eNotes ?? []).length).toBe(900);
});
