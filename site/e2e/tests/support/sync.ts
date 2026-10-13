/**
 * Helpers for the M1 sync scenarios (build-contracts.md sections 9, 10, 15 and 16).
 *
 * The server under test must run with APP_ENV=test, AUTH_MODE=fake and STORE=memory
 * (scripts/dev-e2e.sh starts it that way): tests sign in with "fake:" ID tokens and drive
 * the test-only routes under /api/test/* (faults, clock, quota, reset, store dump).
 *
 * Every test-only route changes state the whole server shares, so the specs that use them
 * live in the `sync` Playwright project, which runs one test at a time.
 */
import { expect, type APIRequestContext, type BrowserContext, type Page, type Request } from '@playwright/test';
import { ORIGIN } from './env';
import { loadCatalog, progressKey, type HubEntry } from './catalog';
import { readJson, type HubRecord } from './hub';
import { CHROME_HOST, shadowTree, type DomNode } from './shadow';

/** Test routes need the protocol header; a missing Origin is accepted there. */
const TEST_HEADERS = { 'X-StudyHubs': '1' };
/** Any other state-changing /api request: protocol header and the server's own Origin (CSRF, §9). */
export const API_HEADERS = { 'X-StudyHubs': '1', Origin: ORIGIN };

export type Part = 'main' | 'mocks' | 'cards' | 'legacy';

/* ─────────────────────────── hubs ─────────────────────────── */

const catalog = loadCatalog();

/** The v2 hub the scenarios use (DSA L1 when present, else the first v2 hub). */
export const V2_HUB: HubEntry =
  catalog.hubs.find((h) => h.slug === 'dsa-l1-foundation') ??
  catalog.hubs.find((h) => h.engine === 'v2') ??
  (() => {
    throw new Error('the catalog has no v2 hub');
  })();

/** The legacy hub (AI-901), or null when the catalog has none. */
export const LEGACY_HUB: HubEntry | null = catalog.hubs.find((h) => h.engine === 'legacy') ?? null;

/* ─────────────────────────── test-only routes (§15) ─────────────────────────── */

/**
 * Run an API call, once more if the socket was reset. uvicorn closes idle keep-alive
 * connections after 5 s; a request that reuses one at that instant fails with ECONNRESET
 * before the server reads it, so repeating it is safe.
 */
async function retryReset<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (e) {
    if (!/ECONNRESET|socket hang up/.test(String((e as Error).message))) throw e;
    return call();
  }
}

export async function resetServer(request: APIRequestContext): Promise<void> {
  const r = await retryReset(() => request.post('/api/test/reset', { headers: TEST_HEADERS }));
  expect(r.status(), 'POST /api/test/reset (is the server running with APP_ENV=test?)').toBe(204);
}

export interface FaultSpec {
  op: 'get' | 'put' | 'any';
  status: number;
  code: string;
  retryAfter?: number;
  count?: number;
}

export async function injectFault(request: APIRequestContext, fault: FaultSpec): Promise<void> {
  const r = await retryReset(() => request.post('/api/test/faults', { headers: TEST_HEADERS, data: fault }));
  expect(r.status(), `POST /api/test/faults ${JSON.stringify(fault)}`).toBe(200);
}

/** Shift the server clock by `offsetMs` from real time (0 restores it). */
export async function setServerClock(request: APIRequestContext, offsetMs: number): Promise<void> {
  const r = await retryReset(() =>
    request.post('/api/test/clock', { headers: TEST_HEADERS, data: { offsetMs: Math.round(offsetMs) } }),
  );
  expect(r.status(), 'POST /api/test/clock').toBe(200);
}

export interface QuotaReply {
  today: Record<string, number>;
  policy: { tier: number | 'paused'; flushMs: number; hiddenMinMs: number; refreshMs: number; pausedUntil: string | null };
}

/** Set today's meter. The sync budget is QUOTA_WRITES × (1 − QUOTA_RESERVE) = 19,000 by default. */
export async function setQuota(request: APIRequestContext, values: { writes?: number; reads?: number }): Promise<QuotaReply> {
  const r = await retryReset(() => request.post('/api/test/quota', { headers: TEST_HEADERS, data: values }));
  expect(r.status(), 'POST /api/test/quota').toBe(200);
  return (await r.json()) as QuotaReply;
}

/** Default daily write budget (build-contracts §8: 20,000 × (1 − 0.05)). */
export const WRITE_BUDGET = 19_000;

export interface StoredPart {
  uid: string;
  hub: string;
  part: Part;
  upd: number;
  data: Record<string, unknown>;
}

export interface StoreDump {
  users: { uid: string; email: string | null }[];
  progress: StoredPart[];
  meter: { reads: number; writes: number; deletes: number };
}

export async function storeDump(request: APIRequestContext): Promise<StoreDump> {
  const r = await retryReset(() => request.get('/api/test/store', { headers: TEST_HEADERS }));
  expect(r.status(), 'GET /api/test/store').toBe(200);
  return (await r.json()) as StoreDump;
}

