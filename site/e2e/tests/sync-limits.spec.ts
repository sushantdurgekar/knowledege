/**
 * M1 limits (build-contracts.md §12, §16):
 *   S12  a scripted 40-minute session (page.clock) stays within the write budget per tier
 *   S14  a device clock one day ahead: the clock notice, and nothing is stored
 *   S16  quota at the budget: "Sync paused", no "storage full" toast, the reset-time notice,
 *        and the outbox drains once the quota is back (POST /api/test/reset)
 */
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { openQuizModule, settle, watchPage } from './support/hub';
import {
  PILL,
  STORAGE_FULL_TOAST,
  V2_HUB,
  WRITE_BUDGET,
  advanceClock,
  answerNext,
  broadcastFlush,
  chromeText,
  expectSignedInHub,
  flushNow,
  localStamps,
  notices,
  pill,
  resetServer,
  setQuota,
  setServerClock,
  signIn,
  storeDump,
  storedUpd,
  syncStats,
  trackSync,
  userA,
  type SyncRequest,
} from './support/sync';

const hub = V2_HUB;
const DAY_MS = 86_400_000;

test.beforeEach(async ({ request }) => {
  await resetServer(request);
});

test.afterEach(async ({ request }) => {
  await setServerClock(request, 0);
});

/* ─────────────────────────── S12 ─────────────────────────── */

const SESSION_MS = 40 * 60_000;
/** One answer every two minutes: a learner reading the explanations. */
const ANSWER_GAP_MS = 120_000;
/** POST /api/sync is limited to 12/min with a burst of 6 per uid (real time, server side). */
const SYNC_BURST = 6;
const SYNC_REFILL_MS = 5_000;
const CLOCK_STEP_MS = 10_000;

/**
 * Wait (real time) until one more sync request fits the server's per-uid token bucket, so the
 * compressed session measures the flush policy and never trips the rate limit.
 */
async function paceForRateLimit(sync: SyncRequest[], times: number[]): Promise<void> {
  while (times.length < sync.length) times.push(Date.now());
  if (times.length < SYNC_BURST) return;
  const earliest = times[0] + (times.length - SYNC_BURST + 1) * SYNC_REFILL_MS + 250;
  const wait = earliest - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
}

async function scriptedSession(page: Page, request: APIRequestContext): Promise<{ writes: number; requests: number }> {
  const sync = trackSync(page.context());
  const times: number[] = [];
  await page.clock.install();
  await watchPage(page);
  await signIn(page.context(), userA);
  await openQuizModule(page, hub);
  await expectSignedInHub(page);
  const before = (await storeDump(request)).meter.writes;
  const requestsBefore = sync.length;

  // The page clock runs ahead of real time; the server clock follows it so `upd` stays
  // within CLOCK_SKEW_MS.
  let advanced = 0;
  while (advanced < SESSION_MS) {
    await answerNext(page, hub);
    await paceForRateLimit(sync, times);
    // Ten-second steps: each step's sync request settles before the next (advanceClock).
    for (let step = 0; step < ANSWER_GAP_MS; step += CLOCK_STEP_MS) {
      await advanceClock(page, CLOCK_STEP_MS, CLOCK_STEP_MS);
      advanced += CLOCK_STEP_MS;
      await setServerClock(request, advanced);
    }
  }
  await expect.poll(async () => (await syncStats(page)).outbox.inflight).toBe(false);
  const stats = await syncStats(page);
  expect(stats.outbox.errors, `no failed sync request (last error: ${stats.outbox.lastError})`).toBe(0);
  const writes = (await storeDump(request)).meter.writes - before;
  test.info().annotations.push({ type: 'writes', description: `${writes} writes, ${sync.length - requestsBefore} requests` });
  return { writes, requests: sync.length - requestsBefore };
}

test.describe('S12 a scripted 40-minute session stays within the write budget', () => {
  test.setTimeout(240_000);

  test('tier 1 (under 50% of the budget): at most 26 writes', async ({ page, request }) => {
    const { writes, requests } = await scriptedSession(page, request);
    expect(writes, `writes in 40 minutes (requests: ${requests})`).toBeLessThanOrEqual(26);
    expect(writes, 'the session did sync').toBeGreaterThan(0);
    expect(requests).toBe(writes); // one hub: one write per request
  });

  test('tier 2 (50-80% of the budget): at most 14 writes', async ({ page, request }) => {
    const reply = await setQuota(request, { writes: Math.ceil(WRITE_BUDGET * 0.55) });
    expect(reply.policy.tier).toBe(2);
    const { writes, requests } = await scriptedSession(page, request);
    expect(writes, `writes in 40 minutes (requests: ${requests})`).toBeLessThanOrEqual(14);
    expect(writes, 'the session did sync').toBeGreaterThan(0);
    expect((await syncStats(page)).outbox.tier).toBe(2);
  });
});

/* ─────────────────────────── S14 ─────────────────────────── */

test('S14 a device clock one day ahead: clock notice, nothing stored', async ({ page, request }) => {
  await page.clock.install({ time: Date.now() + DAY_MS });
  await watchPage(page);
  await signIn(page.context(), userA);
  await openQuizModule(page, hub);
  await expectSignedInHub(page);
  const upd = await answerNext(page, hub);
  expect(upd, 'the hub stamps the change with the device clock').toBeGreaterThan(Date.now() + DAY_MS / 2);
  await settle(page, 1600);
  await flushNow(page);

  await expect.poll(() => notices(page)).toContain('clock');
  expect(await chromeText(page)).toContain('Your device clock is ahead');
  await expect(pill(page)).toHaveText(PILL.error);
  expect((await syncStats(page)).outbox).toMatchObject({ lastError: 'clock_skew', hold: 'skew' });
  expect((await storeDump(request)).progress, 'nothing is stored').toEqual([]);
  expect((await localStamps(page, hub)).main, 'the browser keeps the change').toBe(upd);
});

/* ─────────────────────────── S16 ─────────────────────────── */

test('S16 quota at the budget: "Sync paused" and the reset time, then the outbox drains', async ({ page, request }) => {
  const quota = await setQuota(request, { writes: WRITE_BUDGET });
  expect(quota.policy.tier).toBe('paused');
  await watchPage(page);
  await signIn(page.context(), userA);
  await openQuizModule(page, hub);
  await expectSignedInHub(page);
  const upd = await answerNext(page, hub);
  await settle(page, 1600);
  await flushNow(page);

  await expect(pill(page)).toHaveText(PILL.error);
  await expect.poll(() => notices(page)).toContain('paused');
  const text = await chromeText(page);
  expect(text).toContain('Cloud sync is paused');
  expect(text, 'the notice shows when sync resumes').toMatch(/Sync resumes at \S/);
  await expect(page.getByText(STORAGE_FULL_TOAST), 'a quota pause is not "storage full"').toHaveCount(0);
  expect(await notices(page)).not.toContain('too-large');
  expect((await syncStats(page)).outbox).toMatchObject({ lastError: 'sync_paused', hold: 'paused' });
  expect(await storedUpd(request, userA.uid, hub, 'main')).toBe(0);

  // The quota is back (a new Pacific day): a flush request drains the outbox.
  await resetServer(request);
  await broadcastFlush(page);
  await expect.poll(() => storedUpd(request, userA.uid, hub, 'main'), { message: 'outbox drained' }).toBe(upd);
  await expect.poll(() => notices(page)).not.toContain('paused');
  await expect(pill(page)).toHaveText(PILL.cloud);
  expect((await syncStats(page)).outbox).toMatchObject({ pending: 0, hold: '' });
});
