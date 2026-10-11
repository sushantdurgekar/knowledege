/**
 * Helpers for driving a hub page: instrumentation (console, CSP, requests), bridge state,
 * and the few hub interactions the tests need. Selectors come from the hub engines; see
 * docs/hub-runtime-contract.md sections 1-4 and 8.
 */
import { expect, type Page } from '@playwright/test';
import { ORIGIN } from './env';
import { hubPath, progressKey, type HubEntry } from './catalog';

/* ─────────────────────────── instrumentation ─────────────────────────── */

export interface CspViolation {
  directive: string;
  blocked: string;
  sample: string;
  source: string;
  line: number;
}

export interface PageWatch {
  /** console.error, bridge warnings ("[studyhubs] …") and uncaught page errors. */
  errors: string[];
  /** Every request the page made, in order. */
  requests: URL[];
  /** Requests to other origins that are not the stubbed Google Fonts. */
  external: string[];
  /** securitypolicyviolation events recorded in the page since load. */
  csp(): Promise<CspViolation[]>;
  /** Paths of same-origin requests under /api/. */
  apiPaths(): string[];
  /** Paths of every same-origin request. */
  sameOriginPaths(): string[];
}

/**
 * Attach listeners before the first navigation.
 *
 * Google Fonts is answered locally with an empty stylesheet so runs are fast, offline-safe and
 * deterministic; the request still passes the page's CSP first (style-src allows it), so CSP
 * coverage is unchanged. Any other cross-origin request is recorded as unexpected.
 * Note: Playwright disables the HTTP cache on pages with routes; cache tests use clean pages.
 */
export async function watchPage(page: Page): Promise<PageWatch> {
  const errors: string[] = [];
  const requests: URL[] = [];
  const external: string[] = [];

  page.on('console', (msg) => {
    const text = msg.text();
    if (msg.type() === 'error') errors.push(`console.error: ${text}`);
    else if (msg.type() === 'warning' && text.startsWith('[studyhubs]')) errors.push(`bridge warning: ${text}`);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('request', (req) => requests.push(new URL(req.url())));

  await page.addInitScript(() => {
    const w = window as unknown as { __e2eCsp: unknown[] };
    w.__e2eCsp = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      w.__e2eCsp.push({
        directive: e.effectiveDirective || e.violatedDirective,
        blocked: e.blockedURI,
        sample: e.sample,
        source: e.sourceFile,
        line: e.lineNumber,
      });
    });
  });

  await page.route(
    (url) => url.origin !== ORIGIN && url.protocol.startsWith('http'),
    async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fonts.googleapis.com') {
        await route.fulfill({ status: 200, contentType: 'text/css; charset=utf-8', body: '/* e2e: fonts stubbed */' });
        return;
      }
      external.push(url.href);
      await route.fulfill({ status: 204, body: '' });
    },
  );

  const same = () => requests.filter((u) => u.origin === ORIGIN);
  return {
    errors,
    requests,
    external,
    csp: () =>
      page.evaluate(() => ((window as unknown as { __e2eCsp?: unknown[] }).__e2eCsp ?? []) as never),
    apiPaths: () => same().filter((u) => u.pathname.startsWith('/api/')).map((u) => u.pathname),
    sameOriginPaths: () => same().map((u) => u.pathname),
  };
}

/** Let queued events (CSP reports, storage writes) land: one macrotask turn in the page. */
export async function settle(page: Page, ms = 100): Promise<void> {
  await page.evaluate((delay) => new Promise((resolve) => setTimeout(resolve, delay)), ms);
}

/* ─────────────────────────── bridge state ─────────────────────────── */

/** The subset of window.__studyhubsBridge.stats() the tests read (bridge src/types.ts). */
export interface BridgeStats {
  version: string;
  hubId: string;
  slug: string;
  engine: string;
  mode: string;
  hint: boolean;
  network: number;
  ai: { calls: number; jsonCalls: number; modalOpens: number; modalOpen: boolean };
  storage: { hooked: boolean; loggedOut: boolean };
  chrome: { mounted: boolean; notices: string[] };
  legacy: { seedCalls: number; signedIn: boolean | null };
}

export async function bridgeStats(page: Page): Promise<BridgeStats> {
  const stats = await page.evaluate(() => {
    const b = (window as unknown as { __studyhubsBridge?: { stats(): unknown } }).__studyhubsBridge;
    return b ? b.stats() : null;
  });
  if (!stats) throw new Error('window.__studyhubsBridge is missing: the bridge did not load');
  return stats as BridgeStats;
}