/** The stored parts of one (uid, hub), keyed by part. */
export async function storedParts(
  request: APIRequestContext,
  uid: string,
  hub: Pick<HubEntry, 'id'>,
): Promise<Partial<Record<Part, StoredPart>>> {
  const dump = await storeDump(request);
  const out: Partial<Record<Part, StoredPart>> = {};
  for (const p of dump.progress) if (p.uid === uid && p.hub === hub.id) out[p.part] = p;
  return out;
}

/** The stored `upd` of one part (0 when the server has none). */
export async function storedUpd(request: APIRequestContext, uid: string, hub: Pick<HubEntry, 'id'>, part: Part): Promise<number> {
  return (await storedParts(request, uid, hub))[part]?.upd ?? 0;
}

/* ─────────────────────────── auth (§9, fake mode) ─────────────────────────── */

export interface TestUser {
  uid: string;
  email: string;
}

export const userA: TestUser = { uid: 'e2e-learner-a', email: 'learner-a@example.test' };
export const userB: TestUser = { uid: 'e2e-learner-b', email: 'learner-b@example.test' };

/** `"fake:" + base64url(JSON {uid, email, emailVerified, provider})` (server app/auth/fake.py). */
export function fakeToken(user: TestUser, extra: Record<string, unknown> = {}): string {
  const body = { uid: user.uid, email: user.email, emailVerified: true, provider: 'password', ...extra };
  return 'fake:' + Buffer.from(JSON.stringify(body)).toString('base64url');
}

/**
 * Sign `context` in through the API (no UI): the session cookie (`sh_session` on http) and
 * the `sh_hint` cookie land in the context's cookie jar. Returns the user's publicId.
 */
export async function signIn(context: BrowserContext, user: TestUser): Promise<string> {
  const r = await retryReset(() =>
    context.request.post('/api/auth/session', { headers: API_HEADERS, data: { idToken: fakeToken(user) } }),
  );
  expect(r.status(), `POST /api/auth/session as ${user.uid}: ${await r.text()}`).toBe(200);
  const body = (await r.json()) as { user?: { publicId?: string } };
  const publicId = body.user?.publicId;
  expect(publicId, 'publicId in the session reply').toBeTruthy();
  const names = (await context.cookies()).map((c) => c.name);
  expect(names, 'session and hint cookies').toEqual(expect.arrayContaining(['sh_session', 'sh_hint']));
  return publicId!;
}

/* ─────────────────────────── sync requests ─────────────────────────── */

export interface SyncRequest {
  /** Parts per hub in the body. */
  hubs: Record<string, Record<string, { upd?: number }>>;
  encoding: string | null;
  bytes: number;
  request: Request;
}

/**
 * Record every POST /api/sync the context sends (pages and keepalive requests of closing
 * pages included). Gzipped bodies are recorded with `hubs` = {}.
 */
export function trackSync(context: BrowserContext): SyncRequest[] {
  const out: SyncRequest[] = [];
  context.on('request', (req) => {
    const url = new URL(req.url());
    if (req.method() !== 'POST' || url.origin !== ORIGIN || url.pathname !== '/api/sync') return;
    const headers = req.headers();
    const encoding = headers['content-encoding'] ?? null;
    const buf = req.postDataBuffer();
    let hubs = {};
    if (!encoding && buf) {
      try {
        hubs = (JSON.parse(buf.toString('utf8')) as { hubs?: object }).hubs ?? {};
      } catch {
        /* recorded as empty */
      }
    }
    out.push({ hubs, encoding, bytes: buf?.length ?? 0, request: req });
  });
  return out;
}

/* ─────────────────────────── bridge ─────────────────────────── */

export interface SyncStats {
  mode: string;
  sync: { ready: boolean; active: boolean; fetches: number; tabU: Record<string, number> } | null;
  outbox: {
    pending: number;
    flushes: number;
    errors: number;
    lastError: string | null;
    inflight: boolean;
    hold: string;
    tier: number | 'paused';
    dead: string | null;
  };
  chrome: { notices: string[] };
  legacy: { seedCalls: number; signedIn: boolean | null };
}

export async function syncStats(page: Page): Promise<SyncStats> {
  return page.evaluate(() => {
    const b = (window as unknown as { __studyhubsBridge?: { stats(): unknown } }).__studyhubsBridge;
    if (!b) throw new Error('window.__studyhubsBridge is missing');
    return b.stats();
  }) as Promise<SyncStats>;
}

/** Push pending progress now (bridge flushNow: ignores the flush timer and backoff). */
export async function flushNow(page: Page): Promise<void> {
  await page.evaluate(() =>
    (window as unknown as { __studyhubsBridge: { flushNow(): Promise<void> } }).__studyhubsBridge.flushNow(),
  );
}

/** What the client's sign-out does first: `{type:"flush"}` on the "studyhubs" BroadcastChannel. */
export async function broadcastFlush(page: Page): Promise<void> {
  await page.evaluate(() => {
    const ch = new BroadcastChannel('studyhubs');
    ch.postMessage({ type: 'flush' });
    ch.close();
  });
}

