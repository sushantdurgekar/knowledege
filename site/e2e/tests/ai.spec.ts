/**
 * (d) AI on v2 hubs: the AI buttons stay visible (body.has-ai) and every AI path opens the
 * bridge's "AI isn't supported here" modal instead of failing:
 *   Explain (stream, string input)  -> inline message with an absolute download link
 *   Teach-back grade (aiJSON)       -> modal, no "Stopped."
 *   Tutor chat (stream, array)      -> modal
 *   Fresh questions (aiJSON)        -> modal, no "Stopped."; its Download button saves the original
 *   Mock interview (stream, array)  -> Start and Send each open the modal; the interview stays usable
 * The modal lives in a closed shadow root: it is checked through the accessibility tree and
 * real mouse clicks (support/shadow.ts) plus window.__studyhubsBridge.stats().
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { downloadPath, loadCatalog } from './support/catalog';
import { ORIGIN } from './support/env';
import { answerItem, bridgeStats, openQuizModule, quizItem, watchPage } from './support/hub';
import { AI_DIALOG_HOST, attr, byAttr, clickNode, findNodes, shadowNode, shadowTree, textOf, visibleDialogs } from './support/shadow';

const TITLE = "AI isn't supported here";
const BODY =
  'Download this hub and use it in your own AI provider for Ask-AI features (for example, upload it to ' +
  "Claude and open it as an artifact). Your progress on this site isn't included in the file.";

const catalog = loadCatalog();

async function expectModalOpen(page: Page, opens: number) {
  await expect.poll(async () => (await bridgeStats(page)).ai.modalOpen, { message: 'modal is open' }).toBe(true);
  expect((await bridgeStats(page)).ai.modalOpens, 'modal open count').toBe(opens);
  expect(await visibleDialogs(page), 'accessible dialog').toEqual([TITLE]);
}

async function expectModalClosed(page: Page) {
  await expect.poll(async () => (await bridgeStats(page)).ai.modalOpen, { message: 'modal is closed' }).toBe(false);
  await expect(page.locator(AI_DIALOG_HOST)).toHaveCount(0);
}

const clickInModal = async (page: Page, attrName: string, what: string) =>
  clickNode(page, await shadowNode(page, AI_DIALOG_HOST, byAttr(attrName), what));

for (const hub of catalog.hubs.filter((h) => h.engine === 'v2')) {
  test.describe(`AI ${hub.slug}`, () => {
    test('every AI path opens the notice; Explain shows the download link', async ({ page }) => {
      const watch = await watchPage(page);
      const target = await openQuizModule(page, hub);
      await expect(page.locator('body')).toHaveClass(/(^|\s)has-ai(\s|$)/);
      expect(target.teach, `${hub.slug}: a module with a teach-back and a quiz`).toBe(true);

      /* 1. Explain my answer (stream path, string input) */
      await answerItem(page, target.item);
      const item = quizItem(page, target.item);
      const explain = item.locator('[data-explain]');
      await expect(explain).toBeVisible();
      await explain.click();
      await expectModalOpen(page, 1);

      // Modal content, read from the closed shadow root.
      const tree = await shadowTree(page, AI_DIALOG_HOST);
      const [dialog] = findNodes(tree, byAttr('role', 'dialog'));
      expect(attr(dialog, 'aria-modal')).toBe('true');
      expect(textOf(findNodes(dialog, (n) => n.localName === 'h2')[0])).toBe(TITLE);
      expect(textOf(findNodes(dialog, (n) => n.localName === 'p')[0])).toBe(BODY);
      const [dl] = findNodes(dialog, byAttr('data-dl'));
      expect(attr(dl, 'href')).toBe(downloadPath(hub));
      expect(attr(dl, 'download')).not.toBeNull();
      expect(textOf(dl)).toBe('Download this hub');
      expect(textOf(findNodes(dialog, byAttr('data-close'))[0])).toBe('Close');

      const out = item.locator('[data-explain-out]');
      await expect(out).toContainText("AI isn't supported here.");
      await expect(out.getByRole('link', { name: 'Download this hub' })).toHaveAttribute(
        'href',
        `${ORIGIN}${downloadPath(hub)}`,
      );
      await expect(out).not.toContainText('Something went wrong');
      await expect(out).not.toContainText('Stopped.');

      await page.keyboard.press('Escape');
      await expectModalClosed(page);
      await expect(explain, 'focus returns to the Explain button').toBeFocused();

      /* 2. Teach-back "Grade it with Claude" (aiJSON) */
      await page.locator('#tbText').fill('A stack is last in, first out: push adds on top and pop removes the top.');
      await page.locator('#tbGrade').click();
      await expectModalOpen(page, 2);
      await expect(page.locator('#tbOut')).not.toContainText('Stopped.');
      await expect(page.locator('#tbOut')).not.toContainText('Thinking');
      await clickInModal(page, 'data-close', 'Close button');
      await expectModalClosed(page);

      /* 3. Ask the tutor (stream path, array input) */
      await page.locator('#chatIn').fill('Quiz me on this module');
      await page.locator('#chatGo').click();
      await expectModalOpen(page, 3);
      await page.mouse.click(4, 4); // the backdrop covers the whole viewport, sticky header included
      await expectModalClosed(page);

      /* 4. Generate 5 fresh questions (aiJSON), then the modal's Download button */
      await page.locator('#freshQ').click();
      await expectModalOpen(page, 4);
      await expect(page.locator('#freshOut')).not.toContainText('Stopped.');
      const downloading = page.waitForEvent('download');
      await clickInModal(page, 'data-dl', 'Download this hub link');
      const download = await downloading;
      expect(download.suggestedFilename()).toBe(hub.downloadName);
      const bytes = await readFile(await download.path());
      expect(createHash('sha256').update(bytes).digest('hex'), 'downloaded file is the original').toBe(hub.sha256);
      await expectModalClosed(page);
      await expect(page.locator('#mod')).not.toContainText('Stopped.');
      await expect(page.locator('#mod')).not.toContainText("Claude isn't available on this page");

      /* 5. Interview tab "Mock interview with Claude" (stream path, array input): Start, then Send */
      await page.locator('nav.tabs button[data-v="interview"]').click();
      const start = page.locator('#ivStart');
      await expect(start).toBeVisible();
      await start.click();
      await expectModalOpen(page, 5);
      await page.keyboard.press('Escape');
      await expectModalClosed(page);
      await expect(start, 'focus returns to Start interview').toBeFocused();
      await page.locator('#ivIn').fill('I would start from the requirements and the failure modes.');
      await page.locator('#ivSend').click();
      await expectModalOpen(page, 6);
      await clickInModal(page, 'data-close', 'Close button');
      await expectModalClosed(page);
      for (const control of ['#ivStart', '#ivIn', '#ivSend']) await expect(page.locator(control)).toBeVisible();
      for (const bad of ['Stopped.', 'Something went wrong', "Claude isn't available on this page"]) {
        await expect(page.locator('#ivLog')).not.toContainText(bad);
      }

      /* Totals: each path called the shim exactly once; nothing hid the AI buttons. */
      const stats = await bridgeStats(page);
      expect(stats.ai).toEqual({ calls: 4, jsonCalls: 2, modalOpens: 6, modalOpen: false });
      await expect(page.locator('body')).toHaveClass(/(^|\s)has-ai(\s|$)/);
      expect(watch.apiPaths(), 'no /api requests').toEqual([]);
      expect(watch.errors).toEqual([]);
    });
  });
}
