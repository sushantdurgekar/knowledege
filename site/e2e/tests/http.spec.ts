/**
 * HTTP contract checks (build-contracts.md sections 4-5), mostly without a browser:
 *  (e) served page minus the injected span equals the original, byte for byte; the download
 *      is the original and its sha256 equals the catalog's
 *  (f) revisits get 304 with If-None-Match (API level, and a real browser reload)
 *  (g) security headers on the shell, the hubs and the catalog; the per-hub CSP
 *  plus the M0 API surface, robots.txt, redirects and 404s.
 */
import { createHash } from 'node:crypto';
import { expect, test, type APIRequestContext, type APIResponse } from '@playwright/test';
import { downloadPath, hubPath, injectionSpan, loadCatalog, type HubEntry } from './support/catalog';
import { BASE_URL, EXPECT_HSTS, IS_LOCAL } from './support/env';
import { cdp } from './support/shadow';

const catalog = loadCatalog();
const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const cspHash = (code: string) => `'sha256-${createHash('sha256').update(code, 'utf8').digest('base64')}'`;

const HUB_CACHE = 'public, max-age=300, stale-while-revalidate=86400';
const CATALOG_CACHE = 'max-age=300, stale-while-revalidate=86400'; // contract §5, verbatim
// The server sends strong ETags; an edge proxy in front of a deployed site may weaken them
// (W/"…") when it re-encodes, which still revalidates fine.
const ETAG = IS_LOCAL ? /^"[^"]+"$/ : /^(W\/)?"[^"]+"$/;

/** GET with an explicit Accept-Encoding (Playwright decodes br/gzip bodies itself). */
const get = (request: APIRequestContext, path: string, encoding: string, headers: Record<string, string> = {}) =>
  request.get(path, { headers: { 'accept-encoding': encoding, ...headers }, maxRedirects: 0 });

/** Inline scripts as the collector sees them (architecture-spec §4.3 step 2). */
function inlineScripts(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (!/\bsrc\s*=/i.test(m[1])) out.push(m[2]);
  }
  return out;
}

function parseCsp(value: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const part of value.split(';')) {
    const [name, ...tokens] = part.trim().split(/\s+/);
    if (name) map.set(name.toLowerCase(), tokens);
  }
  return map;
}

function expectBaseHeaders(res: APIResponse, what: string) {
  const h = res.headers();
  expect(h['x-content-type-options'], `${what}: nosniff`).toBe('nosniff');
  expect(h['referrer-policy'], `${what}: Referrer-Policy`).toBe('strict-origin-when-cross-origin');
  expect(h['permissions-policy'], `${what}: Permissions-Policy`).toBe('camera=(), microphone=(), geolocation=()');
  if (EXPECT_HSTS) expect(h['strict-transport-security'], `${what}: HSTS`).toBe('max-age=31536000');
  else expect(h['strict-transport-security'], `${what}: no HSTS outside production`).toBeUndefined();
}

test.describe('security headers @smoke', () => {
  test('shell, catalog, health and API carry the global headers', async ({ request }) => {
    const shell = await get(request, '/', 'identity');
    expect(shell.status()).toBe(200);
    expectBaseHeaders(shell, '/');
    expect(shell.headers()['cross-origin-opener-policy']).toBe('same-origin-allow-popups');
    expect(shell.headers()['cache-control']).toBe('no-cache');

    const cat = await get(request, '/catalog.json', 'identity');
    expect(cat.status()).toBe(200);
    expectBaseHeaders(cat, '/catalog.json');
    expect(cat.headers()['content-type']).toContain('application/json');
    expect(cat.headers()['cache-control']).toBe(CATALOG_CACHE);
    const brCat = await get(request, '/catalog.json', 'br');
    expect(brCat.headers()['content-encoding']).toBe('br');
    expect(await brCat.json()).toEqual(await cat.json());

    for (const path of ['/healthz', '/api/version', '/_sh/bridge.js', '/robots.txt']) {
      const res = await get(request, path, 'identity');
      expect(res.status(), path).toBe(200);
      expectBaseHeaders(res, path);
    }
  });

  for (const hub of catalog.hubs) {
    test(`${hub.slug}: hub page and download headers, per-hub CSP`, async ({ request }) => {
      const res = await get(request, hubPath(hub), 'br');
      expect(res.status()).toBe(200);
      expectBaseHeaders(res, hubPath(hub));
      const h = res.headers();
      expect(h['cross-origin-opener-policy']).toBe('same-origin');
      expect(h['content-type']).toBe('text/html; charset=utf-8');
      expect(h['cache-control']).toBe(HUB_CACHE);
      expect(h['vary']?.toLowerCase()).toContain('accept-encoding');

      const csp = parseCsp(h['content-security-policy'] ?? '');
      expect(Object.fromEntries([...csp].filter(([k]) => k !== 'script-src'))).toEqual({
        'default-src': ["'none'"],
        'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        'font-src': ['https://fonts.gstatic.com'],
        'img-src': ["'self'", 'data:'],
        'connect-src': ["'self'"],
        'base-uri': ["'none'"],
        'form-action': ["'none'"],
        'frame-ancestors': ["'none'"],
        'object-src': ["'none'"],
      });
      // script-src: 'self' plus exactly the hashes of this page's inline scripts (no unsafe-*).
      const [self, ...hashes] = csp.get('script-src') ?? [];
      expect(self).toBe("'self'");
      const html = (await res.body()).toString('utf8');
      expect(new Set(hashes)).toEqual(new Set(inlineScripts(html).map(cspHash)));

      const dl = await get(request, downloadPath(hub), 'identity');
      expect(dl.status()).toBe(200);
      expectBaseHeaders(dl, downloadPath(hub));
      expect(dl.headers()['content-security-policy']).toBe('sandbox');
      expect(dl.headers()['cache-control']).toBe('public, max-age=3600');
    });
  }
});

