/**
 * M1 S9: the legacy AI-901 hub syncs through its seed script and the wrapped setItem
 * (build-contracts.md §10 seed, §13 "Legacy"), across two browser contexts (two devices).
 */
import { expect, test, type Page } from '@playwright/test';
import { openHub, readJson, watchPage } from './support/hub';
import {
  LEGACY_HUB,
  flushNow,
  resetServer,
  signIn,
  storedParts,
  syncStats,
  userA,
} from './support/sync';

test.beforeEach(async ({ request }) => {
  await resetServer(request);
});

const planBoxes = (page: Page) => page.locator('#v-plan input[type="checkbox"]');

/** Ticked plan items in the hub's own record. */
async function ticked(page: Page, key: string): Promise<number> {
  const rec = await readJson<{ plan?: Record<string, unknown> }>(page, key);
  return Object.values(rec?.plan ?? {}).filter(Boolean).length;
}

async function openSignedIn(page: Page): Promise<void> {
  await openHub(page, LEGACY_HUB!);
  await expect.poll(async () => (await syncStats(page)).legacy, { message: 'legacy seed applied' }).toMatchObject({
    seedCalls: 1,
    signedIn: true,
  });
  await expect.poll(async () => (await syncStats(page)).sync?.active ?? false).toBe(true);
}

test('S9 AI-901 progress round-trips between two devices', async ({ browser, page, context, request }) => {
  test.skip(!LEGACY_HUB, 'the catalog has no legacy hub');
  const hub = LEGACY_HUB!;
  const key = hub.legacyKeys[0];

  // Device 1 ticks a plan item and syncs it.
  await watchPage(page);
  await signIn(context, userA);
  await openSignedIn(page);
  await planBoxes(page).nth(0).check();
  await expect.poll(() => ticked(page, key)).toBe(1);
  await flushNow(page);
  const first = (await storedParts(request, userA.uid, hub)).legacy;
  expect(first, 'the legacy part is stored').toBeTruthy();
  expect(first!.data).toMatchObject({ hub: hub.id, key });
  expect(JSON.parse(first!.data.raw as string).plan).toEqual((await readJson<{ plan: object }>(page, key))!.plan);

  // Device 2 starts empty: the seed writes the server copy before the hub reads it.
  const other = await browser.newContext();
  try {
    const page2 = await other.newPage();
    await watchPage(page2);
    await signIn(other, userA);
    await openSignedIn(page2);
    await expect(planBoxes(page2).nth(0)).toBeChecked();
    expect(await ticked(page2, key)).toBe(1);

    await planBoxes(page2).nth(1).check();
    await expect.poll(() => ticked(page2, key)).toBe(2);
    await flushNow(page2);
    const second = (await storedParts(request, userA.uid, hub)).legacy!;
    expect(second.upd).toBeGreaterThan(first!.upd);

    // Device 1 reloads: the newer server copy replaces its local one.
    await page.reload();
    await openSignedIn(page);
    await expect(planBoxes(page).nth(1)).toBeChecked();
    expect(await ticked(page, key)).toBe(2);
    await flushNow(page);
    expect((await storedParts(request, userA.uid, hub)).legacy!.upd, 'nothing older was pushed back').toBe(second.upd);
  } finally {
    await other.close();
  }
});
