// Pure M1 helpers: ?next= validation, fake tokens, reconcileUp batching, sign-in / sign-out flows.
import { readOwner, readSynced } from '@bridge-shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiProblem } from '../src/lib/api';
import { FAKE_UID_RE, makeFakeToken } from '../src/lib/fake-token';
import { syncHubs, type SyncHub } from '../src/lib/hubs';
import { isSafeNext, safeNext, withNext } from '../src/lib/next';
import {
  defaultCompressor,
  planBatches,
  reconcileUp,
  type ReconcileReport,
  type SyncUnit,
} from '../src/lib/reconcile';
import { completeSignIn, type SignInDeps } from '../src/lib/signin-flow';
import { FLUSH_WAIT_MS, finishSignOut, prepareSignOut } from '../src/lib/signout-flow';
import { decodeBase64url, gunzipText, json, mockServer, seedDirtyProgress, syncHandler, T0, USER, v2Record } from './api-mock';
import { hubEntry, rawCatalog } from './fixtures';
import { parseHubEntry, type HubEntry } from '../src/lib/catalog';

const catalogHubs = (): HubEntry[] => rawCatalog().hubs.map((raw) => parseHubEntry(raw)!);
const HUBS: SyncHub[] = syncHubs(catalogHubs());

describe('next= validation', () => {
  it.each(['/', '/h/dsa-l1-foundation', '/h/ai-103', '/account', '/privacy', '/admin'])('accepts %s', (next) => {
    expect(isSafeNext(next)).toBe(true);
    expect(safeNext(next)).toBe(next);
  });

  it.each([
    null,
    undefined,
    '',
    '//evil.example',
    'https://evil.example/h/x',
    '/h/',
    '/h/X',
    '/h/x/',
    '/h/x/../../admin',
    '/h/x?y=1',
    '/h/x#frag',
    '/signin',
    '/signout',
    '/verify',
    '/\\evil.example',
    ' /',
    'javascript:alert(1)',
  ])('rejects %s', (next) => {
    expect(isSafeNext(next)).toBe(false);
    expect(safeNext(next)).toBe('/');
  });

  it('builds ?next= links, leaving / implicit', () => {
    expect(withNext('/signup', '/')).toBe('/signup');
    expect(withNext('/signup', '/h/ai-103')).toBe('/signup?next=%2Fh%2Fai-103');
  });
});

describe('fake tokens', () => {
  const decode = (token: string) => {
    expect(token.startsWith('fake:')).toBe(true);
    const b64 = token.slice(5);
    expect(b64).toMatch(/^[A-Za-z0-9_-]+$/); // base64url, no padding
    return JSON.parse(decodeBase64url(b64)) as Record<string, unknown>;
  };

  it('encodes {uid, email, emailVerified} as base64url JSON', () => {
    expect(decode(makeFakeToken({ uid: 'alice', email: 'a@x.test', emailVerified: true }))).toEqual({
      uid: 'alice',
      email: 'a@x.test',
      emailVerified: true,
    });
  });

  it('keeps unverified, name, provider and non-ASCII text', () => {
    const token = makeFakeToken({ uid: 'b', email: 'b@x.test', emailVerified: false, name: 'Zoë ✓', provider: 'google.com' });
    expect(decode(token)).toEqual({ uid: 'b', email: 'b@x.test', emailVerified: false, name: 'Zoë ✓', provider: 'google.com' });
  });

  it('checks uids like the server', () => {
    expect(FAKE_UID_RE.test('user_1.a:b@c+d-e')).toBe(true);
    expect(FAKE_UID_RE.test('a/b')).toBe(false);
    expect(FAKE_UID_RE.test('')).toBe(false);
    expect(FAKE_UID_RE.test('x'.repeat(129))).toBe(false);
  });
});

