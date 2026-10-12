// The shell's only door to /api (build-contracts.md §9-10).
//
// Every request carries `X-StudyHubs: 1` (the server's CSRF guard needs it on writes; GETs send
// it too, so all API traffic looks the same) and `credentials: "same-origin"`. Errors come back
// in one shape, `{code, message, retryAfter?, retryAt?}`, and are thrown as `ApiProblem`. A
// network failure or a timeout is an `ApiProblem` with status 0 (`network` / `timeout`).

export const PROTOCOL_HEADER = 'X-StudyHubs';
export const PROTOCOL_VERSION = '1';
/** Ordinary requests give up after 30 s. */
export const REQUEST_TIMEOUT_MS = 30_000;

export class ApiProblem extends Error {
  override name = 'ApiProblem';
  readonly status: number;
  readonly code: string;
  /** Seconds the server asked us to wait, when it said so. */
  readonly retryAfter: number | null;

  constructor(status: number, code: string, message = code, retryAfter: number | null = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

export function isApiProblem(value: unknown): value is ApiProblem {
  return value instanceof ApiProblem;
}

export interface ApiOptions {
  method?: 'GET' | 'POST';
  /** A JSON body (serialised here, sent as application/json). */
  json?: unknown;
  /** A prepared body (for example gzip bytes); pair it with the right headers. */
  body?: BodyInit;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
}

const DEFAULT_CODES: Record<number, string> = {
  400: 'bad_request',
  401: 'unauthenticated',
  403: 'forbidden',
  404: 'not_found',
  413: 'too_large',
  422: 'invalid',
  429: 'rate_limited',
  503: 'unavailable',
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

async function readJson(response: Response): Promise<unknown> {
  try {
    const text = await response.text();
    return text ? (JSON.parse(text) as unknown) : null;
  } catch {
    return null;
  }
}

function problemFrom(response: Response, body: unknown): ApiProblem {
  const status = response.status;
  const fallback = DEFAULT_CODES[status] ?? (status >= 500 ? 'server_error' : 'http_error');
  const code = isObject(body) && typeof body.code === 'string' && body.code ? body.code : fallback;
  const message = isObject(body) && typeof body.message === 'string' && body.message ? body.message : code;
  let retryAfter: number | null = null;
  if (isObject(body) && typeof body.retryAfter === 'number' && body.retryAfter >= 0) retryAfter = body.retryAfter;
  else {
    const header = Number(response.headers.get('Retry-After'));
    if (Number.isFinite(header) && header >= 0 && response.headers.has('Retry-After')) retryAfter = header;
  }
  return new ApiProblem(status, code, message, retryAfter);
}

/**
 * `fetch` an /api path and return its parsed JSON body (null for an empty body, e.g. 204).
 * Throws `ApiProblem` for any non-2xx answer, a network failure or a timeout; an abort through
 * `opts.signal` rethrows the AbortError.
 */
export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    [PROTOCOL_HEADER]: PROTOCOL_VERSION,
    ...opts.headers,
  };
  let body = opts.body;
  if (opts.json !== undefined) {
    body = JSON.stringify(opts.json);
    headers['Content-Type'] = 'application/json';
  }

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, opts.timeoutMs ?? REQUEST_TIMEOUT_MS);
  const outer = opts.signal;
  const onOuterAbort = () => controller.abort();
  if (outer) {
    if (outer.aborted) controller.abort();
    else outer.addEventListener('abort', onOuterAbort, { once: true });
  }

  let response: Response;
  try {
    response = await fetch(path, {
      method: opts.method ?? (body === undefined ? 'GET' : 'POST'),
      headers,
      body,
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch (error) {
    if (outer?.aborted) throw error;
    throw timedOut
      ? new ApiProblem(0, 'timeout', 'The server took too long to answer.')
      : new ApiProblem(0, 'network', 'Could not reach the server.');
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener('abort', onOuterAbort);
  }

  const data = await readJson(response);
  if (!response.ok) throw problemFrom(response, data);
  return data as T;
}

// ---------------------------------------------------------------------------------------------
// Typed endpoints

export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
}

export interface SiteConfig {
  authMode: 'firebase' | 'fake';
  firebase: FirebaseWebConfig | null;
  origin: string;
  version: string;
}

/** The signed-in user as /api/me and /api/auth/session describe it (never the raw uid). */
export interface MeUser {
  publicId: string;
  email: string | null;
  name: string | null;
  photo: string | null;
  provider: string | null;
  emailVerified: boolean;
}

export interface Maintenance {
  mode: string;
  message: string | null;
  until: string | null;
}

export type MeResponse =
  | { signedIn: false }
  | { signedIn: true; user: MeUser; maintenance: Maintenance | null; policy: Record<string, unknown> | null };

const text = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);

export function parseUser(raw: unknown): MeUser | null {
  if (!isObject(raw)) return null;
  const publicId = text(raw.publicId);
  if (!publicId) return null;
  return {
    publicId,
    email: text(raw.email),
    name: text(raw.name),
    photo: text(raw.photo),
    provider: text(raw.provider),
    emailVerified: raw.emailVerified === true,
  };
}

function parseMaintenance(raw: unknown): Maintenance | null {
  if (!isObject(raw)) return null;
  return { mode: text(raw.mode) ?? 'off', message: text(raw.message), until: text(raw.until) };
}

export function parseMe(raw: unknown): MeResponse {
  if (!isObject(raw) || raw.signedIn !== true) return { signedIn: false };
  const user = parseUser(raw.user);
  if (!user) return { signedIn: false };
  return {
    signedIn: true,
    user,
    maintenance: parseMaintenance(raw.maintenance),
    policy: isObject(raw.policy) ? raw.policy : null,
  };
}

export function parseConfig(raw: unknown): SiteConfig {
  if (!isObject(raw)) throw new ApiProblem(0, 'invalid_config', 'The site configuration is not readable.');
  const fb = isObject(raw.firebase) ? raw.firebase : null;
  const firebase =
    fb && text(fb.apiKey) && text(fb.authDomain) && text(fb.projectId) && text(fb.appId)
      ? {
          apiKey: fb.apiKey as string,
          authDomain: fb.authDomain as string,
          projectId: fb.projectId as string,
          appId: fb.appId as string,
        }
      : null;
  return {
    authMode: raw.authMode === 'fake' ? 'fake' : 'firebase',
    firebase,
    origin: text(raw.origin) ?? window.location.origin,
    version: text(raw.version) ?? '',
  };
}

let configPromise: Promise<SiteConfig> | null = null;

/** GET /api/config, once per page (a failure is not cached, so a retry asks again). */
export function fetchConfig(): Promise<SiteConfig> {
  if (!configPromise) {
    configPromise = api('/api/config').then(parseConfig);
    configPromise.catch(() => {
      configPromise = null;
    });
  }
  return configPromise;
}

/** Tests only: forget the cached config. */
export function resetConfigCache(): void {
  configPromise = null;
}

export async function fetchMe(signal?: AbortSignal): Promise<MeResponse> {
  return parseMe(await api('/api/me', { signal }));
}

/** POST /api/auth/session: trade a (Firebase or fake) ID token for the session cookies. */
export async function createSession(idToken: string): Promise<MeUser> {
  const body = await api<{ user?: unknown }>('/api/auth/session', { method: 'POST', json: { idToken } });
  const user = parseUser(body && body.user);
  if (!user) throw new ApiProblem(200, 'invalid_response', 'The server sent an unexpected answer.');
  return user;
}

/** POST /api/auth/logout (204; clears both cookies). */
export async function endSession(): Promise<void> {
  await api('/api/auth/logout', { method: 'POST' });
}
