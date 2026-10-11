/**
 * (i) The floating menu never covers a hub control that cannot be scrolled out from under it:
 *   - at the end of every tab, with the "saved only in this browser" notice pending: the notice
 *     stack steps aside near the page end and comes back when the page scrolls up;
 *   - the last items of sticky side columns (the Learn rail) on wide screens, where the menu
 *     sits bottom-centre (build-contracts.md section 6).
 * Phone (360 px) and desktop (1280 px) viewports. The menu's shadow root is closed, so this is
 * checked by hit-testing: a control is covered when the topmost element at one of its points is
 * the menu's host element while the control itself is hit-testable there.
 */
import { expect, test, type Page } from '@playwright/test';
import { loadCatalog, progressKey, withBridge, type HubEntry } from './support/catalog';
import { makeProgress, notices, openHub, watchPage } from './support/hub';
import { CHROME_HOST } from './support/shadow';

const VIEWPORTS = [
  { width: 360, height: 740 },
  { width: 1280, height: 800 },
];

const catalog = loadCatalog();

/** Store progress so the nudge is pending at the next load (v2: bump U.main; legacy: tick a plan box). */
async function withPendingNudge(page: Page, hub: HubEntry): Promise<void> {
  if (hub.engine === 'v2') {
    await openHub(page, hub);
    await page.evaluate((key) => {
      const raw = localStorage.getItem(key);
      if (!raw) throw new Error(`${key} was not written at first render`);
      const rec = JSON.parse(raw);
      rec.U.main = Date.now();
      localStorage.setItem(key, JSON.stringify(rec));
    }, progressKey(hub));
    await page.reload();
  } else {
    await makeProgress(page, hub);
  }
  await expect.poll(() => notices(page), { message: 'nudge pending' }).toEqual(['nudge']);
}

/** Two animation frames: scroll and ResizeObserver callbacks have run and layout is current. */
const frames = (page: Page) =>
  page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

/** Whether the notice stack is shown (the host is only as tall as the 36 px pill otherwise). */
const stackShown = (page: Page) =>
  page.evaluate((sel) => (document.querySelector(sel)?.getBoundingClientRect().height ?? 0) > 44, CHROME_HOST);

/** Scroll the page and every sticky scroller (the Learn rail) to their ends. */
async function scrollToEnd(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      const cs = getComputedStyle(el);
      if (cs.position === 'sticky' && /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight) {
        el.scrollTop = el.scrollHeight;
      }
    }
  });
  await frames(page);
}

/** Visible hub controls with at least one sample point under the menu ("text (hits/points)"). */
function coveredControls(page: Page): Promise<string[]> {
  return page.evaluate((hostSel) => {
    const host = document.querySelector(hostSel);
    if (!host) throw new Error('the floating menu is not mounted');
    const sel = 'button, a[href], input, select, textarea, summary, [role=button], [tabindex]:not([tabindex="-1"])';
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>(sel)) {
      if (host.contains(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.bottom <= 0 || r.top >= innerHeight) continue;
      let hits = 0;
      let points = 0;
      for (const fx of [0.15, 0.5, 0.85]) {
        for (const fy of [0.2, 0.5, 0.8]) {
          const x = r.left + r.width * fx;
          const y = r.top + r.height * fy;
          if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
          const stack = document.elementsFromPoint(x, y);
          // Only points where the control itself can be hit (not clipped or collapsed away).
          if (!stack.some((n) => n === el || el.contains(n))) continue;
          points++;
          if (stack[0] === host) hits++;
        }
      }
      if (hits) out.push(`${(el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 40)} (${hits}/${points})`);
    }
    return out;
  }, CHROME_HOST);
}

for (const viewport of VIEWPORTS) {
  test.describe(`floating menu at ${viewport.width}px`, () => {
    test.use({ viewport });

    // Static hubs get the menu too, but no notice: the v2 and legacy hubs cover the worst case.
    for (const hub of catalog.hubs.filter((h) => withBridge(h) && h.engine !== 'static')) {
      test(`${hub.slug}: covers no hub control at the end of any tab`, async ({ page }) => {
        const watch = await watchPage(page);
        await withPendingNudge(page, hub);

        const tabs = page.locator('nav.tabs button');
        const count = await tabs.count();
        expect(count, 'the hub has its tab bar').toBeGreaterThanOrEqual(3);
        const covered: string[] = [];
        for (let i = 0; i < count; i++) {
          const tab = tabs.nth(i);
          await tab.click();
          await expect(page.locator(`#v-${await tab.getAttribute('data-v')}`)).toBeVisible();
          await scrollToEnd(page);
          for (const c of await coveredControls(page)) covered.push(`${await tab.getAttribute('data-v')}: ${c}`);
        }
        expect(covered, 'controls under the floating menu at the end of a tab').toEqual([]);

        // The notice only stepped aside: it is still pending, and back once the page scrolls up.
        await page.locator('nav.tabs button[data-v="learn"]').click();
        await scrollToEnd(page);
        expect(await stackShown(page), 'notice stack at the page end').toBe(false);
        expect(await notices(page)).toEqual(['nudge']);
        await page.evaluate(() => window.scrollTo(0, 0));
        await frames(page);
        expect(await stackShown(page), 'notice stack at the top of the page').toBe(true);
        expect(watch.errors).toEqual([]);
      });
    }
  });
}
