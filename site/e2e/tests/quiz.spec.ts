/**
 * Live quiz studio (admin) and rooms (players): build, host live with the run sheet, drag and
 * drop answers, end early, flashcards, and a self-paced room. Players need no account.
 */
import { expect, test, type Browser, type Page } from '@playwright/test';
import { signInAdmin } from './support/m2';

async function join(browser: Browser, pin: string, name: string): Promise<Page> {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await page.goto(`/quiz?pin=${pin}`);
  await page.getByLabel('Nickname').fill(name);
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.getByText('You’re in!')).toBeVisible();
  return page;
}

/** Drag chips with the mouse (pointer events) until they read `wanted` top to bottom. */
async function dragInto(page: Page, wanted: string[]): Promise<void> {
  const chips = page.locator('.quiz-drag .sortable__chip');
  for (let k = 0; k < wanted.length; k++) {
    const texts = await chips.locator('.sortable__text').allInnerTexts();
    const from = texts.indexOf(wanted[k]!);
    if (from === k) continue;
    const src = (await chips.nth(from).boundingBox())!;
    const dst = (await chips.nth(k).boundingBox())!;
    await page.mouse.move(src.x + 30, src.y + src.height / 2);
    await page.mouse.down();
    await page.mouse.move(src.x + 30, dst.y + 4, { steps: 8 });
    await page.mouse.up();
  }
  await expect(page.locator('.quiz-drag .sortable__text')).toHaveText(wanted);
}

test('admin builds and hosts a live quiz; players drag, vote and review flashcards', async ({ browser }) => {
  const hostContext = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await signInAdmin(hostContext);
  const host = await hostContext.newPage();
  host.on('dialog', (d) => void d.accept());

  await host.goto('/quiz/host');
  await host.getByRole('button', { name: 'Start from the example' }).click();
  await expect(host.getByText('Items (8)')).toBeVisible();
  await host.getByRole('button', { name: 'Check', exact: true }).click();
  await expect(host.getByText(/Ready: 8 items/)).toBeVisible();
  await host.getByRole('button', { name: 'Host live' }).click();
  await host.waitForURL(/\/quiz\/host\/\d{6}$/);
  const pin = host.url().split('/').pop()!;

  const ann = await join(browser, pin, 'Ann');
  const bob = await join(browser, pin, 'Bob');
  await expect(host.locator('.quiz-chip', { hasText: 'Bob' })).toBeVisible();
  await host.getByRole('button', { name: /^Start/ }).click();
  await expect(ann.getByText('How a browser reaches a website')).toBeVisible(); // a slide

  await host.getByRole('button', { name: /^Next: item 2/ }).click();
  await ann.getByRole('button', { name: /443/ }).click();
  await bob.getByRole('button', { name: /80/ }).click();
  await expect(ann.getByText('Correct!')).toBeVisible();
  await expect(bob.getByText('Not this time')).toBeVisible();

  // The run sheet opens any item next: "put in order", answered by dragging.
  await host.getByRole('button', { name: 'Run next: item 7' }).click();
  await dragInto(ann, ['SYN', 'SYN-ACK', 'ACK']);
  await ann.getByRole('button', { name: 'Submit', exact: true }).click();
  await bob.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(ann.getByText('Correct!')).toBeVisible();

  await host.getByRole('button', { name: /^Next: item 8/ }).click(); // the poll
  await ann.getByRole('button', { name: /Very/ }).click();
  await bob.getByRole('button', { name: /Not yet/ }).click();
  await expect(ann.getByText('Thanks for voting')).toBeVisible();

  await host.getByRole('button', { name: /^Next: item 3/ }).click();
  const before = Number.parseInt(await host.locator('.quiz-timer').innerText());
  await host.getByRole('button', { name: '+10 s' }).click();
  await expect
    .poll(async () => Number.parseInt(await host.locator('.quiz-timer').innerText()))
    .toBeGreaterThan(before + 5);
  await host.getByRole('button', { name: 'Close and show answer' }).click();

  // End early: scores stand and players can review the answers.
  await host.getByRole('button', { name: 'End quiz now' }).click();
  await expect(host.getByText('Final results')).toBeVisible();
  await expect(ann.getByText(/You finished #1/)).toBeVisible();
  await ann.getByRole('button', { name: 'Review with flashcards' }).click();
  await ann.getByRole('button', { name: 'Got it, next' }).click();
  await ann.getByRole('button', { name: 'Show answer' }).click();
  await expect(ann.locator('.flash__card.is-flipped')).toContainText('443');
  await host.getByRole('button', { name: 'Close room' }).click();
  await host.waitForURL(/\/quiz\/host$/);
});

test('self-paced room with flashcards first', async ({ browser }) => {
  const hostContext = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await signInAdmin(hostContext);
  const host = await hostContext.newPage();
  await host.goto('/quiz/host');
  await host.getByRole('button', { name: 'Start from the example' }).click();
  await host.getByLabel('flashcards before self-paced').check();
  await host.getByRole('button', { name: 'Start self-paced' }).click();
  await host.waitForURL(/\/quiz\/host\/\d{6}$/);
  const pin = host.url().split('/').pop()!;

  const cy = await join(browser, pin, 'Cy');
  await cy.getByRole('button', { name: 'Study the flashcards while you wait' }).click();
  await expect(cy.getByText(/Card 1 of/)).toBeVisible();
  await cy.getByRole('button', { name: 'Close', exact: true }).click();
  await host.getByRole('button', { name: /^Open the quiz/ }).click();
  await cy.getByRole('button', { name: 'Start the quiz' }).click();
  await cy.getByRole('button', { name: 'Continue' }).click();
  await cy.getByRole('button', { name: /443/ }).click();
  await expect(cy.getByText('Correct!')).toBeVisible();
  await cy.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(cy.getByText('Pick the private IPv4 ranges')).toBeVisible();
  await expect(host.locator('.self-dash__table')).toContainText('Cy');
  await host.getByRole('button', { name: 'Close the quiz and show results' }).click();
  await expect(cy.getByText('All done!').or(cy.getByText(/You finished/)).first()).toBeVisible();
});

test('non-admins cannot open the studio', async ({ page }) => {
  await page.goto('/quiz/host');
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
});
