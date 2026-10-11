/**
 * (c) Anonymous visitors: the hub stays in "Saved in this browser" mode, progress lands in
 * localStorage, and the page makes no /api request at all (the legacy hub's blocking seed
 * script, /api/seed/<id>.js, is the one exception).
 * (h) The bridge's "saved only in this browser" notice appears after the first progress and
 * stays dismissed.
 */
import { expect, test, type Page } from '@playwright/test';
import { hubPath, loadCatalog, progressKey, type HubEntry } from './support/catalog';
import {
  bridgeStats,
  makeProgress,
  notices,
  openHub,
  readItem,
  readJson,
  settle,
  watchPage,
  type HubRecord,
  type PageWatch,
} from './support/hub';
import { CHROME_HOST, attr, axQuery, byAttr, clickNode, findNodes, shadowNode, shadowTree, textOf } from './support/shadow';

const NUDGE_TEXT = 'Progress is saved only in this browser — sign in to keep it';

const catalog = loadCatalog();

/** Same-origin requests an anonymous hub view may make: the page, the bridge, the legacy seed. */
function allowedPaths(hub: HubEntry): string[] {
  const paths = [hubPath(hub), '/_sh/bridge.js', '/favicon.ico'];
  if (hub.engine === 'legacy') paths.push(`/api/seed/${hub.id}.js`);
  return paths;
}

function expectNoApiCalls(watch: PageWatch, hub: HubEntry) {
  const api = watch.apiPaths();
  if (hub.engine === 'legacy') {
    // One per page load, and nothing else under /api.
    expect(new Set(api), 'legacy hubs only load their seed script').toEqual(new Set([`/api/seed/${hub.id}.js`]));
  } else {
    expect(api, 'no /api requests while anonymous').toEqual([]);
  }
  const unexpected = watch.sameOriginPaths().filter((p) => !allowedPaths(hub).includes(p));
  expect(unexpected, 'unexpected same-origin requests').toEqual([]);
}

async function expectLocalPill(page: Page) {
  await expect(page.locator('#syncPill')).toHaveText('Saved in this browser');
}

for (const hub of catalog.hubs.filter((h) => h.engine === 'v2')) {
  test.describe(`anonymous ${hub.slug}`, () => {
    test('progress stays in this browser and no /api request is made', async ({ page }) => {
      const watch = await watchPage(page);
      await openHub(page, hub);
      await expectLocalPill(page);

      await makeProgress(page, hub); // answers one quiz item (reloads the page once)
      const rec = await readJson<HubRecord>(page, progressKey(hub));
      expect(rec?.U.main, 'U.main is a recent Date.now()').toBeGreaterThan(Date.now() - 10 * 60_000);
      expect(Object.keys(rec?.S.dstat ?? {}).length, 'the answer was recorded in S.dstat').toBeGreaterThan(0);
      await expectLocalPill(page);
      await settle(page);

      const stats = await bridgeStats(page);
      expect(stats.mode).toBe('anonymous');
      expect(stats.network, 'bridge requests').toBe(0);
      expectNoApiCalls(watch, hub);
      expect(await page.context().cookies(), 'no cookie is set for anonymous visitors').toEqual([]);
      expect(watch.errors).toEqual([]);
    });
  });
}

for (const hub of catalog.hubs.filter((h) => h.engine === 'legacy')) {
  test.describe(`anonymous ${hub.slug} (legacy)`, () => {
    test('progress stays in this browser; only the seed script hits /api', async ({ page }) => {
      const watch = await watchPage(page);
      await makeProgress(page, hub); // ticks a 3-day-plan checkbox

      // The storage hook stamps a sidecar so newest-wins merging works at first sign-in (M1).
      const key = hub.legacyKeys[0];
      const upd = Number(await readItem(page, `studyhubs.legacy.${key}.upd`));
      expect(upd, 'legacy sidecar timestamp').toBeGreaterThan(Date.now() - 10 * 60_000);

      const stats = await bridgeStats(page);
      expect(stats.legacy).toEqual({ seedCalls: 1, signedIn: false });
      expect(stats.network).toBe(0);
      expectNoApiCalls(watch, hub);
      expect(watch.requests.filter((u) => u.pathname === `/api/seed/${hub.id}.js`)).toHaveLength(1);
      expect(watch.errors).toEqual([]);
    });
  });
}

for (const hub of catalog.hubs.filter((h) => h.engine === 'v2' || h.engine === 'legacy')) {
  test.describe(`nudge ${hub.slug}`, () => {
    test('appears after the first progress and can be dismissed for good', async ({ page }) => {
      const watch = await watchPage(page);
      await openHub(page, hub);
      expect(await notices(page), 'no notice before any progress').toEqual([]);

      await makeProgress(page, hub);
      await expect.poll(() => notices(page)).toEqual(['nudge']);

      const tree = await shadowTree(page, CHROME_HOST);
      const [note] = findNodes(tree, byAttr('data-id', 'nudge'));
      expect(note, 'nudge notice element').toBeTruthy();
      expect(textOf(note)).toContain(NUDGE_TEXT);
      const [signIn] = findNodes(note, (n) => n.localName === 'a');
      expect(attr(signIn, 'href')).toBe(`/signin?next=${hubPath(hub)}`);
      // Exposed to assistive tech as a polite live region with a named Dismiss button.
      expect(findNodes(tree, byAttr('role', 'status')).map((n) => attr(n, 'aria-live'))).toEqual(['polite']);
      const buttons = await axQuery(page, CHROME_HOST, { role: 'button', name: 'Dismiss' });
      expect(buttons.filter((b) => !b.ignored)).toHaveLength(1);

      await clickNode(page, await shadowNode(page, CHROME_HOST, byAttr('data-dismiss', 'nudge'), 'Dismiss button'));
      await expect.poll(() => notices(page)).toEqual([]);
      expect(await readItem(page, `studyhubs.ui.nudge.${hub.id}`), 'dismissal is remembered').not.toBeNull();

      // Progress is still there after a reload, but the notice stays dismissed.
      await page.reload();
      await expect.poll(async () => (await bridgeStats(page)).chrome.mounted).toBe(true);
      await settle(page);
      expect(await notices(page)).toEqual([]);
      expect(watch.errors).toEqual([]);
    });
  });
}
