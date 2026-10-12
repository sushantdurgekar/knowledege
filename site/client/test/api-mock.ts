// A tiny in-test stand-in for the FastAPI server: answers /catalog.json and /api/* from a route
// table and records every request (method, path, headers, body) for assertions.
import { vi } from 'vitest';
import { rawCatalog } from './fixtures';

export interface Call {
  path: string;
  method: string;
  headers: Headers;
  body: BodyInit | null | undefined;
  credentials: RequestCredentials | undefined;
}

export type Handler = (call: Call) => Response | Promise<Response>;
/** A handler, a canned Response (cloned per request), or a JSON body answered with 200. */
export type Route = Handler | Response | Record<string, unknown> | unknown[];

/** base64url → UTF-8 text (no Node Buffer: the tests typecheck against DOM types only). */
export function decodeBase64url(b64: string): string {
  const binary = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(binary, (ch) => ch.charCodeAt(0)));
}

/** gunzip with the web DecompressionStream. */
export async function gunzipText(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  return new Response(new Response(bytes).body!.pipeThrough(new DecompressionStream('gzip'))).text();
}

/** A request body as text, gunzipped when the client compressed it. */
export async function bodyText(call: Call): Promise<string> {
  const body = call.body;
  if (typeof body === 'string') return body;
  if (body instanceof Uint8Array) {
    const bytes = body as Uint8Array<ArrayBuffer>;
    return call.headers.get('Content-Encoding') === 'gzip' ? gunzipText(bytes) : new TextDecoder().decode(bytes);
  }
  return String(body);
}

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

export const FAKE_CONFIG = { authMode: 'fake', firebase: null, origin: 'http://localhost:3000', version: 'test' };
export const FIREBASE_CONFIG = {
  authMode: 'firebase',
  firebase: { apiKey: 'k', authDomain: 'x.firebaseapp.com', projectId: 'x', appId: '1:2:web:3' },
  origin: 'http://localhost:3000',
  version: 'test',
};

export const USER = {
  publicId: 'pub_alice_0000000000000',
  email: 'alice@example.com',
  name: 'Alice',
  photo: null,
  provider: 'password',
  emailVerified: true,
};

export const ME_SIGNED_IN = {
  signedIn: true,
  user: USER,
  maintenance: { mode: 'off', message: null, until: null },
  policy: { tier: 1, flushMs: 30000, hiddenMinMs: 5000, refreshMs: 60000, pausedUntil: null },
};

/** `/api/sync` answer: every part sent gets `status` (or what `statusOf` says). */
export function syncHandler(statusOf: (hub: string, part: string) => string = () => 'accepted'): Handler {
  return async (call) => {
    const body = JSON.parse(await bodyText(call)) as { hubs: Record<string, Record<string, { upd: number }>> };
    const results: Record<string, Record<string, unknown>> = {};
    for (const [hub, parts] of Object.entries(body.hubs)) {
      results[hub] = {};
      for (const [part, payload] of Object.entries(parts)) {
        const status = statusOf(hub, part);
        results[hub][part] = status === 'rejected' ? { status, upd: 0, code: 'too_large' } : { status, upd: payload.upd };
      }
    }
    return json({ results, policy: ME_SIGNED_IN.policy });
  };
}

export function mockServer(overrides: Record<string, Route | undefined> = {}) {
  const routes: Record<string, Route | undefined> = {
    'GET /catalog.json': rawCatalog(),
    'GET /api/config': FAKE_CONFIG,
    'GET /api/me': { signedIn: false },
    'POST /api/auth/session': { user: USER },
    'POST /api/auth/logout': () => new Response(null, { status: 204 }),
    'POST /api/sync': syncHandler(),
    ...overrides,
  };
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    const method = (init.method ?? 'GET').toUpperCase();
    const call: Call = { path, method, headers: new Headers(init.headers), body: init.body, credentials: init.credentials };
    calls.push(call);
    const route = routes[`${method} ${path.split('?')[0]}`];
    if (route === undefined) return json({ code: 'not_found', message: 'not found' }, 404);
    if (typeof route === 'function') return route(call);
    if (route instanceof Response) return route.clone();
    return json(route);
  });
  vi.stubGlobal('fetch', fetchMock);
  return {
    fetch: fetchMock,
    calls,
    to: (key: string) => calls.filter((call) => `${call.method} ${call.path.split('?')[0]}` === key),
  };
}

/** Records BroadcastChannel posts (jsdom tabs cannot talk to each other). */
export function captureBroadcasts(): { name: string; message: unknown }[] {
  const posted: { name: string; message: unknown }[] = [];
  class FakeChannel {
    constructor(readonly name: string) {}
    postMessage(message: unknown) {
      posted.push({ name: this.name, message });
    }
    close() {}
    addEventListener() {}
    removeEventListener() {}
  }
  vi.stubGlobal('BroadcastChannel', FakeChannel);
  return posted;
}

/** Set or clear the readable `sh_hint` cookie. */
export function setHint(value: string | null): void {
  document.cookie = value ? `sh_hint=${value}; path=/` : 'sh_hint=; Max-Age=0; path=/';
}

// --- local progress fixtures ----------------------------------------------------------------

export const T0 = 1_760_000_000_000;

/** A `studyhub.<id>.v2` record with the given part stamps. */
export function v2Record(upd: Partial<Record<'main' | 'mocks' | 'cards', number>>, done: Record<string, boolean> = { m1: true }) {
  return JSON.stringify({
    S: { v: 2, done, plan: {}, quiz: {} },
    MOCKS: [{ at: 1, score: 50 }],
    CARDS: { c1: { due: 1 } },
    U: { main: upd.main ?? 0, mocks: upd.mocks ?? 0, cards: upd.cards ?? 0 },
  });
}

/** Seed localStorage with dirty progress for DSA L1 (main + cards) and AI-103 (main). */
export function seedDirtyProgress(): void {
  localStorage.setItem('studyhub.dsa-l1.v2', v2Record({ main: T0 + 1, cards: T0 + 2 }));
  localStorage.setItem('studyhub.ai103.v2', v2Record({ main: T0 + 3 }));
  localStorage.setItem('studyhub.codeLang', 'python');
  localStorage.setItem('studyhubs.ui.nudge.dsa-l1', '1');
}