describe('planBatches', () => {
  const unit = (hub: string, bytes: number, parts = ['main']): SyncUnit => ({
    hub,
    parts: Object.fromEntries(parts.map((part) => [part, { hub, upd: T0, pad: 'x'.repeat(bytes) }])),
  });

  it('keeps every body within maxBytes and maxHubs', () => {
    const units = Array.from({ length: 60 }, (_, i) => unit(`hub-${i}`, 1000 + i * 37));
    const batches = planBatches(units, { maxBytes: 8000, maxHubs: 25 });
    expect(batches.length).toBeGreaterThan(1);
    for (const body of batches) {
      expect(new TextEncoder().encode(JSON.stringify(body)).length).toBeLessThanOrEqual(8000);
      expect(Object.keys(body.hubs).length).toBeLessThanOrEqual(25);
    }
    const sent = batches.flatMap((body) => Object.keys(body.hubs));
    expect(sent).toEqual(units.map((u) => u.hub)); // each hub once, in order
  });

  it('caps a batch at 25 hubs even when they are tiny', () => {
    const batches = planBatches(
      Array.from({ length: 30 }, (_, i) => unit(`h${i}`, 1)),
      {},
    );
    expect(batches.map((body) => Object.keys(body.hubs).length)).toEqual([25, 5]);
  });

  it('defaults to 1 MiB per body', () => {
    const batches = planBatches([unit('a', 600_000), unit('b', 600_000), unit('c', 10)]);
    expect(batches.map((body) => Object.keys(body.hubs))).toEqual([['a'], ['b', 'c']]);
    for (const body of batches) expect(JSON.stringify(body).length).toBeLessThanOrEqual(1024 * 1024);
  });

  it('splits a hub that is too big by part, and sends an oversized part alone', () => {
    const big = unit('big', 3000, ['main', 'mocks', 'cards']);
    const batches = planBatches([big, unit('small', 10)], { maxBytes: 4000 });
    for (const body of batches.slice(0, -1)) expect(JSON.stringify(body).length).toBeLessThanOrEqual(4000);
    expect(batches.flatMap((body) => Object.entries(body.hubs).flatMap(([hub, parts]) => Object.keys(parts).map((p) => `${hub}.${p}`)))).toEqual(
      ['big.main', 'big.mocks', 'big.cards', 'small.main'],
    );
    const huge = planBatches([unit('huge', 9000)], { maxBytes: 4000 });
    expect(huge).toHaveLength(1); // the server answers it per part (too_large)
  });
});