/** Wait until the hub page is syncing as a signed-in visitor (prefetch done, db handed out). */
export async function expectSignedInHub(page: Page): Promise<void> {
  await expect
    .poll(async () => {
      const s = await syncStats(page);
      return `${s.mode}/${s.sync?.active ? 'active' : 'idle'}`;
    }, { message: 'bridge mode / sync' })
    .toBe('signed-in/active');
}

/** Ids of the bridge chrome's notices (bridge src/sync.ts, auth-events.ts, index.ts). */
export const notices = async (page: Page): Promise<string[]> => (await syncStats(page)).chrome.notices;

/** All text inside the bridge chrome (closed shadow root, read through CDP). */
export async function chromeText(page: Page): Promise<string> {
  const parts: string[] = [];
  const walk = (n: DomNode) => {
    if (n.nodeType === 3) parts.push(n.nodeValue);
    if (n.localName === 'style' || n.localName === 'script') return;
    for (const c of n.shadowRoots ?? []) walk(c);
    for (const c of n.children ?? []) walk(c);
  };
  const tree = await shadowTree(page, CHROME_HOST);
  if (tree) walk(tree);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

export const PILL = {
  local: 'Saved in this browser',
  cloud: 'Synced to your account',
  error: 'Sync paused, saved in this browser',
  loading: 'Connecting…',
} as const;

export const pill = (page: Page) => page.locator('#syncPill');

/** The hub's own toast for `quota_exceeded` (hub-runtime-contract.md §2.2). */
export const STORAGE_FULL_TOAST = 'Account storage is full';

/* ─────────────────────────── learner actions ─────────────────────────── */

/** The local `U` stamps of a v2 hub (zeros when there is no record yet). */
export async function localStamps(page: Page, hub: HubEntry): Promise<{ main: number; mocks: number; cards: number }> {
  const rec = await readJson<HubRecord>(page, progressKey(hub));
  return rec?.U ?? { main: 0, mocks: 0, cards: 0 };
}

/**
 * Answer the next unanswered single-answer quiz item of the open module (moving on with
 * "Next module" when the module has none left) and wait until the hub saved it locally.
 * Returns the new local `U.main`.
 */
export async function answerNext(page: Page, hub: HubEntry): Promise<number> {
  const before = (await localStamps(page, hub)).main;
  for (let hop = 0; hop < 20; hop++) {
    const index = await page.evaluate(() => {
      type Q = { t?: string };
      type M = { id: string; quiz?: Q[] };
      const cur = document.querySelector('button[data-m][aria-current="true"]')?.getAttribute('data-m');
      const mods: M[] = (window as unknown as { HUB?: { modules?: M[] } }).HUB?.modules ?? [];
      const mod = mods.find((m) => m.id === cur);
      if (!mod) return -2;
      const quiz = mod.quiz ?? [];
      for (let i = 0; i < quiz.length; i++) {
        if (quiz[i].t !== 'mc') continue;
        const el = document.querySelector(`#mq .q[data-k="${i}"]`);
        if (el && !el.querySelector('.expl') && el.querySelector('button.opt:not([disabled])')) return i;
      }
      return -1;
    });
    if (index === -2) throw new Error(`${hub.slug}: no module is open (open one with openQuizModule first)`);
    if (index >= 0) {
      const item = page.locator(`#mq .q[data-k="${index}"]`);
      await item.locator('button.opt').first().click();
      await expect(item.locator('.expl')).toBeVisible();
      await expect.poll(async () => (await localStamps(page, hub)).main, { message: 'U.main after answering' }).not.toBe(before);
      return (await localStamps(page, hub)).main;
    }
    const next = page.locator('#nextM');
    await expect(next, `${hub.slug}: out of quiz items`).toBeVisible();
    await next.click();
  }
  throw new Error(`${hub.slug}: no unanswered single-answer item found`);
}

/* ─────────────────────────── client pages (§14, fake mode) ─────────────────────────── */

/**
 * Fill and submit the client's "Test sign-in" form (only rendered when the server runs
 * AUTH_MODE=fake). The page must already be on /signin.
 */
export async function submitTestSignIn(page: Page, user: TestUser, opts: { verified?: boolean } = {}): Promise<void> {
  const form = page.locator('form.form--test');
  await form.getByRole('textbox', { name: 'User id' }).fill(user.uid);
  await form.getByRole('textbox', { name: 'Email' }).fill(user.email);
  await form.getByRole('checkbox', { name: 'Email verified' }).setChecked(opts.verified ?? true);
  await form.getByRole('button', { name: 'Test sign-in' }).click();
}

/**
 * Move an installed page clock forward in small steps, letting each sync request settle in
 * real time before the next step. One long jump would also fire the request's own 30 s
 * timeout while it is still in flight, which no real page experiences.
 */
export async function advanceClock(page: Page, ms: number, step = 5_000): Promise<void> {
  for (let done = 0; done < ms; done += step) {
    await page.clock.fastForward(Math.min(step, ms - done));
    await expect
      .poll(async () => (await syncStats(page)).outbox.inflight, { message: 'sync request settled' })
      .toBe(false);
  }
}

/** Fire the page's `pagehide` listeners without closing it (the bridge's unload flush). */
export async function firePagehide(page: Page): Promise<void> {
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false })));
}
