// Where to go after signing in (build-contracts.md §14, spec §4.6 step 6).
//
// `?next=` is user-controlled, so it is honoured only when it is the catalog, a hub page
// (`/h/<slug>`) or a known shell page; anything else (other origins, `//host`, odd paths,
// the auth pages themselves) falls back to `/`.

const NEXT_RE = /^\/(h\/[a-z0-9-]+)?$/;

/** Shell pages a sign-in may return to. The auth flow pages are left out on purpose. */
export const NEXT_ROUTES: ReadonlySet<string> = new Set(['/account', '/privacy', '/admin']);

export function isSafeNext(next: string | null | undefined): next is string {
  return typeof next === 'string' && (NEXT_RE.test(next) || NEXT_ROUTES.has(next));
}

/** The validated `next` path, or `/`. */
export function safeNext(next: string | null | undefined): string {
  return isSafeNext(next) ? next : '/';
}

/** `path?next=<next>` (or just `path` when next is the default `/`). */
export function withNext(path: string, next: string): string {
  return next === '/' ? path : `${path}?next=${encodeURIComponent(next)}`;
}

/** True when `next` points at a hub page (a full page served by the backend). */
export function isHubPath(next: string): boolean {
  return next.startsWith('/h/');
}
