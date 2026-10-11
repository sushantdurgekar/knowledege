/**
 * (a) The catalog page lists every hub from /catalog.json with working Open and Download
 * links, and shows the progress a hub saved in this browser.
 */
import { expect, test } from '@playwright/test';
import { downloadPath, hubPath, loadCatalog, withBridge, type HubEntry } from './support/catalog';
import { EXPECTED_SLUGS } from './support/env';
import { bridgeStats, openHub, watchPage } from './support/hub';

const catalog = loadCatalog();

test.describe('catalog', () => {
  test('catalog.json is well-formed and holds the published hubs @smoke', async () => {
    expect(catalog.version).toBe(1);
    expect(catalog.hubs.length).toBeGreaterThan(0);
    const slugs = catalog.hubs.map((h) => h.slug);
    const ids = catalog.hubs.map((h) => h.id);
    expect(new Set(slugs).size, 'slugs are unique').toBe(slugs.length);
    expect(new Set(ids).size, 'ids are unique').toBe(ids.length);
    for (const slug of EXPECTED_SLUGS) expect(slugs, `catalog has ${slug}`).toContain(slug);
    for (const hub of catalog.hubs) {
      expect(hub.slug).toMatch(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/);
      expect(hub.id).toMatch(/^[a-z0-9][a-z0-9-]{1,40}$/);
      expect(['v2', 'legacy', 'static']).toContain(hub.engine);
      expect(['level', 'cert']).toContain(hub.kind);
      expect(hub.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(hub.bytes).toBeGreaterThan(0);
      expect(hub.brBytes).toBeGreaterThan(0);
      expect(hub.downloadName).toMatch(/\.html$/);
      if (hub.engine === 'v2') expect(hub.storageKeys[0]).toBe(`studyhub.${hub.id}.v2`);
      if (hub.engine === 'legacy') expect(hub.legacyKeys.length).toBeGreaterThan(0);
      // The public catalog never exposes vault paths or the CSP (those stay internal).
      expect(Object.keys(hub)).not.toContain('source');
      expect(Object.keys(hub)).not.toContain('csp');
    }
  });

  test('lists every hub with working Open and Download links @smoke', async ({ page, request }) => {
    const watch = await watchPage(page);
    await page.goto('/');
    await expect(page.locator('article.hub-card')).toHaveCount(catalog.hubs.length);

    for (const hub of catalog.hubs) {
      const open = page.locator(`a[href="${hubPath(hub)}"]`);
      await expect(open, `${hub.slug}: one Open link`).toHaveCount(1);
      await expect(open).toHaveAccessibleName(/^Open\b/);
      await expect(open).toBeVisible();

      const download = page.locator(`a[href="${downloadPath(hub)}"]`);
      await expect(download, `${hub.slug}: one Download link`).toHaveCount(1);
      await expect(download).toHaveAccessibleName(/^Download\b/);
      await expect(download).toHaveAttribute('download', /.*/);

      const card = page.locator('article.hub-card', { has: open });
      await expect(card).toContainText(hub.title);

      // The links work: the hub page and the attachment both answer 200.
      const page200 = await request.head(hubPath(hub));
      expect(page200.status(), `HEAD ${hubPath(hub)}`).toBe(200);
      expect(page200.headers()['content-type']).toContain('text/html');
      const dl = await request.head(downloadPath(hub));
      expect(dl.status(), `HEAD ${downloadPath(hub)}`).toBe(200);
      expect(dl.headers()['content-disposition']).toMatch(/^attachment;/);
    }

    expect(watch.errors).toEqual([]);
    expect(watch.external).toEqual([]);
  });

  test('Open navigates to the hub and Back returns to the catalog', async ({ page }) => {
    const hub = catalog.hubs.find(withBridge) ?? catalog.hubs[0];
    const watch = await watchPage(page);
    await page.goto('/');
    await page.locator(`a[href="${hubPath(hub)}"]`).click();
    await expect(page).toHaveURL(new RegExp(`${hubPath(hub)}$`));
    // The URL changes when the navigation commits; the bridge has run once the DOM is parsed.
    await page.waitForLoadState('domcontentloaded');
    if (withBridge(hub)) expect((await bridgeStats(page)).slug).toBe(hub.slug);
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('article.hub-card')).toHaveCount(catalog.hubs.length);
    expect(watch.errors).toEqual([]);
  });
});

/** A hub's own "Mark module done" button: both engines render #doneM in the Learn view. */
async function markFirstModuleDone(page: import('@playwright/test').Page, hub: HubEntry) {
  await openHub(page, hub);
  await page.locator('nav.tabs button[data-v="learn"]').click();
  const done = page.locator('#doneM');
  await expect(done).toHaveText('Mark module done');
  await done.click();
  await expect(page.locator('#doneM')).toHaveText(/Marked done/);
}

test.describe('catalog shows progress saved in this browser', () => {
  for (const hub of catalog.hubs.filter(withBridge)) {
    test(`${hub.slug}: 1 module done shows on its card`, async ({ page }) => {
      const watch = await watchPage(page);
      await markFirstModuleDone(page, hub);
      await page.goto('/');
      const card = page.locator('article.hub-card', { has: page.locator(`a[href="${hubPath(hub)}"]`) });
      await expect(card).toContainText(`1 / ${hub.modules} modules`);
      expect(watch.errors).toEqual([]);
    });
  }
});
