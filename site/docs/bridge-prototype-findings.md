# Bridge prototype findings: Study Hubs on a public site

The bridge approach works. All 10 scenarios pass in headless Chromium (Playwright 1.56.1). I tested the DSA L1 and AI-103 hubs as asked, plus AB-620 throughout. For scenarios 1–3 I also ran DSA L2 and AI-500, and scenario 9 ran on AI-901. The hub files were served byte-for-byte unchanged apart from one injected `<script src="/bridge.js">`. The final full run used the final `bridge.js` (sha256 checked) and every script exited OK. `git status` in the vault repo is empty: no repo file was changed.

## Files

Everything is under `scratchpad/proto/`:

- **Final bridge:** `bridge.js` (21 KB, ES5-style)
- **Mock backend:** `server.js` (Node http)
  - Serves hubs with the script injected before the first `<script>`, `</head>` or `<body>`, whichever comes first.
  - In-memory doc store keyed by the session user; it ignores any user id in the path.
  - Rule "newest wins": a write with a lower or equal `upd` is ignored and gets 200 `{applied:false}`.
  - Cookie session, fault injection and a request log.
  - Download route returns the original file.
- **Mock logout page:** `account.html`
- **Lazy-loaded sync gzip:** `vendor/fflate.umd.js` (fflate 0.8.2, MIT, 32.6 KB, 12.5 KB gzipped)
- **Test scripts:** `lib.js`, `s123.js`, `s3b.js`, `s45.js`, `s6.js`, `s7.js`, `s8.js`, `s910.js`, `smulti.js`. `run-all.sh` runs the whole suite in about 11 minutes.
- **Evidence:** `evidence/*.json` (raw results), `evidence/summary.txt` (compact table), `evidence/*.png` (screenshots), `evidence/run-all.final.txt`.

## Results per scenario

| # | Scenario | Result | Evidence |
|---|---|---|---|
| 1 | No bridge | **PASS** | Tested on all 5 modern hubs. `window.claude` is undefined, pill says "Saved in this browser", and answering 2 quiz items writes `studyhub.<HUB.id>.v2` (keys `dsa-l1`, `dsa-l2`, `ai103`, `ab620`, `ai500`) with `U.main` set and `S.dstat` filled. Zero server calls. AI buttons are hidden (no `has-ai` class). |
| 2 | Bridge, anonymous | **PASS** | Pill stays "Saved in this browser" and progress stays in localStorage. Only one request (`GET /api/me 200`). Console and page errors are empty on all 5 hubs. `has-ai` is on, so AI buttons show as required. |
| 3 | Bridge, signed in | **PASS** | In direct mode you get `GET /api/me`, then `GET /api/docs/<hub>`, then `PUT /api/docs/<hub>/main` with keys `{hub,upd,S}` (hub is `HUB.id`, e.g. "ai103"). Pill says "Synced to your account". Flashcards and a mock exam (AI-103, AB-620) produce `PUT .../cards {hub,upd,map}` and `PUT .../mocks {hub,upd,list}`, and the server's `upd` matches local for all 3 parts. In coalesced mode all three go in **one** `POST /api/sync/<hub>`. |
| 4 | Remote newer than local | **PASS** | Seeded the server with `upd` 60 s ahead and 3 modules done. After sign-in and reload, localStorage holds the remote state, the header reads "3 / 8 modules" (DSA), "3 / 37" (AI-103) or "3 / 20" (AB-620), and `#doneM` shows "Marked done ✓ (undo)". The older local copy was **not** pushed (no writes in the log). Works in both modes. |
| 5 | Merge on first login | **PASS** | Anonymous answers plus a module marked done, then sign in and reload. Direct mode sends `PUT main`; coalesced mode sends `POST /api/sync parts=main`. Server `upd`, `S.done` and `S.dstat` equal local on all 3 hubs. |
| 6 | Server errors | **PASS** | Best mapping: **429, 503, 5xx and network errors become `unavailable`**. Full matrix below. |
| 7 | AI buttons | **PASS** | Clean shape found, with no "Something went wrong" (detail below). Download gives the original bytes: sha256 matches the repo file for all 3 hubs, no bridge tag inside, and the filename is kept ("AI-103 Study Hub.html"). Esc closes the dialog. |
| 8 | Write coalescing | **PASS** | Detail below. |
| 9 | AI-901 legacy | **PASS** | Detail below. |
| 10 | Logout hygiene | **PASS** | Detail below. |