export const notices = async (page: Page): Promise<string[]> => (await bridgeStats(page)).chrome.notices;

/* ─────────────────────────── storage ─────────────────────────── */

export async function readJson<T = Record<string, unknown>>(page: Page, key: string): Promise<T | null> {
  return page.evaluate((k) => {
    const raw = localStorage.getItem(k);
    if (raw == null) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return { __unparsable: raw };
    }
  }, key) as Promise<T | null>;
}

export async function readItem(page: Page, key: string): Promise<string | null> {
  return page.evaluate((k) => localStorage.getItem(k), key);
}

export interface HubRecord {
  S: { done?: Record<string, unknown>; dstat?: Record<string, unknown> } & Record<string, unknown>;
  U: { main: number; mocks: number; cards: number };
}

/** `U.main` of a v2 hub's progress record (0 when there is none yet). */
export async function mainUpd(page: Page, hub: HubEntry): Promise<number> {
  const rec = await readJson<HubRecord>(page, progressKey(hub));
  return rec?.U?.main ?? 0;
}

/* ─────────────────────────── hub interactions ─────────────────────────── */

export async function openHub(page: Page, hub: HubEntry, hash = ''): Promise<void> {
  const response = await page.goto(hubPath(hub) + hash);
  expect(response?.status(), `GET ${hubPath(hub)}`).toBe(200);
}

export interface QuizTarget {
  moduleId: string;
  /** Index of the first single-answer (mc) item in the module quiz (`#mq .q[data-k]`). */
  item: number;
  teach: boolean;
}

/**
 * Open (by `#<moduleId>` deep link and a reload) a module whose quiz has a single-answer item,
 * preferring one with a teach-back, and return where that item is. v2 hubs only.
 */
export async function openQuizModule(page: Page, hub: HubEntry): Promise<QuizTarget> {
  await openHub(page, hub);
  const target = await page.evaluate(() => {
    type Q = { t?: string };
    type M = { id: string; teach?: unknown; quiz?: Q[] };
    const mods: M[] = ((window as unknown as { HUB?: { modules?: M[] } }).HUB?.modules ?? []).slice();
    // The engine sets q.t while indexing items ("mc" = one answer, answered by one click).
    const firstMc = (m: M) => (m.quiz ?? []).findIndex((q) => q.t === 'mc');
    const pick = mods.find((m) => m.teach && firstMc(m) >= 0) ?? mods.find((m) => firstMc(m) >= 0);
    return pick ? { moduleId: pick.id, item: firstMc(pick), teach: !!pick.teach } : null;
  });
  if (!target) throw new Error(`${hub.slug}: no module has a single-answer quiz item`);
  // The hub reads location.hash once at boot, so set it and reload.
  await page.evaluate((id) => {
    location.hash = id;
  }, target.moduleId);
  await page.reload();
  await expect(quizItem(page, target.item)).toBeVisible();
  return target;
}

export const quizItem = (page: Page, index: number) => page.locator(`#mq .q[data-k="${index}"]`);

/** Answer a single-answer quiz item with its first option and wait for the review to render. */
export async function answerItem(page: Page, index: number): Promise<void> {
  const item = quizItem(page, index);
  await item.locator('button.opt').first().click();
  await expect(item.locator('.expl')).toBeVisible();
}

/**
 * Make the first bit of learner progress the hub persists: answer a quiz item (v2) or tick
 * the first 3-day-plan checkbox (legacy AI-901, which has no account sync of its own).
 */
export async function makeProgress(page: Page, hub: HubEntry): Promise<void> {
  if (hub.engine === 'v2') {
    const target = await openQuizModule(page, hub);
    await answerItem(page, target.item);
    await expect.poll(() => mainUpd(page, hub), { message: 'U.main after answering' }).toBeGreaterThan(0);
  } else if (hub.engine === 'legacy') {
    await openHub(page, hub);
    const box = page.locator('#v-plan input[type="checkbox"]').first();
    await box.check();
    const key = hub.legacyKeys[0];
    await expect
      .poll(async () => Object.values((await readJson<{ plan?: object }>(page, key))?.plan ?? {}).filter(Boolean).length)
      .toBe(1);
  } else {
    throw new Error(`${hub.slug}: engine ${hub.engine} has no progress to make`);
  }
}
