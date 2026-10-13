/**
 * Playwright config for the Study Hubs e2e suite (M0 and M1 acceptance, build-contracts.md).
 *
 * Two projects:
 *   - chromium: the M0 specs (static site, anonymous visitors), fully parallel.
 *   - sync:     the M1 specs (tests/sync-*.spec.ts: fake sign-in, signed-in sync). They reset
 *               the server's memory store and set faults, quota and clock offsets that the whole
 *               server shares, so they run one test at a time (workers: 1), alongside M0.
 *               The server must run with APP_ENV=test AUTH_MODE=fake STORE=memory.
 *
 * The suite runs against a live server; it never starts one itself:
 *   - local:  sh ../scripts/dev-e2e.sh          (starts uvicorn, runs this suite, stops it)
 *   - manual: make -C .. serve, then npx playwright test
 *   - remote: BASE_URL=https://study-hubs.onrender.com npx playwright test --grep @smoke
 *
 * Chromium only. Browsers are never downloaded by this config: Playwright uses
 * PLAYWRIGHT_BROWSERS_PATH (preinstalled browsers) or its default cache, which CI fills with
 * `npx playwright install --with-deps chromium`.
 */
import fs from 'node:fs';
import { defineConfig, devices } from '@playwright/test';
import { BASE_URL } from './tests/support/env';

// Containers that ship browsers in a fixed folder (this repo's dev container: /opt/pw-browsers)
// work without extra setup. An explicit PLAYWRIGHT_BROWSERS_PATH always wins.
const PREINSTALLED = '/opt/pw-browsers';
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync(PREINSTALLED)) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = PREINSTALLED;
}

const CI = !!process.env.CI;

/** M1 specs: they change state the whole server shares (see the header). */
const SYNC_SPECS = '**/sync-*.spec.ts';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  // One uvicorn worker serves every test; four browsers keep it busy without timeouts.
  workers: process.env.E2E_WORKERS ? Number(process.env.E2E_WORKERS) : CI ? 2 : 4,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: CI
    ? [['github'], ['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  outputDir: 'test-results',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'en-US',
    // A brand-new profile per test: empty localStorage, no cookies (anonymous visitor).
    serviceWorkers: 'block',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: SYNC_SPECS,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'sync',
      testMatch: SYNC_SPECS,
      fullyParallel: false,
      workers: 1,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