## Scenario 6: which error code to return (direct mode, same on all 3 hubs)

Each row shows what the hub does when the bridge rejects with that code.

| Bridge code | Pill | Toast | Retries while down | Re-flush after recovery | Server ends up with latest |
|---|---|---|---|---|---|
| `unavailable` (for 503 or 429) | "Sync paused, saved in this browser" | none | yes, on next touch | yes, on `visibilitychange`→visible **and** on next touch | yes |
| `quota_exceeded` | same pill | "Account storage is full; progress stays in this browser." | yes | yes | yes, but the message is wrong for a daily quota or maintenance, so keep this code for 413 only |
| `revoked` / `not_granted` | "Saved in this browser" | none | **no** (the hub sets `SYNC.db = null`) | no | **no** until next page load; use only for 401/403 |

In coalesced mode:

- **Brief 503 failure:** the first POST gets 503 and the bridge retries by itself (Retry-After, then backoff of 15 s doubling up to 10 min). The second POST returns 200 and the server has the latest. The pill only flips to "Sync paused" on the hub's *next* `set()`, and flips back to "Synced" on the touch after recovery.
- **Long 429 (`Retry-After: 3600`):** pill shows "Sync paused", and `studyhubs.dirty.<hub>` is set to `{"parts":["main"]}`. After the quota is back and the page reloads, the server has the latest, the dirty marker is cleared and the pill says "Synced". No data was lost.

## Scenario 7: what each AI button shows

The overlay appeared on every click in every variant.

| `use('sample')` rejection shape | Explain | Teach-back / Fresh questions | Module chat / Interview |
|---|---|---|---|
| plain `Error` (no code) | "Something went wrong reaching Claude. Try again." | same message | log stays empty |
| `{code:"not_granted"}` | "Claude isn't available on this page right now, so the tutor buttons are hidden." | all AI buttons then **hidden** (breaks the requirement) | hidden |
| `AI()` rejects `{code:"cancelled"}` and `AI.json` rejects `{code:"cancelled"}` | inline message | "Stopped." | empty |
| **Final:** `AI()` rejects `{code:"cancelled", text:"**AI isn't supported here.** [Download this hub](<absolute URL>) …"}`; `AI.json()` resolves `null` | inline message with a working "Download this hub" link | nothing inline (the "Thinking…" text is cleared) | nothing inline |

With the final shape there are no page errors, `has-ai` stays on and the buttons stay visible.

## Scenario 8: write counts (10 answers)

| Mode | Quick pace (150 ms apart) | Learner pace (1.5 s apart) |
|---|---|---|
| Hub's own 1.2 s debounce | 1 PUT | **10 PUTs** |
| Bridge coalescer, 10 s window | 1 POST | **2 POSTs** |

Server state equals local in every case. Leaving the page about 0.2 s after the last answer, before the hub's debounce fires:

- **Direct mode:** 0 writes, so the server never gets those answers and a second device sees nothing.
- **Coalescer:** one keepalive POST on `pagehide` built straight from the hub's localStorage record. The server has the latest and the second device sees it.

**Large state.** Synthetic 400-mistake state:

- Main payload is about 86.5 KB, over the 64 KiB keepalive limit. The unload POST went out gzipped (about 3.6 KB on the wire) and the server had the latest.
- A real heavy user of a cert hub is about 50–60 KB (gzip about 4.4×). DSA L1 is about 10 KB.
- In about 13 unload-straight-after-an-answer runs, 1 (AI-103) sent no POST at all. This is best-effort: the local copy and the dirty marker mean the next load re-pushes.

## Scenario 9: AI-901 legacy hub

