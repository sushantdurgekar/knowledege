/** Run-time settings of the e2e suite, all from environment variables. */

/** The server under test. */
export const BASE_URL = (process.env.BASE_URL || 'http://127.0.0.1:10000').replace(/\/+$/, '');
export const ORIGIN = new URL(BASE_URL).origin;

/**
 * The store the server must run on (`memory` | `postgres`), from scripts/dev-e2e.sh; the M3
 * restore spec checks it through /api/admin/stats. Unset: whatever the server runs.
 */
export const E2E_STORE: string | null = process.env.E2E_STORE || null;

/** True for a server on this machine (dev, CI). A deployed site sits behind Render's edge proxy. */
export const IS_LOCAL = ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(BASE_URL).hostname);

/**
 * Whether responses must carry Strict-Transport-Security (only APP_ENV=production sends it).
 * Default: expected on https origins, refused on http ones. Override with E2E_EXPECT_HSTS=1|0.
 */
export const EXPECT_HSTS =
  process.env.E2E_EXPECT_HSTS !== undefined ? process.env.E2E_EXPECT_HSTS === '1' : BASE_URL.startsWith('https:');

/**
 * Slugs that must be in the catalog (build-contracts.md section 3, "Slugs today"), so a hub the
 * collector silently dropped fails the suite. E2E_EXPECT_SLUGS overrides it (comma-separated;
 * an empty value turns the check off).
 */
export const EXPECTED_SLUGS: string[] = (
  process.env.E2E_EXPECT_SLUGS ??
  'dsa-l1-foundation,dsa-l2-proficient,dsa-l3-specialist,ab-620,ai-103,ai-500,ai-901'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