test.describe('served bytes @smoke', () => {
  for (const hub of catalog.hubs) {
    test(`${hub.slug}: served minus the injected span is the original; download is the original`, async ({
      request,
    }) => {
      const dl = await get(request, downloadPath(hub), 'identity');
      expect(dl.status()).toBe(200);
      const original = await dl.body();
      expect(original.length, 'download size = catalog bytes').toBe(hub.bytes);
      expect(sha256(original), 'download sha256 = catalog sha256').toBe(hub.sha256);
      expect(dl.headers()['etag'], 'download ETag is the sha256').toContain(hub.sha256);
      const cd = dl.headers()['content-disposition'] ?? '';
      expect(cd).toMatch(/^attachment;/);
      const star = /filename\*=UTF-8''([^;]+)/i.exec(cd);
      expect(star, 'RFC 5987 filename*').not.toBeNull();
      expect(decodeURIComponent(star![1])).toBe(hub.downloadName);
      expect(cd, 'ASCII fallback filename').toMatch(/filename="[\x20-\x7e]+"/);

      const page = await get(request, hubPath(hub), 'identity');
      expect(page.status()).toBe(200);
      expect(page.headers()['content-encoding'], 'identity requested').toBeUndefined();
      const served = await page.body();

      if (hub.engine === 'static') {
        expect(served.equals(original), 'static hubs are served unchanged').toBe(true);
        return;
      }
      const span = Buffer.from(injectionSpan(hub), 'utf8');
      const at = served.indexOf(span);
      expect(at, 'the exact injected span is in the served page').toBeGreaterThanOrEqual(0);
      expect(served.indexOf(span, at + 1), 'injected once').toBe(-1);
      const removed = Buffer.concat([served.subarray(0, at), served.subarray(at + span.length)]);
      expect(removed.length).toBe(original.length);
      expect(removed.equals(original), 'served minus span == original, byte for byte').toBe(true);
      // Inserted right before the first </head> (or, without one, the first <script).
      const anchor = original.subarray(at, at + 8).toString('latin1').toLowerCase();
      expect(anchor.startsWith('</head>') || anchor.startsWith('<script')).toBe(true);
      expect(original.toString('latin1').toLowerCase().indexOf('</head>')).toBe(
        anchor.startsWith('</head>') ? at : -1,
      );

      // Every encoding decodes to the same bytes.
      for (const enc of ['br', 'gzip']) {
        const res = await get(request, hubPath(hub), enc);
        expect(res.headers()['content-encoding'], `${enc} variant`).toBe(enc);
        expect((await res.body()).equals(served), `${enc} decodes to the identity bytes`).toBe(true);
      }
    });
  }
});