1. **Anonymous use:** `ai901hub.v1` is saved together with `studyhubs.legacy.ai901hub.v1.upd`, and nothing is written to the server.
2. **Sign in and reload:** one `POST /api/sync/ai-901 parts=legacy` with `{key, upd, raw}`.
3. **Empty second device:** the per-user seed script writes localStorage *before* the hub script reads it. The first paint already shows "1 / 17 modules", with no console errors.
4. **Change on device 2:** the wrapped `setItem` mirrors it and the server's `done` becomes `{m1,m2}`.
5. **Device 1 reload:** shows "2 / 17".

## Scenario 10: logout

The logout runs on the account page in a second tab. It broadcasts "flush", waits 400 ms, calls `POST /api/logout`, clears the hub keys and broadcasts "logout". Open hub tabs then reload.

- **DSA L1 and AI-103:** progress was still waiting in the bridge (the server didn't have it yet) and the account page showed the warning "Some progress has not reached your account yet". After logout:
  - the server **has** the latest;
  - the hub tab shows "Saved in this browser", "0 / 8" or "0 / 37", and "Mark module done";
  - localStorage holds only the fresh default record (`U.main` 0).
- **Signing in again** restores progress from the server.
- **AI-901:** 2 keys cleared, "0 / 17", and the server still has the data.

## Gotchas found

1. **Anonymous `/api/me` must return 200 with `{uid:null}`, not 401.** Likewise, missing docs must return 200 with `null` parts rather than 404. Chrome logs every 4xx/5xx as a console error ("Failed to load resource"). Real 429/503 responses will always log one line.
2. **Every flush path must be deduplicated.** On navigation, `pagehide` fires and then `visibilitychange(hidden)`. Before I added deduplication, each unload sent 2 identical POSTs.
3. **The 64 KiB keepalive budget is real for cert hubs.** Heavy-user state for AI-103, AB-620 and AI-500 is 50–60 KB and goes past 64 KiB with a long mock history. `CompressionStream` is async and cannot be awaited in `pagehide`, so the bridge lazy-loads fflate (only when the body is over 60 KB) and gzips synchronously. The server must accept `Content-Encoding: gzip` on `/api/sync`. FastAPI/Starlette does not decompress request bodies on its own, so decode in the endpoint and cap the decompressed size.
4. **The hub's debounce loses the last <1.2 s of answers on close.** The hub only saves remotely from its 1.2 s timer. The bridge fixes this by building payloads from `localStorage["studyhub.<id>.v2"]`, which `saveLocal()` writes on every touch, inside a `Storage.prototype.setItem` hook. This ties the bridge to the hub's payload shape (`{hub,upd,S}`, `MOCKS.slice(-25)`, `CARDS`), which is the stable format for new hubs.
5. **Pill timing in coalesced mode.**
   - `set()` resolves as soon as the write is queued, so "Synced to your account" means "queued" for up to one window. I kept this on purpose, because waiting on the real write doubles the write count.
   - A background failure only shows on the hub's next `set()`.
   - After the bridge recovers, the pill keeps saying "Sync paused" until the next touch, because the hub's visibility pull doesn't reset the pill.
6. **Reads.** The hub reads main, mocks and cards one after another on every load and on every switch back to the tab. The bridge answers all three from one `GET /api/docs/<hub>` and reuses it for 30 s. Store one Firestore doc per (user, hub) with each part as a field: that is 1 read per pull and 1 write per coalesced flush however many parts changed. All parts together must stay under 1 MiB, so store them as gzipped bytes fields.
7. **Multi-tab overwrite.**
   - **Already in the hubs:** an anonymous user with two tabs loses tab A's answers when tab B saves its older in-memory state (`smulti`: expected 3 answers, kept 1).
   - **Signed in, with the bridge:** fixed. `get()` hands over another tab's newer localStorage record, and the hub adopts it on `visibilitychange`→visible (kept 3 of 3).
   - **What to avoid:** handing over the tab's *own* record breaks merge-on-first-login. I hit this: scenario 5 direct mode failed until the bridge started tracking which U values this tab itself wrote (`ownU`).
8. **Newest wins uses the device clock** (`Date.now()`). A device whose clock runs fast wins every conflict. The server should ignore writes whose `upd` is lower or equal, never merge.
9. **401 in the middle of a session** maps to `not_granted`. The hub then stays browser-only for the rest of that page, data stays local, and it is pushed at the next signed-in load. A 401 that is only temporary therefore stops sync until reload.
10. **Download wording.** The hub's AI only works inside a Claude artifact (`window.claude.use('sample')`). Opened from disk, the downloaded file hides its AI buttons. The dialog text ("use it in your own AI provider") probably needs to say "open it in Claude".
11. **Wording left in the untouched hubs:**
    - "Explain my answer with Claude".
    - The Start-page panel "Your Claude tutor is on … uses your own Claude usage".
    - AI-901 says "Progress is saved in this browser only." and has no sync pill.
    - In the chat box the typed question disappears: the hub removes the turn on a failed reply.
12. **The inline download link must be an absolute URL.** The hub's markdown renderer only turns `https?://…` into links, so the bridge uses `location.origin + path`.
13. **Injection point and shared storage.** The script must run synchronously before any hub script (a parser-blocking `<script>`, never defer/async), because `initSync` and `initAI` run during the hub's own boot. All hubs share one origin's localStorage: the catalog builder must check that `HUB.id` is unique. `studyhub.codeLang` is shared across DSA hubs and is cleared on logout by prefix.
14. **AI-901 seed request.**
    - The seed is a second, per-user script (`/api/legacy-seed/<slug>.js`) with `Cache-Control: no-store` and `Vary: Cookie`. That costs 1 doc read per signed-in AI-901 load.
    - I chose this over a synchronous XHR, which is deprecated and prints a warning.
    - Legacy hubs can be spotted at catalog build time: there is no `window.HUB`, and the hub contains `const KEY="…"` plus `localStorage.getItem(KEY)`.
15. **Logout ordering.** Flush first, then end the session, then clear the prefixes `studyhub.`, `studyhubs.` and each legacy key, then broadcast. A tab that is closing must not save again: the `setItem` hook drops hub-key writes after logout. If any `studyhubs.dirty.*` key exists (sync paused), warn before clearing. Otherwise unsynced progress is lost on purpose.

## Final bridge.js

Full source: `scratchpad/proto/bridge.js` (21 KB). It is configured through `data-*` attributes the server sets on the script tag:

- `data-hub`: the site slug
- `data-download`: the download path
- `data-legacy-keys`: legacy localStorage keys (AI-901 only)
- `data-flush-ms`: coalescing window, default 45000
- `data-mode="direct"`: for testing only

What it contains:

- `use('db')` and `use('user')`: resolve `null` when anonymous. The db strips the hub's path down to the part name and never sends a user id.
- `use('sample')`: shows the overlay, which lives in a shadow DOM so hub CSS cannot affect it.
- The coalescer: flushes when its window expires, and with keepalive on hidden, `pagehide` or a broadcast flush.
- The `setItem` hook, the AI-901 seeding and mirroring, and the logout handling over BroadcastChannel.
- `window.__studyhubsBridge` for debugging.

The parts that decide behaviour:

```js
function codeFor(status) {
  if (status === 401 || status === 403) return "not_granted";   // hub goes browser-only for this page
  if (status === 413) return "quota_exceeded";                  // hub toasts "Account storage is full"
  if (status === 400 || status === 422) return "invalid_argument";
  return "unavailable";                                         // 429/5xx/network: "Sync paused, saved in this browser"
}
function aiStub() { showOverlay(); return Promise.reject(err("cancelled", AI_MSG,
  { text: "**AI isn't supported here.** [Download this hub](" + location.origin + DL + ") and use it in your own AI provider for Ask-AI features." })); }
aiStub.json = function () { showOverlay(); return Promise.resolve(null); };
```

Settings to decide for production:

- **Window size:** I tested 10 s; 45 s is the default. My estimate, not measured: 60–120 s plus the flush on hidden/`pagehide` gives about 15–20 writes per 30-minute session, against about 60 with the hub's own debounce.
- **Read reuse:** 30 s between real reads.
- **Server limit:** add a server-side per-user write limit as a backstop.