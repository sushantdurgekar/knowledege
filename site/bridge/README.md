# Study Hubs bridge

The script the server injects as the first script of every hub page (`/h/<slug>`). It emulates
`window.claude` for the unmodified hub files, adds the floating menu and the "AI isn't supported
here" notice, hooks `localStorage` writes and, for signed-in visitors, syncs the hub's progress
with the account (M1). The interfaces are fixed in
[`../docs/build-contracts.md`](../docs/build-contracts.md) §6 (M0) and §13 (M1); the detailed
behaviour is [`../docs/architecture-spec.md`](../docs/architecture-spec.md) §4.5. Anonymous
visitors still get **zero network requests**.

```bash
npm ci
npm run build   # -> ../server/public/_sh/{bridge.js,fflate.js} + .br/.gz; fails if bridge.js.gz > 16 KB
npm test        # tsc (src, then tests) + vitest/jsdom; the bundle smoke test needs `npm run build` first
npm run size    # size report and budget check of the built files
```

The gzip budget was 14 KB for M0's anonymous bridge; M1 raised it to 16 KB (M1 build: about 14.5 KB).

## Modes

| Mode | When | `use("db")` / `use("user")` | Requests |
|---|---|---|---|
| `anonymous` | no `sh_hint` cookie, or the server said `{signedIn:false}` | `null` | none |
| `mismatch` | `sh_hint` ≠ `studyhubs.owner` (this browser holds another account's progress) | `null`; notice linking to `/account` | none |
| `signed-in` | `sh_hint` present, owner absent or equal | v2 hubs: the synced DB and `{id:"me", isOwner:false}` after the prefetch | prefetch, `/api/sync`, `/api/me` once if the initial is not cached |

Signed-in v2 hubs start `GET /api/progress/<hubId>?known=main:<U>,mocks:<U>,cards:<U>` at boot.
`use("db")` waits for it (5 s timeout → `null`). A 429/5xx/network failure still hands out the DB:
`get()` then rejects `unavailable` (the hub shows "Sync paused") until the server answers, and
changes queue meanwhile. The first signed-in prefetch claims `studyhubs.owner`.

Legacy hubs (AI-901) sync through the seed script `/api/seed/<id>.js`, which calls
`__studyhubsBridge.legacySeed()` before the hub reads its key: a newer server copy is written
with the original `setItem`; newer local progress is queued; later hub writes are queued; a tab
that becomes visible after `refreshMs` checks for a newer copy and offers **Reload**.

## Modules (`src/`)

| File | Role |
|---|---|
| `index.ts` | Boot: config, storage hook, account mode (hint/owner), `window.claude = Object.freeze({use})`, menu, auth events, `window.__studyhubsBridge` |
| `config.ts` | `data-hub-id`, `data-slug`, `data-engine`, `data-legacy-keys`, the `sh_hint` cookie, derived paths |
| `ai.ts` | `use("sample")`: `AI()` rejects `{code:"cancelled", text}`, `AI.json()` resolves `null`; both open the modal |
| `chrome.ts` | Floating pill (Sign in, or the user's initial with Account / Sign out), notices with links or action buttons |
| `storage-hook.ts` | `Storage.prototype.setItem/removeItem` wrapper: legacy sidecar, quota notice, logout guard, own-write feed. The hook is also a `StorageLike` whose writes bypass the wrapper |
| `local-progress.ts` | Key names, record parsing, payload builders, synced stamps, owner tag, wipe; shared with the client (`@bridge-shared`) |
| `sync.ts` | Signed-in orchestration: transport, outbox, db, prefetch decision, lifecycle listeners, notices, profile initial, legacy mid-session check |
| `db.ts` | `DB.doc(path).get()/set()`: cache + refresh policy, stubs, read-your-writes, handover of another tab's newer record |
| `outbox.ts` | Pending parts, waiters (resolved on the server's acknowledgement), freshen, tier timers, unload flush (keepalive / gzip), backoff, error mapping |
| `transport.ts` | `fetch` with `X-StudyHubs: 1` and same-origin credentials, timeouts, `Retry-After`, the error-code table, lazy `/_sh/fflate.js` |
| `auth-events.ts` | `sh_hint` / owner state, BroadcastChannel `studyhubs` (`flush`, `auth-changed`, `logout`), account-switch guard, bfcache re-check |
| `legacy.ts` | `legacySeed()` rules for AI-901 |
| `theme.ts` | Shadow-DOM styling that follows the hub's own tokens, `data-theme` and `prefers-color-scheme` |
| `vendor/fflate.ts` | Entry for `/_sh/fflate.js` (`window.__shFflate = {gzipSync}`), loaded once a pending body passes 48 KB |

## Sync rules in one place

- **Waiters:** a hub `set()` resolves only when the server acknowledges a flush carrying
  `upd ≥` its `upd` (`accepted`, `duplicate` or `stale`). While a failure is being backed off
  (or sync is paused), `set()` queues the payload and rejects `unavailable` at once, so the hub's
  pill says "Sync paused"; after a background success the bridge rewrites `#syncPill` from
  `pill mid` to `pill ok` "Synced to your account".
- **Flushes:** `flushMs` after the first unsent change; on `visibilitychange → hidden` per
  `hiddenMinMs`; always on `pagehide` and `freeze`; `flushNow()` and the `flush` broadcast force
  one. Payloads are rebuilt from `localStorage` at flush time. At most one request is in flight,
  except an unload flush, which never waits (the page is going away). Unload flushes are
  deduplicated by body and use `keepalive` up to 60,000 B; larger bodies are gzipped with fflate
  (keepalive if that fits, else a normal fetch).
- **Errors:** 401 → `revoked` (sync off, "Session ended" notice); 403 → `not_granted`;
  400/404/422 → `invalid_argument`; 422 `clock_skew` → `unavailable`, retried every 10 min with a
  notice; 413 or a per-part `too_large` → `quota_exceeded` (that part is dropped until the hub
  sets it again); 429 `rate_limited` honours `Retry-After`; 429 `sync_paused` holds until
  `retryAt` + 0–10 min with "Sync resumes at …"; 503 `maintenance` shows a notice; other 5xx and
  network errors back off 15 s doubling to 10 min.
- **Auth events:** `logout` sets the logout guard (hub-key writes are dropped, `set()` rejects
  `revoked`), wipes progress (keeps `studyhub.codeLang` and `studyhubs.ui.*`) and reloads.
  `auth-changed` reloads hidden tabs; visible tabs show "Signed in — reload to sync" and reload on
  the next visibility change unless a mock exam is running. If the account behind the page
  changed, the logout guard goes on at once so nothing of the old account reaches the new one.

## Notes for other parts of `site/`

- The modal and the menu live in **closed** shadow roots. Playwright cannot see inside them, so
  e2e tests should read `window.__studyhubsBridge.stats()`: `mode`, `network`, `ai.modalOpen`,
  `ai.modalOpens`, `chrome.mounted`, `chrome.notices` (`"nudge"`, `"storage-full"`, `"mismatch"`,
  `"paused"`, `"clock"`, `"maintenance"`, `"too-large"`, `"session"`, `"auth"`, `"newer"`),
  `legacy.seedCalls`, `outbox` (`pending`, `flushes`, `errors`, `lastError`, `retryAt`, `hold`,
  `tier`, `acked`, `known`, `dead`) and `sync` (`ready`, `active`, `fetches`, `tabU`; `null` when
  the page never synced). `__studyhubsBridge.flushNow()` forces a flush and resolves when it
  settles. The keyboard also works: the dialog takes focus when it opens, Tab moves between
  "Download this hub" and "Close", and Esc closes it.
- Shadow hosts are the custom elements `<studyhubs-chrome>` and `<studyhubs-ai-dialog>`.
- The output files must be served with `Content-Type: text/javascript`. They are ASCII-only, so
  the charset does not matter.
- **Client shell:** after sign-in, call `writeProfile(localStorage, publicId, name || email)`
  (from `local-progress.ts`) so hub pages show the initial without a `GET /api/me`. Broadcast
  `{type:"auth-changed"}` after `writeOwner`, and `{type:"flush"}` / `{type:"logout"}` from the
  sign-out flow, on `new BroadcastChannel("studyhubs")`.
- `package.json` pins `vite` and overrides it to that version. Without this, npm 10 crashes
  while resolving vite 8's optional peer chain (`Cannot read properties of null (reading 'edgesOut')`).