describe('reconcileUp', () => {
  beforeEach(() => seedDirtyProgress());

  it('posts every dirty part with the protocol header, then marks acknowledged parts synced', async () => {
    const server = mockServer({
      'POST /api/sync': syncHandler((hub, part) => (hub === 'dsa-l1' && part === 'cards' ? 'stale' : 'accepted')),
    });
    const report = await reconcileUp({ storage: localStorage, hubs: HUBS, compress: null });
    const [call] = server.to('POST /api/sync');
    expect(call?.headers.get('X-StudyHubs')).toBe('1');
    expect(call?.headers.get('Content-Type')).toBe('application/json');
    expect(call?.headers.has('Content-Encoding')).toBe(false);
    expect(call?.credentials).toBe('same-origin');
    const body = JSON.parse(String(call?.body));
    expect(Object.keys(body.hubs)).toEqual(['ai103', 'dsa-l1']);
    expect(body.hubs['dsa-l1'].main).toMatchObject({ hub: 'dsa-l1', upd: T0 + 1, S: { v: 2 } });
    expect(body.hubs['dsa-l1'].cards).toMatchObject({ hub: 'dsa-l1', upd: T0 + 2, map: { c1: { due: 1 } } });
    expect(report).toMatchObject({ requests: 1, batches: 1, accepted: 2, stale: 1, rejected: 0, remaining: 0 });
    expect(readSynced(localStorage, 'dsa-l1')).toMatchObject({ main: T0 + 1, cards: T0 + 2, mocks: 0 });
    expect(readSynced(localStorage, 'ai103')).toMatchObject({ main: T0 + 3 });
  });

  it('leaves rejected parts unsynced and marks duplicates synced', async () => {
    mockServer({
      'POST /api/sync': syncHandler((hub, part) => (hub === 'ai103' ? 'rejected' : part === 'main' ? 'duplicate' : 'accepted')),
    });
    const report = await reconcileUp({ storage: localStorage, hubs: HUBS, compress: null });
    expect(report).toMatchObject({ duplicate: 1, accepted: 1, rejected: 1, remaining: 1 });
    expect(readSynced(localStorage, 'ai103').main).toBe(0);
    expect(readSynced(localStorage, 'dsa-l1').main).toBe(T0 + 1);
  });

  it('gzips the body when a compressor is available', async () => {
    const server = mockServer();
    const compress = vi.fn(async (text: string) => new TextEncoder().encode(`gz:${text}`));
    const syncPosts: unknown[] = [];
    server.fetch.mockImplementationOnce(async (_input, init) => {
      const bytes = new TextDecoder().decode(init!.body as Uint8Array);
      syncPosts.push(JSON.parse(bytes.slice(3)));
      expect(new Headers(init!.headers).get('Content-Encoding')).toBe('gzip');
      return json({ results: {} });
    });
    const report = await reconcileUp({ storage: localStorage, hubs: HUBS, compress });
    expect(compress).toHaveBeenCalledTimes(1);
    expect(report.gzip).toBe(true);
    expect(syncPosts).toHaveLength(1);
    expect(report.remaining).toBe(3); // nothing acknowledged
  });

  it.runIf(typeof CompressionStream === 'function')('produces real gzip with CompressionStream', async () => {
    const compress = defaultCompressor();
    expect(compress).not.toBeNull();
    const text = JSON.stringify({ hubs: { a: { main: { upd: 1, S: { s: 'é'.repeat(100) } } } } });
    expect(await gunzipText(await compress!(text))).toBe(text);
  });

  it('sends one request per batch and stops on a failure every batch would hit', async () => {
    let n = 0;
    const server = mockServer({
      'POST /api/sync': () => (++n === 1 ? json({ code: 'unauthenticated', message: 'x' }, 401) : json({ results: {} })),
    });
    const report = await reconcileUp({ storage: localStorage, hubs: HUBS, compress: null, maxHubs: 1 });
    expect(report.batches).toBe(2);
    expect(server.to('POST /api/sync')).toHaveLength(1);
    expect(report.problem).toMatchObject({ status: 401, code: 'unauthenticated' });
    expect(report.remaining).toBe(3);
  });

  it('goes on after a per-request 413', async () => {
    let n = 0;
    const accept = syncHandler();
    const server = mockServer({
      'POST /api/sync': (call) => (++n === 1 ? json({ code: 'too_large', message: 'x' }, 413) : accept(call)),
    });
    const report = await reconcileUp({ storage: localStorage, hubs: HUBS, compress: null, maxHubs: 1 });
    expect(server.to('POST /api/sync')).toHaveLength(2);
    expect(report.problem?.code).toBe('too_large');
    expect(report.remaining).toBe(1); // ai103.main was in the refused first batch
  });

  it('sends nothing when every part is synced', async () => {
    localStorage.clear();
    localStorage.setItem('studyhub.dsa-l1.v2', v2Record({ main: T0 }));
    localStorage.setItem('studyhubs.synced.dsa-l1', JSON.stringify({ main: T0 }));
    const server = mockServer();
    const report = await reconcileUp({ storage: localStorage, hubs: HUBS, compress: null });
    expect(server.to('POST /api/sync')).toHaveLength(0);
    expect(report).toMatchObject({ requests: 0, batches: 0, remaining: 0 });
  });
});

const emptyReport = (remaining = 0): ReconcileReport => ({
  requests: 0,
  batches: 0,
  accepted: 0,
  duplicate: 0,
  stale: 0,
  rejected: 0,
  gzip: false,
  problem: null,
  remaining,
});

