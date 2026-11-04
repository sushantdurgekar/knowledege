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
  await host.getByRole('button', { name: 'Quick example' }).click();
  await expect(host.getByText('Items (8)')).toBeVisible();
  await host.getByRole('button', { name: 'Check', exact: true }).click();
  await expect(host.getByText(/Ready: 8 items/)).toBeVisible();
  await host.getByRole('button', { name: 'Host live' }).click();
  await host.getByRole('dialog').getByRole('button', { name: 'Open the room' }).click();
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
  await host.getByRole('button', { name: 'Quick example' }).click();
  await expect(host.getByText('Items (8)')).toBeVisible();
  await host.getByRole('button', { name: 'Self-paced challenge' }).click();
  const dialog = host.getByRole('dialog');
  await dialog.getByLabel('Let players study flashcards first').check();
  await dialog.getByRole('button', { name: 'Open the challenge' }).click();
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
  await expect(host.locator('.self-dash__table').first()).toContainText('Cy');
  await host.getByRole('button', { name: 'Close the quiz and show results' }).click();
  await expect(cy.getByText('All done!').or(cy.getByText(/You finished/)).first()).toBeVisible();
});

test('non-admins cannot open the studio', async ({ page }) => {
  await page.goto('/quiz/host');
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
});

test('advanced quiz: confidence, hints, teach-back, calibration, replay and the review deck', async ({ browser }) => {
  const hostContext = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await signInAdmin(hostContext);
  const host = await hostContext.newPage();
  host.on('dialog', (d) => void d.accept());
  await host.goto('/quiz/host');
  await host.getByRole('button', { name: 'Advanced example' }).click();
  await expect(host.getByText('Items (4)')).toBeVisible();
  await expect(host.getByLabel('Advanced')).toBeChecked();
  await expect(host.getByText('Saved', { exact: true })).toBeVisible();
  await host.getByRole('button', { name: 'Host live' }).click();
  await host.getByRole('dialog').getByRole('button', { name: 'Open the room' }).click();
  await host.waitForURL(/\/quiz\/host\/\d{6}$/);
  const pin = host.url().split('/').pop()!;

  const ann = await join(browser, pin, 'Ann');
  await host.getByRole('button', { name: /^Start/ }).click();
  await host.getByRole('button', { name: /^Next: item 2/ }).click();
  // Confidence first: the answers stay disabled until Ann says how sure she is.
  await expect(ann.getByRole('button', { name: /443/ })).toBeDisabled();
  await ann.getByRole('button', { name: 'Show a hint (−25% points)' }).click();
  await expect(ann.getByText(/The S stands for secure/)).toBeVisible();
  await ann.getByRole('radio', { name: 'I’m sure' }).click();
  await ann.getByRole('button', { name: /80/ }).click(); // sure, but wrong
  await expect(ann.getByText('Not this time')).toBeVisible();
  await expect(host.getByText(/1 sure but wrong/)).toBeVisible();

  await host.getByRole('button', { name: 'Run next: item 4' }).click(); // teach-back
  await ann.getByLabel(/Explain it in your own words/).fill('TLS encrypts the bytes TCP delivers');
  await ann.getByRole('button', { name: 'Send' }).click();
  await expect(host.locator('.quiz-responses')).toContainText('TLS encrypts the bytes TCP delivers');
  await expect(ann.getByText(/A model answer:/)).toBeVisible();

  await host.getByRole('button', { name: 'End quiz now' }).click();
  await expect(host.getByRole('heading', { name: 'Insights' })).toBeVisible();
  await expect(ann.getByText('Sure but wrong')).toBeVisible();
  await expect(ann.getByRole('link', { name: /due for review now/ })).toBeVisible();

  await ann.getByRole('button', { name: 'Replay my mistakes' }).click();
  await ann.getByRole('button', { name: /443/ }).click();
  await expect(ann.getByText('Got it now!')).toBeVisible();
  await ann.getByRole('button', { name: 'Next', exact: true }).click();
  await ann.getByRole('button', { name: 'Close', exact: true }).or(ann.getByRole('button', { name: 'Done' })).first().click();

  await ann.goto('/quiz/review');
  await expect(ann.getByRole('heading', { name: 'Review deck' })).toBeVisible();
  await ann.getByRole('button', { name: 'Show answer' }).click();
  await ann.getByRole('button', { name: /^Good/ }).click();
  await expect(ann.getByText(/reviewed this session/)).toContainText('1');
  await expect(ann.locator('.review__history')).toContainText('Networking basics (advanced)');
});

