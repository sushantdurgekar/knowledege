/**
 * (b) Every catalog hub loads at /h/<slug> with zero console errors, zero page errors and zero
 * CSP violations (securitypolicyviolation) while every tab in `nav.tabs` is clicked. The bridge
 * is present, defines window.claude and mounts its floating menu.
 */
import { expect, test } from '@playwright/test';
import { downloadPath, hubPath, loadCatalog, withBridge } from './support/catalog';
import { bridgeStats, openHub, settle, watchPage } from './support/hub';
import { CHROME_HOST, attr, byAttr, findNodes, shadowTree, textOf } from './support/shadow';

const catalog = loadCatalog();

for (const hub of catalog.hubs) {
  test.describe(`hub ${hub.slug}`, () => {
    test('loads and every tab renders with no console, page or CSP errors', async ({ page }) => {
      const watch = await watchPage(page);
      await openHub(page, hub);

      const tabs = page.locator('nav.tabs button');
      const count = await tabs.count();
      expect(count, 'the hub has its tab bar').toBeGreaterThanOrEqual(3);
      for (let i = 0; i < count; i++) {
        const tab = tabs.nth(i);
        const name = (await tab.textContent())?.trim();
        await tab.click();
        await expect(tab, `tab "${name}" is selected`).toHaveAttribute('aria-selected', 'true');
        const view = page.locator(`#v-${await tab.getAttribute('data-v')}`);
        await expect(view, `view of tab "${name}" is shown`).toBeVisible();
      }
      await settle(page);

      expect(await watch.csp(), 'securitypolicyviolation events').toEqual([]);
      expect(watch.errors, 'console errors and page errors').toEqual([]);
      expect(watch.external, 'unexpected cross-origin requests').toEqual([]);
    });

    if (!withBridge(hub)) return;

    test('bridge boots: window.claude, stats and the floating menu', async ({ page }) => {
      const watch = await watchPage(page);
      await openHub(page, hub);

      const claude = await page.evaluate(() => {
        const c = (window as unknown as { claude?: { use?: unknown } }).claude;
        return { type: typeof c, frozen: !!c && Object.isFrozen(c), use: typeof c?.use };
      });
      expect(claude).toEqual({ type: 'object', frozen: true, use: 'function' });

      const stats = await bridgeStats(page);
      expect(stats).toMatchObject({
        hubId: hub.id,
        slug: hub.slug,
        engine: hub.engine,
        mode: 'anonymous',
        hint: false,
        network: 0,
        storage: { hooked: true, loggedOut: false },
        chrome: { mounted: true },
      });
      await expect(page.locator(CHROME_HOST)).toHaveCount(1);

      // The menu: "← All hubs" (/), "Sign in" (/signin?next=/h/<slug>), "Download" (attachment).
      const tree = await shadowTree(page, CHROME_HOST);
      const links = findNodes(tree, (n) => n.localName === 'a' && attr(n, 'class') === 'it').map((n) => ({
        text: textOf(n),
        href: attr(n, 'href'),
        download: attr(n, 'download') !== null,
      }));
      expect(links).toEqual([
        { text: '← All hubs', href: '/', download: false },
        { text: 'Sign in', href: `/signin?next=${hubPath(hub)}`, download: false },
        { text: 'Download', href: downloadPath(hub), download: true },
      ]);
      expect(findNodes(tree, byAttr('aria-label', 'Study Hubs')), 'menu is a labelled nav').toHaveLength(1);

      expect(watch.errors).toEqual([]);
    });
  });
}
