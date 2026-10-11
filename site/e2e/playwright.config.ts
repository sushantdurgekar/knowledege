/**
 * Playwright config for the Study Hubs e2e suite (M0 acceptance, build-contracts.md).
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
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
