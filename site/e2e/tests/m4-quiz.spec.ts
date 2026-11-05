/**
 * Live quiz studio (admin) and rooms (players): build, host live with the run sheet, drag and
 * drop answers, end early, flashcards, and a self-paced room. Players need no account.
 */
import fs from 'node:fs/promises';
import { expect, test, type Browser, type Download, type Page } from '@playwright/test';
import { signInAdmin } from './support/m2';

async function join(browser: Browser, pin: string, name: string): Promise<Page> {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await page.goto(`/quiz?pin=${pin}`);
  await page.getByLabel('Nickname').fill(name);
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.getByText('You’re in!')).toBeVisible();
  return page;
}

/** The JSON a download saved. */
async function downloadedJson(download: Download): Promise<Record<string, unknown>[]> {
  return JSON.parse(await fs.readFile((await download.path())!, 'utf8')) as Record<string, unknown>[];
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
  // The host takes every question to the Knowledge vault; the one the room missed is tagged.
  const [hostExport] = await Promise.all([
    host.waitForEvent('download'),
    host.getByRole('button', { name: 'Export the questions to my vault' }).click(),
  ]);
  expect(hostExport.suggestedFilename()).toBe('quiz-networking-basics-advanced-vault-cards.json');
  const roomCards = await downloadedJson(hostExport);
  expect(roomCards.every((c) => c.deck === 'quiz-networking-basics-advanced' && c.track === 'technical')).toBe(true);
  expect(roomCards.find((c) => String(c.front).startsWith('Which port does HTTPS'))!.tags).toContain('missed-by-room');
  await expect(host.getByText(/srs\.py --deck-file practice\/srs\/cards\.jsonl add --json-file/)).toBeVisible();
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

  // Her own deck goes to the vault with its review schedule.
  const [mine] = await Promise.all([ann.waitForEvent('download'), ann.getByRole('button', { name: 'Export to my Knowledge vault' }).click()]);
  expect(mine.suggestedFilename()).toBe('my-review-deck-vault-cards.json');
  const myCards = await downloadedJson(mine);
  expect(myCards.length).toBeGreaterThan(0);
  expect(myCards[0]).toMatchObject({ track: 'technical', deck: 'quiz-networking-basics-advanced' });
  expect(myCards[0]!.due).toMatch(/^\d{4}-\d{2}-\d{2}$/);

  // Progress across quizzes: one quiz, a one-day streak (played + reviewed today), calibration.
  await ann.getByRole('link', { name: 'See your progress' }).click();
  await expect(ann.getByRole('heading', { level: 1, name: 'My progress' })).toBeVisible();
  await expect(ann.locator('.stat', { hasText: 'Quizzes played' })).toContainText('1');
  await expect(ann.locator('.stat', { hasText: 'Study streak' })).toContainText('1 day');
  await expect(ann.getByRole('img', { name: /Accuracy in your last 1 quizzes/ })).toBeVisible();
  await expect(ann.getByRole('heading', { name: 'How sure were you?' })).toBeVisible();
  await expect(ann.locator('.calib__warn')).toContainText('1');
  await expect(ann.getByRole('img', { name: /reviews due over the next 14 days/ })).toBeVisible();
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
  // No ANTHROPIC_API_KEY on the test server: no AI button.
  await expect(host.getByRole('button', { name: 'Draft with AI' })).toHaveCount(0);
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

  const presenterContext = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  // Count the notes the presenter synthesises (Web Audio oscillators).
  await presenterContext.addInitScript(() => {
    const w = window as unknown as { notes: number };
    w.notes = 0;
    const create = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function (this: AudioContext) {
      w.notes += 1;
      return create.call(this);
    };
  });
  const presenter = await presenterContext.newPage();
  const notes = () => presenter.evaluate(() => (window as unknown as { notes: number }).notes);
  await presenter.goto(link);
  await expect(presenter.locator('.present__pin')).toHaveText(pin);
  await expect(presenter.getByRole('banner')).toHaveCount(0); // no site header on the projector
  await expect(presenter.getByText('Click anywhere to allow sound')).toBeVisible();
  await presenter.locator('.present__stage').click(); // the gesture browsers want before audio
  await expect(presenter.getByText('Click anywhere to allow sound')).toHaveCount(0);
  const ann = await join(browser, pin, 'Ann');
  await join(browser, pin, 'Bob');
  await expect(presenter.locator('.present__chips li')).toHaveCount(2);
  await expect.poll(notes).toBeGreaterThan(0); // a pop per join

  await host.getByRole('button', { name: /^Start/ }).click();
  await host.getByRole('button', { name: /^Next: item 2/ }).click();
  await expect(presenter.locator('.present__q')).toHaveText('Which port does HTTPS use by default?');
  await expect(presenter.getByRole('timer')).toHaveAccessibleName(/\d+ seconds left/);
  await expect(presenter.locator('.quiz-solution')).toHaveCount(0); // no answer before the reveal
  await ann.getByRole('button', { name: /443/ }).click();
  await expect(presenter.getByText(/1 of 2 answered/)).toBeVisible();
  await host.getByRole('button', { name: 'Close and show answer' }).click();
  await expect(presenter.locator('.quiz-solution__row.is-right')).toContainText('443');
  await expect(presenter.locator('.quiz-board__row').first()).toContainText('Ann');

  // Mute: remembered after a reload, and nothing more plays.
  await presenter.getByRole('button', { name: 'Sound on' }).click();
  await expect(presenter.getByRole('button', { name: 'Sound off' })).toHaveAttribute('aria-pressed', 'false');
  await presenter.reload();
  await expect(presenter.getByRole('button', { name: 'Sound off' })).toBeVisible();
  await expect(presenter.getByText('Click anywhere to allow sound')).toHaveCount(0);

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

test('game options: friendly names, reactions, slider, word cloud, auto-play and the full report', async ({ browser }) => {
  test.setTimeout(120_000);
  const hostContext = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await signInAdmin(hostContext);
  const host = await hostContext.newPage();
  host.on('dialog', (d) => void d.accept());
  await host.goto('/quiz/host');
  await host.getByRole('button', { name: 'Quick example' }).click();
  await expect(host.getByText('Items (8)')).toBeVisible();

  // A slider and a word cloud after the opening slide.
  await host.locator('.editor__type', { hasText: 'Slider' }).click();
  await host.getByLabel('Question', { exact: true }).fill('How many bits are in a byte?');
  await host.getByLabel('Min', { exact: true }).fill('0');
  await host.getByLabel('Max', { exact: true }).fill('16');
  await host.getByLabel('Right number', { exact: true }).fill('8');
  await host.locator('.editor__type', { hasText: 'Word cloud' }).click();
  await host.getByLabel('Question', { exact: true }).fill('One word for HTTPS');
  await host.getByRole('button', { name: 'Check', exact: true }).click();
  await expect(host.getByText(/Ready: 10 items/)).toBeVisible();

  await host.getByRole('button', { name: 'Host live' }).click();
  const dialog = host.getByRole('dialog');
  await dialog.getByText('Game options').click();
  await dialog.getByLabel('Auto-play').selectOption('5');
  await dialog.getByLabel(/Friendly names only/).check();
  await dialog.getByRole('button', { name: 'Open the room' }).click();
  await host.waitForURL(/\/quiz\/host\/\d{6}$/);
  const pin = host.url().split('/').pop()!;
  await expect(host.locator('.quiz-optchips')).toContainText('Friendly names only');

  await host.getByText(/Present on another screen/).click();
  const link = await host.locator('.share-row__url').first().innerText();
  const presenter = await (await browser.newContext({ viewport: { width: 1440, height: 860 } })).newPage();
  await presenter.goto(link);
  await presenter.locator('.present__stage').click(); // allow sound

  // Friendly names only: no free-text nickname, pick a generated one.
  const ann = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await ann.goto(`/quiz?pin=${pin}`);
  await expect(ann.getByText('Joining “Networking basics”')).toBeVisible();
  await expect(ann.getByLabel('Nickname')).toHaveCount(0);
  const choice = ann.getByRole('radio').first();
  const annName = (await choice.innerText()).trim();
  await choice.click();
  await ann.getByRole('button', { name: 'Join' }).click();
  await expect(ann.getByText('You’re in!')).toBeVisible();
  await expect(presenter.locator('.present__chips li')).toHaveText([annName]);

  // A reaction floats up the presenter screen.
  await ann.getByRole('button', { name: 'React 👏' }).click();
  await expect(presenter.locator('.present__reactions span').first()).toHaveText('👏');

  await host.getByRole('button', { name: /^Start/ }).click();
  await host.getByRole('button', { name: /^Next: item 2/ }).click();
  await expect(presenter.locator('.present__q')).toHaveText('How many bits are in a byte?');
  const exact = ann.getByLabel('Exact value');
  await exact.fill('8');
  await ann.getByRole('button', { name: 'Lock it in' }).click();
  await expect(ann.getByText('Correct!')).toBeVisible();
  await expect(presenter.locator('.quiz-spread')).toBeVisible();

  // Auto-play: after 5 s of results the word cloud opens with no click from the host.
  await expect(host.getByText(/Auto-play: next item in/)).toBeVisible();
  await expect(presenter.locator('.present__q')).toHaveText('One word for HTTPS', { timeout: 15_000 });
  await ann.getByLabel('A word or two').fill('Secure!');
  await ann.getByRole('button', { name: 'Send' }).click();
  await expect(ann.getByText('You’re in the cloud')).toBeVisible();
  await expect(presenter.locator('.quiz-cloud')).toContainText('secure');

  await host.getByRole('button', { name: 'End quiz now' }).click();
  await expect(presenter.locator('.confetti')).toHaveCount(1);
  const [report] = await Promise.all([
    host.waitForEvent('download'),
    host.getByRole('button', { name: 'Full report: every answer (CSV)' }).click(),
  ]);
  expect(report.suggestedFilename()).toBe(`quiz-${pin}-full-report.csv`);
  const csv = await fs.readFile((await report.path())!, 'utf8');
  expect(csv.split('\r\n')[0]).toContain('"Player","Team","Rank","Item","Type","Question","Answer","Result"');
  expect(csv).toContain(`"${annName}","","1","2","slider","How many bits are in a byte?","8","right"`);
  expect(csv).toContain('"cloud","One word for HTTPS","Secure!","not scored"');
});
