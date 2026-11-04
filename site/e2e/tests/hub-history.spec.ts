/** Browser Back / Forward inside a hub move between its sections and modules (bridge history.ts). */
import { expect, test } from '@playwright/test';
import { hubPath, loadCatalog } from './support/catalog';

const at = (page: import('@playwright/test').Page) =>
  page.evaluate(() => ({
    hash: location.hash,
    view: document.querySelector<HTMLElement>('nav.tabs button[aria-selected="true"]')?.dataset.v,
  }));

test('Back returns to the previous hub section, then leaves the hub', async ({ page }) => {
  const hub = loadCatalog().hubs.find((h) => h.engine === 'v2')!;
  await page.goto('/');
  await page.locator(`a[href="${hubPath(hub)}"]`).first().click();
  await page.waitForURL(`**${hubPath(hub)}*`);
  const start = await at(page);
  await page.locator('nav.tabs button[data-v="learn"]').click();
  await expect.poll(() => page.evaluate(() => location.hash)).not.toBe(start.hash);
  const learn = await at(page);
  expect(learn.view).toBe('learn');
  await page.goBack();
  await expect.poll(async () => (await at(page)).view).toBe(start.view);
  await page.goForward();
  await expect.poll(async () => (await at(page)).view).toBe('learn');
  await page.goBack();
  await page.goBack();
  await page.waitForURL((url) => url.pathname === '/');
});