test.describe('revisits get 304', () => {
  for (const hub of catalog.hubs) {
    test(`${hub.slug}: If-None-Match on the page (per encoding) and the download @smoke`, async ({ request }) => {
      const tags = new Set<string>();
      for (const enc of ['br', 'gzip', 'identity']) {
        const first = await get(request, hubPath(hub), enc);
        expect(first.status()).toBe(200);
        const etag = first.headers()['etag'];
        expect(etag, `${enc}: ETag`).toMatch(ETAG);
        tags.add(etag);
        const again = await get(request, hubPath(hub), enc, { 'if-none-match': etag });
        expect(again.status(), `${enc}: revisit`).toBe(304);
        expect((await again.body()).length).toBe(0);
        expect(again.headers()['etag']).toBe(etag);
      }
      expect(tags.size, 'one ETag per encoding').toBe(3);

      const dl = await get(request, downloadPath(hub), 'identity');
      const dlAgain = await get(request, downloadPath(hub), 'identity', { 'if-none-match': dl.headers()['etag'] });
      expect(dlAgain.status()).toBe(304);
    });

    test(`${hub.slug}: a browser reload revalidates with If-None-Match and gets 304`, async ({ page }) => {
      // No routes on this page: Playwright would disable the HTTP cache. CDP shows the real
      // network status (Playwright reports a revalidated document as 200 from cache).
      const s = await cdp(page);
      await s.send('Network.enable');
      const url = BASE_URL + hubPath(hub);
      const ids = new Set<string>();
      const sent: (string | undefined)[] = [];
      const statuses: number[] = [];
      s.on('Network.requestWillBeSent', (e) => {
        if (e.request.url === url && e.type === 'Document') ids.add(e.requestId);
      });
      s.on('Network.requestWillBeSentExtraInfo', (e) => {
        if (ids.has(e.requestId)) {
          const h = Object.fromEntries(Object.entries(e.headers).map(([k, v]) => [k.toLowerCase(), String(v)]));
          sent.push(h['if-none-match']);
        }
      });
      s.on('Network.responseReceivedExtraInfo', (e) => {
        if (ids.has(e.requestId)) statuses.push(e.statusCode);
      });

      await page.goto(hubPath(hub), { waitUntil: 'domcontentloaded' });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect.poll(() => statuses.length).toBe(2);
      expect(statuses).toEqual([200, 304]);
      expect(sent[0]).toBeUndefined();
      expect(sent[1]).toMatch(ETAG);
    });
  }
});

test.describe('M0 API and routes @smoke', () => {
  test('health, version, me, seed and unknown API paths', async ({ request }) => {
    const health = await get(request, '/healthz', 'identity');
    expect(await health.json()).toEqual({ ok: true });
    expect(health.headers()['cache-control']).toBe('no-store');

    const version = await (await get(request, '/api/version', 'identity')).json();
    expect(version).toEqual({ version: expect.stringMatching(/^\d+\.\d+\.\d+/), commit: expect.any(String) });
    expect(version.commit.length).toBeGreaterThan(0);

    expect(await (await get(request, '/api/me', 'identity')).json()).toEqual({ signedIn: false });

    const missing = await get(request, '/api/definitely-not-a-route', 'identity');
    expect(missing.status()).toBe(404);
    expect(await missing.json()).toMatchObject({ code: 'not_found', message: expect.any(String) });

    for (const hub of catalog.hubs) {
      const seed = await get(request, `/api/seed/${hub.id}.js`, 'identity');
      if (hub.engine !== 'legacy') {
        expect(seed.status(), `${hub.id}: no seed for non-legacy hubs`).toBe(404);
        continue;
      }
      expect(seed.status()).toBe(200);
      expect(seed.headers()['content-type']).toMatch(/^text\/javascript/);
      expect(seed.headers()['cache-control']).toBe('no-store');
      expect(seed.headers()['vary']?.toLowerCase()).toContain('cookie');
      expect(await seed.text()).toBe(
        'window.__studyhubsBridge&&__studyhubsBridge.legacySeed({signedIn:false});',
      );
    }
  });

  test('robots.txt, SPA routes, redirects and 404s', async ({ request }) => {
    const robots = await (await get(request, '/robots.txt', 'identity')).text();
    for (const rule of ['Disallow: /api/', 'Disallow: /h/*/download', 'Disallow: /admin']) {
      expect(robots).toContain(rule);
    }

    for (const path of ['/signin', '/privacy', '/account']) {
      const res = await get(request, path, 'identity');
      expect(res.status(), path).toBe(200);
      expect(res.headers()['content-type'], path).toContain('text/html');
      expect(res.headers()['cache-control'], path).toBe('no-cache');
    }
    const notFound = await get(request, '/no/such/page', 'identity');
    expect(notFound.status()).toBe(404);
    expect(notFound.headers()['content-type']).toContain('text/html');
    expect((await get(request, '/h/no-such-hub', 'identity')).status()).toBe(404);

    const hub: HubEntry = catalog.hubs[0];
    const slash = await get(request, `${hubPath(hub)}/`, 'identity');
    expect(slash.status()).toBe(301);
    expect(new URL(slash.headers()['location'], 'http://x').pathname).toBe(hubPath(hub));
    for (const h of catalog.hubs.filter((x) => x.id !== x.slug)) {
      const byId = await get(request, `/h/${h.id}`, 'identity');
      expect(byId.status(), `/h/${h.id}`).toBe(301);
      expect(new URL(byId.headers()['location'], 'http://x').pathname).toBe(hubPath(h));
    }
  });
});