describe('completeSignIn', () => {
  function deps(overrides: Partial<SignInDeps> = {}) {
    const log: string[] = [];
    const d = {
      storage: localStorage,
      confirmSwitch: vi.fn(async () => {
        log.push('confirm');
        return 'discard' as const;
      }),
      createSession: vi.fn(async (token: string) => {
        log.push(`session:${token}`);
        return USER;
      }),
      endSession: vi.fn(async () => {
        log.push('logout');
      }),
      loadHubs: vi.fn(async () => ({ hubs: HUBS, fromCatalog: true })),
      reconcile: vi.fn(async () => {
        log.push(`reconcile:owner=${readOwner(localStorage)}`);
        return emptyReport();
      }),
      download: vi.fn(() => log.push('download')),
      broadcast: vi.fn((m: { type: string }) => log.push(`broadcast:${m.type}`)),
      assign: vi.fn((url: string) => log.push(`assign:${url}`)),
      ...overrides,
    } satisfies SignInDeps;
    return { d, log };
  }

  it('runs session → reconcileUp → owner → broadcast → navigate, in that order', async () => {
    seedDirtyProgress();
    const { d, log } = deps();
    const outcome = await completeSignIn('fake:tok', '/h/dsa-l1-foundation', d);
    expect(log).toEqual([
      'session:fake:tok',
      'reconcile:owner=null',
      'broadcast:auth-changed',
      'assign:/h/dsa-l1-foundation',
    ]);
    expect(d.confirmSwitch).not.toHaveBeenCalled();
    expect(readOwner(localStorage)).toBe(USER.publicId);
    expect(JSON.parse(localStorage.getItem('studyhubs.profile')!)).toEqual({ id: USER.publicId, initial: 'A' });
    expect(outcome).toMatchObject({ status: 'done', wiped: false });
    expect(localStorage.getItem('studyhub.dsa-l1.v2')).not.toBeNull();
  });

  it('pushes progress already owned by the same account without asking', async () => {
    seedDirtyProgress();
    localStorage.setItem('studyhubs.owner', USER.publicId);
    const { d } = deps();
    await completeSignIn('t', '/', d);
    expect(d.confirmSwitch).not.toHaveBeenCalled();
    expect(d.reconcile).toHaveBeenCalledTimes(1);
  });

  it('asks before dropping unsynced progress of another account, then wipes it (discard)', async () => {
    seedDirtyProgress();
    localStorage.setItem('studyhubs.owner', 'pub_bob');
    const { d, log } = deps();
    const outcome = await completeSignIn('t', '/', d);
    expect(d.confirmSwitch).toHaveBeenCalledWith(expect.objectContaining({ unsynced: 3 }));
    expect(log.slice(0, 3)).toEqual(['session:t', 'confirm', 'reconcile:owner=null']);
    expect(d.download).not.toHaveBeenCalled();
    expect(localStorage.getItem('studyhub.dsa-l1.v2')).toBeNull();
    expect(localStorage.getItem('studyhub.codeLang')).toBe('python');
    expect(localStorage.getItem('studyhubs.ui.nudge.dsa-l1')).toBe('1');
    expect(readOwner(localStorage)).toBe(USER.publicId);
    expect(outcome).toMatchObject({ status: 'done', wiped: true });
  });

  it('downloads before wiping when asked to', async () => {
    seedDirtyProgress();
    localStorage.setItem('studyhubs.owner', 'pub_bob');
    const { d, log } = deps({ confirmSwitch: vi.fn(async () => 'download' as const) });
    await completeSignIn('t', '/', d);
    expect(d.download).toHaveBeenCalledWith(localStorage, HUBS);
    expect(log).toContain('download');
    expect(localStorage.getItem('studyhub.ai103.v2')).toBeNull();
  });

  it('cancel ends the new session and keeps everything', async () => {
    seedDirtyProgress();
    localStorage.setItem('studyhubs.owner', 'pub_bob');
    const { d } = deps({ confirmSwitch: vi.fn(async () => 'cancel' as const) });
    const outcome = await completeSignIn('t', '/', d);
    expect(outcome).toEqual({ status: 'cancelled' });
    expect(d.endSession).toHaveBeenCalledTimes(1);
    expect(d.reconcile).not.toHaveBeenCalled();
    expect(d.assign).not.toHaveBeenCalled();
    expect(d.broadcast).not.toHaveBeenCalled();
    expect(readOwner(localStorage)).toBe('pub_bob');
    expect(localStorage.getItem('studyhub.dsa-l1.v2')).not.toBeNull();
  });

  it('wipes another account’s fully synced progress without asking', async () => {
    localStorage.setItem('studyhub.dsa-l1.v2', v2Record({ main: T0 }));
    localStorage.setItem('studyhubs.synced.dsa-l1', JSON.stringify({ main: T0 }));
    localStorage.setItem('studyhubs.owner', 'pub_bob');
    const { d } = deps();
    await completeSignIn('t', '/', d);
    expect(d.confirmSwitch).not.toHaveBeenCalled();
    expect(localStorage.getItem('studyhub.dsa-l1.v2')).toBeNull();
  });

  it('a refused session (email_unverified) changes nothing', async () => {
    seedDirtyProgress();
    const problem = new ApiProblem(403, 'email_unverified');
    const { d } = deps({ createSession: vi.fn(async () => Promise.reject(problem)) });
    await expect(completeSignIn('t', '/', d)).rejects.toBe(problem);
    expect(d.reconcile).not.toHaveBeenCalled();
    expect(readOwner(localStorage)).toBeNull();
    expect(d.assign).not.toHaveBeenCalled();
  });

  it('without the catalog, skips the push but still finishes', async () => {
    seedDirtyProgress();
    const { d } = deps({ loadHubs: vi.fn(async () => ({ hubs: [], fromCatalog: false })) });
    await completeSignIn('t', '/account', d);
    expect(d.reconcile).not.toHaveBeenCalled();
    expect(d.assign).toHaveBeenCalledWith('/account');
    expect(readOwner(localStorage)).toBe(USER.publicId);
  });
});