test('admin builds a quiz from a study hub', async ({ browser }) => {
  const hostContext = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await signInAdmin(hostContext);
  const host = await hostContext.newPage();
  await host.goto('/quiz/host');
  await host.getByRole('button', { name: /From a study hub/ }).click();
  const hub = host.getByRole('combobox', { name: 'Hub', exact: true });
  await expect(hub.locator('option')).not.toHaveCount(1);
  await hub.selectOption({ index: 1 });
  await host.locator('.bank__modules input[type=checkbox]').first().check();
  await host.getByRole('button', { name: 'Create quiz' }).click();
  await host.waitForURL(/\/quiz\/host\/edit\//);
  await expect(host.locator('.editor__list .sortable__chip').first()).toContainText('Slide');
  await host.getByRole('button', { name: 'Check', exact: true }).click();
  await expect(host.getByText(/Ready: \d+ items/)).toBeVisible();
});

test('presenter screen follows the host without early answers; the public board shows standings', async ({ browser }) => {
  const hostContext = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await signInAdmin(hostContext);
  const host = await hostContext.newPage();
  await host.goto('/quiz/host');
  await host.getByRole('button', { name: 'Quick example' }).click();
  await expect(host.getByText('Items (8)')).toBeVisible();
  await host.getByRole('button', { name: 'Host live' }).click();
  await host.getByRole('dialog').getByRole('button', { name: 'Open the room' }).click();
  await host.waitForURL(/\/quiz\/host\/\d{6}$/);
  const pin = host.url().split('/').pop()!;
  await host.getByText(/Present on another screen/).click();
  const link = await host.locator('.share-row__url').first().innerText();
  expect(link).toMatch(new RegExp(`/quiz/present/${pin}#k=`));

  const presenter = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  await presenter.goto(link);
  await expect(presenter.locator('.present__pin')).toHaveText(pin);
  await expect(presenter.getByRole('banner')).toHaveCount(0); // no site header on the projector
  const ann = await join(browser, pin, 'Ann');
  await join(browser, pin, 'Bob');
  await expect(presenter.locator('.present__chips li')).toHaveCount(2);

  await host.getByRole('button', { name: /^Start/ }).click();
  await host.getByRole('button', { name: /^Next: item 2/ }).click();
  await expect(presenter.locator('.present__q')).toHaveText('Which port does HTTPS use by default?');
  await expect(presenter.locator('.quiz-solution')).toHaveCount(0); // no answer before the reveal
  await ann.getByRole('button', { name: /443/ }).click();
  await expect(presenter.getByText(/1 of 2 answered/)).toBeVisible();
  await host.getByRole('button', { name: 'Close and show answer' }).click();
  await expect(presenter.locator('.quiz-solution__row.is-right')).toContainText('443');
  await expect(presenter.locator('.quiz-board__row').first()).toContainText('Ann');

  const watcher = await (await browser.newContext()).newPage();
  await watcher.goto('/quiz');
  await watcher.getByLabel('Just watching? Follow the leaderboard').fill(pin);
  await watcher.getByRole('button', { name: 'Watch' }).click();
  await expect(watcher.locator('.quiz-board__row').first()).toContainText('Ann');
  await expect(watcher.getByText(/Just answered: 2 of 8/)).toBeVisible();

  const bad = await (await browser.newContext()).newPage();
  await bad.goto(`/quiz/present/${pin}#k=wrong`);
  await expect(bad.getByText(/not valid/)).toBeVisible();
});

test('teams, QR code and a picture: live room in two teams', async ({ browser }) => {
  const hostContext = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await signInAdmin(hostContext);
  const host = await hostContext.newPage();
  host.on('dialog', (d) => void d.accept());
  await host.goto('/quiz/host');
  await host.getByRole('button', { name: 'Quick example' }).click();
  await expect(host.getByText('Items (8)')).toBeVisible();
  // Attach a picture to item 2 (a 1x1 PNG; the browser shrinks and uploads it).
  await host.locator('.editor__list .sortable__chip').nth(1).click();
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  await host.locator('.editor__image input[type=file]').setInputFiles({ name: 'dot.png', mimeType: 'image/png', buffer: png });
  await expect(host.locator('.editor__image img')).toBeVisible();
  await expect(host.getByText('Saved', { exact: true })).toBeVisible();

  await host.getByRole('button', { name: 'Host live' }).click();
  const dialog = host.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Teams' }).selectOption('2');
  await dialog.getByRole('button', { name: 'Open the room' }).click();
  await host.waitForURL(/\/quiz\/host\/\d{6}$/);
  const pin = host.url().split('/').pop()!;
  await expect(host.getByRole('img', { name: `QR code to join room ${pin}` })).toBeVisible();

  const ann = await join(browser, pin, 'Ann');
  const bob = await join(browser, pin, 'Bob');
  await expect(ann.locator('.team-chip')).toHaveText('Team Violet');
  await expect(bob.locator('.team-chip')).toHaveText('Team Teal');
  await host.getByRole('button', { name: /^Start/ }).click();
  await host.getByRole('button', { name: /^Next: item 2/ }).click();
  await expect(ann.locator('.quiz-image img')).toBeVisible();
  await ann.getByRole('button', { name: /443/ }).click();
  await bob.getByRole('button', { name: /80/ }).click();
  await expect(host.locator('.team-board__row').first()).toContainText('Team Violet');
  await host.getByRole('button', { name: 'End quiz now' }).click();
  await expect(ann.locator('.team-board__row.is-me')).toContainText('Violet');
});