describe('sign-out flow', () => {
  it('asks hub tabs to flush, waits, then pushes and counts what is left', async () => {
    seedDirtyProgress();
    const log: string[] = [];
    const check = await prepareSignOut({
      storage: localStorage,
      broadcast: (m) => log.push(`broadcast:${m.type}`),
      wait: async (ms) => {
        log.push(`wait:${ms}`);
      },
      loadHubs: async () => ({ hubs: HUBS, fromCatalog: true }),
      reconcile: async () => {
        log.push('reconcile');
        return emptyReport(3);
      },
    });
    expect(log).toEqual(['broadcast:flush', `wait:${FLUSH_WAIT_MS}`, 'reconcile']);
    expect(check).toMatchObject({ unsynced: 3, fromCatalog: true });
  });

  it('ends the session, wipes (keeping codeLang and ui keys), then broadcasts logout', async () => {
    seedDirtyProgress();
    localStorage.setItem('studyhubs.owner', USER.publicId);
    localStorage.setItem('ai901hub.v1', '{}');
    const log: string[] = [];
    await finishSignOut(
      {
        storage: localStorage,
        endSession: async () => {
          log.push(`logout:${localStorage.length}`);
        },
        broadcast: (m) => log.push(`broadcast:${m.type}:${localStorage.length}`),
      },
      HUBS,
    );
    expect(log).toEqual(['logout:6', 'broadcast:logout:2']);
    expect(Object.keys({ ...localStorage }).sort()).toEqual(['studyhub.codeLang', 'studyhubs.ui.nudge.dsa-l1']);
  });

  it('wipes nothing when the server does not end the session', async () => {
    seedDirtyProgress();
    const broadcast = vi.fn();
    await expect(
      finishSignOut({ storage: localStorage, endSession: async () => Promise.reject(new ApiProblem(0, 'network')), broadcast }, HUBS),
    ).rejects.toMatchObject({ code: 'network' });
    expect(localStorage.getItem('studyhub.dsa-l1.v2')).not.toBeNull();
    expect(broadcast).not.toHaveBeenCalled();
  });
});

describe('syncHubs', () => {
  it('lists v2 and legacy hubs with their legacy key', () => {
    expect(HUBS.map((hub) => `${hub.id}:${hub.engine}`)).toEqual([
      'ab620:v2',
      'ai103:v2',
      'ai500:v2',
      'ai901:legacy',
      'dsa-l1:v2',
      'dsa-l2:v2',
      'dsa-l3:v2',
    ]);
    expect(HUBS.find((hub) => hub.id === 'ai901')?.legacyKeys).toEqual(['ai901hub.v1']);
    expect(syncHubs([hubEntry({ engine: 'static' })])).toEqual([]);
  });
});
