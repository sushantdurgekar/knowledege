# Study Hub runtime contract for `bridge.js`

I read all 7 hubs. I checked the claims by running them in headless Chromium (Playwright 1.56 / chromium-1194) with a stub `window.claude` injected before `</head>`. Line numbers below are file line numbers. The test files are in `scratchpad/audit/test/`: `bridge-stub.js`, `run.js`, `run2.js` and `result.json`. Extracted engines and the sync/AI diff slices are in the parent `audit/` folder. No repo file was modified.

## 0. Inventory and engine identity

| Hub file | Bytes / lines | Variant | `HUB.id` | Script blocks (open–close line) |
|---|---|---|---|---|
| `dsa/hubs/dsa-l1-foundation-hub.html` | 393,273 / 1724 | A | `dsa-l1` | 492–494 (`window.HUB=` JSON on 493), 495–1723 engine |
| `dsa-l2-proficient-hub.html` | 550,160 / 1724 | A | `dsa-l2` | same as L1 |
| `dsa-l3-specialist-hub.html` | 707,265 / 1724 | A | `dsa-l3` | same as L1 |
| `ab-620/AB-620 Study Hub.html` | 589,691 / 3690 | B | `ab620` | 419–2583 (HUB object literal from 420), 2584–3689 engine |
| `ai-500/AI-500 Study Hub.html` | 713,738 / 4340 | B | `ai500` | 419–3233 HUB, 3234–4339 engine |
| `ai-103/AI-103 Study Hub.html` | 802,992 / 5845 | B′ | `ai103` | 422–3888 HUB, 3889–4732 (`HUB.kid = {…}`), 4733–5844 engine |
| `ai-901/AI-901 Study Hub.html` | 202,873 / 1166 | legacy | (none) | 217 (`window.M=[];window.MOCK=[];window.CARDS=[]`), 218–335, 336–484, 485–692, 693–818, 819–867 data, 868–1165 engine |

- **Variant A:** the DSA L1, L2 and L3 engine scripts are byte-identical (md5 `f2acc1c1…`).
- **Variant B:** AB-620 and AI-500 engines are byte-identical (md5 `d5248c21…`).
- **Variant B′:** AI-103 differs from B in only 3 hunks, all about the kid story (`moduleBrief` adds kid-story text, a new `kidHTML`, a "Story time" section). The sync and AI code is identical.

## 1. Script order and where to inject

- Every file starts on line 1 with `<!doctype html><html…><head><meta charset><meta viewport><style>…</style></head><body>`.
  - `</head>` appears exactly once: byte 485 in DSA, 523 in the others.
  - Nothing runs in `<head>`.
  - `<title>`, the Google Fonts `<link>`s and the main `<style>` are inside `<body>`.
  - The shell markup comes next, then all scripts at the end of `<body>`.
  - The first `<script` tag is on line 492 (DSA), 419 (AB-620, AI-500), 422 (AI-103) and 217 (AI-901).
- **`window.claude` is read synchronously while the page is still parsing.**
  - The engine IIFE ends with `boot()`. Call lines: DSA 1720, AB 3686, AI-500 4336, AI-103 5841.
  - `boot()` calls `initSync()` (1717 / 3683 / 4333 / 5838) and then `initAI()` (1718 / 3684 / 4334 / 5839).
  - Both run synchronously up to their first `await`, so `use("db")`, `use("user")` and `use("sample")` are all called in that order during the engine's inline script.
  - Verified in the test: `document.currentScript` was the engine script and `readyState` was `"loading"`.
  - The presence check is `if (!window.claude || typeof window.claude.use !== "function")` at DSA 625/893, AB 2714/2972, AI-500 3364/3622, AI-103 4863/5121. If it fails, the hub goes local-only and the AI buttons stay hidden for that page load.
- **AI-901 reads storage at parse time.** `localStorage.getItem("ai901hub.v1")` runs at line 873, inside the IIFE that starts at line 868. Any seeding has to finish before that line runs.
- **Injection rule:** insert `<script src="/bridge.js" …></script>` immediately before the first `</head>`. It must be a classic synchronous script: no `async`, no `defer`, no `type=module`.
  - Change nothing else. The inline-script CSP hashes depend on the exact bytes.
  - Never add a `<base>` tag. The DSA graph SVGs use `marker-end="url(#id)"`.
  - AI-500 contains the text `<base />` inside JS strings (lines 1937 and 1949), so tag rewriting must not use a whole-file regex.
- If `bridge.js` fails to load, the hubs still work: local mode, AI buttons hidden, `no-ai` hint shown.

## 2. `window.claude` contract (variants A, B, B′)

Only `window.claude.use(name)` is ever called. Nothing else on `window.claude` is used: no `delete`, `collection`, query or snapshot calls.

### 2.1 `use("db")` and `use("user")`
- Call: `[db, user] = await Promise.all([use("db"), use("user")])` at 628 / 2717 / 3367 / 4866, wrapped in `try{}catch{}`.
  - Any rejection leaves `db` null and the hub goes local. There is no error code check.
- `if (!db)` → `setSync("local")` (629 / 2718 / 3368 / 4867).
- `owner = user ? await user.isOwner() : false; uid = user ? await user.id() : null;` in one `try` (631 / 2720 / 3370 / 4869).
  - Both values are awaited, so plain values or promises both work.
  - If either call throws, `uid` stays null.
- `base = owner ? "progress" : (uid ? "data/users/" + uid : null)`. A null base means local (632 / 2721 / 3371 / 4870).
- **Paths never include the hub id.** Paths are `progress/{main|mocks|cards}` or `data/users/<uid>/{main|mocks|cards}`. Verified: owner gets `progress/main…`, other users get `data/users/u1/main…`.
  - The bridge must add the hub namespace itself. `window.HUB.id` is already set when `use()` is called.
  - The server must take the uid from the session, never from the path.

### 2.2 `db.doc(path)`
`db.doc(path)` is called synchronously and must return `{get, set}` at once.

**`get()`** — called at 616 / 2705 / 3355 / 4854. Must return `Promise<snap>`:
- `snap.exists` is read as a **boolean property**, not called (617). A Firestore-v9-style `exists()` method would always be truthy.
- `snap.data()` is called up to twice per snap. It must return the stored payload `{hub, upd, …}`, or `undefined`.
- `pullRemote` (611–623) walks main, then mocks, then cards, one after another:
  - `applyRemote` (602–610) applies a part only if `data.upd > U[part]`.
  - If local is newer, the hub calls `flush(part)`.
  - If the remote part is missing and `U[part]` is set, the hub calls `flush(part)`.
  - Any `get()` rejection calls `setSync("error")` and stops the loop. Error codes are ignored.
  - After the loop it calls `saveLocal()`.

**`set(value)`** — called at 591 / 2680 / 3330 / 4829 with `JSON.parse(JSON.stringify(payload(part)))`. The resolved value is ignored. `payload()` (581–585) builds:
- main: `{hub: H.id, upd: U.main, S}`
- mocks: `{hub, upd: U.mocks, list: MOCKS.slice(-25)}`
- cards: `{hub, upd: U.cards, map: CARDS}`

`upd` is the client's `Date.now()`. Return it unchanged.

**Error codes `set()` can return** (594–596 / 2683–2685 / 3333–3335 / 4832–4834):

| Code | Hub reaction | Tested result |
|---|---|---|
| `invalid_argument`, `not_granted`, `revoked`, `capability_disabled`, `capability_removed` | `SYNC.db = null` for the rest of the page load; pill shows local | `revoked`: pill "Saved in this browser", a second change sent no `set` |
| `quota_exceeded` | Pill "Sync paused, saved in this browser" plus toast "Account storage is full; progress stays in this browser." | Confirmed |
| anything else | Pill "Sync paused, saved in this browser"; sync stays on, and the next change tries again | Confirmed |

The hub has no retry timer.

### 2.3 `use("sample")`
- Call: `AI = await use("sample")` in `try`; a rejection sets `AI = null`. Then `body.classList.toggle("has-ai", !!AI)` (894–895 / 2973–2974 / 3623–3624 / 5122–5123).
- CSS lines 349–351 in every engine hub: `.ai-only{display:none!important}`, `body.has-ai .ai-only{display:revert!important}`, `body.has-ai .no-ai{display:none!important}`.
- **To keep the AI buttons visible, `use("sample")` must resolve to a truthy callable.**
- **Stream call:** `AI(input, {signal: AbortSignal, modelTier: "default", cache: false, onText: ({text}) => …})` must return `Promise<{text, truncated?}>`. Called at 935 / 3014 / 3664 / 5163.
  - `input` is a string for Explain.
  - It is an array of `{role: "user"|"assistant", content}` for Tutor chat and Interview. The test logged 2 elements for chat.
- **JSON call:** `AI.json(input: string, {modelTier: "default", cache: false})` must return `Promise<json>`. Called at 948 / 3027 / 3677 / 5176.
  - Teach-back expects an object `{score, covered[], missing[], misconceptions[], feedback, improved}`.
  - Fresh questions expect an array of `{q, o[], a, e}`.
- **Errors (`aiFail`, 897–907 / 2976–2986 / 3626–3636 / 5125–5135):**

| Code | Effect |
|---|---|
| `not_granted`, `sampling_disabled`, `not_declared`, `capability_disabled`, `capability_removed` | `AI = null`, `has-ai` removed (**all AI buttons disappear**), message "Claude isn't available on this page right now, so the tutor buttons are hidden." |
| `rate_limited` | "Claude is busy or your usage limit was reached…" |
| `session_expired` | "Your session expired…" |
| `refused` | "Claude declined that request…" |
| `prompt_too_large` | "That was too much text at once…" |
| `invalid_json` | "The answer came back in the wrong shape…" |
| `cancelled` | empty string |
| anything else | "Something went wrong reaching Claude. Try again." |

- `e.text` is only shown on the stream path: `outEl.innerHTML = (e.text ? mdBlock(e.text) : "") + (msg ? <p class="ai-note">msg</p> : "")` (940 / 3019 / 3669 / 5168).
- `mdBlock` escapes HTML and supports `**bold**`, `*i*`, `` `code` ``, lists, and links of the form `[t](https://…)` only. Links open with `target="_blank" rel="noopener"`, so the link must be an absolute URL.

## 3. Browser storage (nothing else is used)

There is no sessionStorage, cookie, IndexedDB, Cache API, `storage` event, `pagehide` or `beforeunload` in any hub (checked with grep).

| Key | Hubs | Read | Written | Value | Synced by hub |
|---|---|---|---|---|---|
| `studyhub.<id>.v2` (LKEY 554 / 2643 / 3293 / 4792) | A, B, B′ | **Once at load**: `loadLocal()` 560–567, called at 569 / 2658 / 3308 / 4807. Never read again. | `saveLocal()` 568 runs on every `touch()`, on **every tab switch** via `show()` writing `S.last` (685 / 2767 / 3417 / 4916; measured 1 write per switch), and at the end of `pullRemote` | `{S, MOCKS, CARDS, U:{main,mocks,cards}}` | yes, via `db` |
| `studyhub.<id>.mockrun` (1510 / 3488 / 4138 / 5643) | A, B, B′ | When the Mock tab renders (`loadRun` 1512, used 1514) | `saveRun` 1511: mock start, each answer, navigation, flag and confidence change; `removeItem` on finish or discard (1598) | `{set, ids[], orders[{o,s,r,d,y}], R, F, C, end, start, i}` | no (local only) |
| `studyhub.codeLang` (1168) | A only | When code tabs render (`langPref` 1169) | Code-language tab click (1170, listener 1712) | `"python"` / `"javascript"` | no (shared by all DSA hubs) |
| `ai901hub.v1` (871) | AI-901 | Once at 873 | `save()` 874 | `{done:{mId:bool}, plan:{pId:bool}, mistakes:[{when,src,q,given[],correct[]}], mockHist:[{date,pct,d1,d2}]}` | no |

- `S` defaults (`defState` 555 / 2644 / 3294 / 4793): `{v:2, done, plan, quiz, mis(≤400), dstat, labs, teach, skills, diag, pace:{h,start}, cases, last}`. DSA also has `probs`.
- `MOCKS` is capped at 40 locally (1581) but only 25 are synced. `CARDS` is `{cardId: [box, dueDayNum]}` (1658).
- `touch()` call sites, all `"main"` except where noted:
  - DSA: 653, 1017, 1266, 1335, 1336, 1341, 1344, 1403, 1413, 1418, 1500, 1582 (mocks), 1623, 1658 (cards).
  - AB: 2742 … 3625. AI-500: 3392 … 4275. AI-103: 4891 … 5780. Same set, without `probs`.
- **Storage quota risk:** on claude.ai every hub had its own origin. On the site, all hubs share one origin's ~5 MB localStorage. A heavy user can reach about 150 KB per hub; about 47 hubs are planned. `saveLocal` swallows quota errors silently. This is not a problem at 7 hubs, but it will become one as hubs are added.

## 4. Lifecycle and timing

- **Boot order** (1710–1719):
  1. `buildShell(); header(); setSync("local")`
  2. DSA only: code-language click listener
  3. First render via `openModule(hash)`, `show(hash)` or `show(S.last)`
  4. `initSync()`, then `initAI().then(() => { if (AI && CURVIEW === "learn" && $("#chatLog")) bindTutor(...) })`
- **The first render always uses local state.** Sync and AI start afterwards.
- **`initSync`** (624–641):
  - Sets `setSync("loading")` ("Connecting…") synchronously.
  - Sets `SYNC.db`/`SYNC.base`, runs `pullRemote()`, then shows "Synced to your account" unless the state is `"error"`.
  - If anything changed it calls `rerenderAll()`.
  - Only then does it register the `visibilitychange` listener. When visible and no mock is running, it calls `pullRemote()` again (3 `get`s; verified), followed by `rerenderAll()`.
- **If `use()` settles immediately**, everything resolves in the microtask checkpoint right after the engine script. "Connecting…" and the hidden AI buttons never get painted.
- **A late `use("db")` is safe.**
  - Tested with a 2.5 s delay: the pill showed "Connecting…" while waiting. A change made during the wait was saved locally (`SYNC.db` was still null), then flushed after the pull because it was newer. Final pill: "Synced to your account".
  - Caveat: conflicts are resolved per part, newest wins. Local edits made during the wait beat newer remote data for that part.
  - Caveat: a late remote apply calls `rerenderAll()`, which clears unsaved inputs in the current view (teach-back text, chat input). The Mock view is skipped.
  - If `use()` never settles, the pill stays on "Connecting…" forever.
- **A rejected `use("db")` and a null `use("db")` behave the same:** pill "Saved in this browser" (both tested). A null `use("user")` or a missing `isOwner` also means local.
- **A late `use("sample")` is safe.** Buttons are bound regardless and check `AI` on click. The tutor chat is bound in `renderModule` only `if (AI)` (1417 / 3395 / 4045 / 5550) or by the `initAI().then` above.
  - Edge case: if a `rerenderAll` lands between the `AI` assignment and that `.then`, `bindTutor` runs twice and every send fires twice. Resolving `sample` immediately avoids this.
- **Sync pill text** (`setSync` 574–580; map at 577 / 2666 / 3316 / 4815):

| State | Text | Class |
|---|---|---|
| `local` | "Saved in this browser" | `pill` |
| `cloud` | "Synced to your account" | `pill ok` |
| `error` | "Sync paused, saved in this browser" | `pill mid` |
| `loading` | "Connecting…" | `pill info` |

  - "cloud" is set only after a successful `set`, or after the initial pull with no error.
  - A successful pull on `visibilitychange` does **not** clear "error". Only the next successful `set` does.

## 5. Differences between variants that matter to the bridge

| Item | A (DSA) | B (AB-620 / AI-500) | B′ (AI-103) |
|---|---|---|---|
| Sync code (state section through `initSync`) | identical except `defState` has `probs` | — | identical to B |
| AI plumbing (`initAI` / `aiFail` / `aiStream` / `aiJSON`) | identical; prompt text uses `H.aiCtx`, footer uses `H.aiCheck` | fixed text | identical to B |
| Extra storage key | `studyhub.codeLang` | none | none |
| Script layout | 1 data script + engine | 1 data script + engine | 2 data scripts + engine |
| Behaviour in tests | — | identical results for every test, apart from module ids | identical results for every test, apart from module ids |

One `bridge.js` covers all three variants.

## 6. AI-901 (legacy)

- State: `const KEY = "ai901hub.v1"` (871); `S = {done:{}, plan:{}, mistakes:[], mockHist:[]}` (872).
- Load: `S = Object.assign(S, JSON.parse(raw))` at 873 (shallow merge; parse errors are ignored). **Storage is never read again.** No `window.claude`, no AI calls, no sync pill.
- `save()` (874) does `localStorage.setItem(KEY, JSON.stringify(S))` with no timestamp. All 7 call sites:
  1. 949 — plan checkbox
  2. 978 — wrong quiz answer; pushes a mistake and shifts if over 200
  3. 1018 — quiz ≥80% marks the module done
  4. 1019 — "Mark done" toggle
  5. 1048 — clear mistakes (on second click)
  6. 1101 — mock finished, `mockHist` push
  7. 1102 — mock finished, mistakes push **without a cap**, so `mistakes` can grow without limit through mock retakes
- First render happens at 1161–1163.
- Non-AI buttons: "Copy for Claude" (1045–1047) and "Copy results for Claude" (1115–1120) use the clipboard only.

**Cleanest way to sync it (verified in the test):**
- The bridge runs before line 868. It captures `const orig = Storage.prototype.setItem`.
- If the server copy is newer than a local sidecar timestamp, it writes the server's string to `ai901hub.v1` using `orig`. Test: a seed with 2 modules done rendered "2 / 17 modules".
- It then replaces `Storage.prototype.setItem` using `Object.defineProperty`. The wrapper calls `orig`, then, only when `this === localStorage && key === "ai901hub.v1"`, records `upd = Date.now()` in a sidecar key and debounces a push of `{upd, raw}`. Test: clicking a plan checkbox triggered the wrapper.
- Assigning `localStorage.setItem = fn` does not work; it creates a storage item called "setItem".
- **The seed must be available synchronously.** Use a blocking per-user `<script src="/api/hubs/<slug>/seed.js">` (no-store) placed after `bridge.js`, or inline JSON in the response. A fetch is too late: the hub has already read its state and would overwrite the server copy on its next `save()`.
  - Fallback if the seed arrives late: if the remote copy is newer and nothing has been saved since load, write it and `location.reload()`.
- Changes from another device during a session also need a reload. Showing a "reload" banner on `visibilitychange` is an option.
- Keep the sidecar timestamp for anonymous users too, so that newest-wins merging works at first sign-in.

## 7. Serving from an https origin or in an iframe

- **Inline scripts and CSP.** Inline script counts: 2 (DSA, AB, AI-500), 3 (AI-103), 7 (AI-901).
  - Use a per-hub `script-src 'self' 'sha256-…'` with hashes computed at catalog build time. Nonces would mean rewriting the HTML on every request.
  - There are no `on*=` handlers, `javascript:` URLs, `eval`, `new Function`, workers or blob URLs. `new RegExp` is fine.
  - Style attributes appear statically (117 / 92 / 93 / 53) and are also generated with `innerHTML`, so `style-src` needs `'unsafe-inline'` plus `https://fonts.googleapis.com`.
  - `font-src https://fonts.gstatic.com`.
  - The hubs make no network requests of their own, so `connect-src 'self'` is only needed for the bridge.
  - Also set `base-uri 'none'` and `frame-ancestors 'self'`.
  - Blocked fonts fail softly to fallback fonts.
- **Clipboard.** `navigator.clipboard.writeText` (copyText 532 / 2621 / 3271 / 4770; AI-901 884) needs a secure context, and `allow="clipboard-write"` inside an iframe. All hubs fall back to a select-and-copy textarea.
- **Links and navigation.** Links use `target="_blank" rel="noopener"`. A sandboxed iframe would need `allow-popups allow-popups-to-escape-sandbox`, and the download button needs `allow-downloads`.
  - The hubs never navigate the top window, never use `top`, `parent` or `postMessage`, and never change `location`.
  - `location.hash` is read once at boot for deep links (`#<view>` or `#<moduleId>`; 1713; AI-901 1163), so the hash must be kept in hub URLs.
- **Iframe problems.** `window.scrollTo(0,0)` on every view change and the sticky header only work if the iframe scrolls itself at full height. A cross-origin iframe gets partitioned storage and blocked third-party cookies. **A top-level page is the better choice.**
- **Shared origin.** All hubs share the site origin's localStorage: the keys don't collide, but the quota is shared (see §3). Site code must not use the `studyhub.` or `ai901hub.` prefixes. Progress saved on claude.ai does not carry over.
- **Bridge UI isolation.** Hub CSS styles generic classes (`.btn`, `.panel`, `.row`, `.pill`, `.toast`). The bridge's modal must live in a Shadow DOM and sit above the sticky header.
- `<meta charset=utf8>` is valid. Serve the bytes unchanged with `text/html; charset=utf-8`.

## 8. AI entry points and what users see

**Entry points** (DSA / AB / AI-500 / AI-103 lines). All are `.ai-only`, so they are visible only while `body.has-ai`.
1. **"Explain my answer with Claude"** (`[data-explain]`, markup 854 / 2933 / 3583 / 5082). Uses `aiStream` with a **string** into `[data-explain-out]`. Shown after an answered item in:
   - module quiz, Practice and fresh AI questions (868 / 2947 / 3597 / 5096)
   - diagnostic (1272 / 3255 / 3905 / 5408)
   - case results (1502 / 3480 / 4130 / 5635)
   - mock review (1594 / 3572 / 4222 / 5727)
2. **Teach-back "Grade it with Claude"** (`#tbGrade`, 1406 / 3384 / 4034 / 5539). Uses `aiJSON` into `#tbOut`. Fewer than 20 characters shows a toast and makes no AI call.
3. **"Generate 5 fresh questions with Claude"** (`#freshQ`, 1416 / 3394 / 4044 / 5549). Uses `aiJSON` into `#freshOut`.
4. **"Ask the tutor" chat** (`tutorHTML` 974 / 3052 / 3702 / 5202; Send or Enter 1003 / 3081 / 3731 / 5231). Uses `aiStream` with an **array** into a new `.bub.ai`.
5. **Interview tab "Mock interview with Claude"** (`#ivStart` 1687; `ask` at 1678 / 3645 / 4295 / 5800; send 1690 / 3657 / 4307 / 5812). Uses `aiStream` with an **array**.
6. **Start tab "Your Claude tutor is on"** panel (1232 / 3215 / 3865 / 5368). Text only, but it will be visible.

The "Copy … for Claude" buttons (mCopy 1437, rCopy 1591, fCopy 1649) are always visible and only use the clipboard.

**Tested display matrix** (all 3 variants gave the same results; MSG is the owner's text with a Markdown download link):

| Rejection | Explain (stream, string) | Chat / Interview (stream, array) | Teach-back / Fresh (`aiJSON`) | Buttons afterwards |
|---|---|---|---|---|
| (a) `{code:"cancelled", text:MSG}` | MSG rendered cleanly (bold, paragraph, link) | Bubble wiped at once by `paint()`; the learner's question is popped and the input was already cleared. **Nothing visible.** | "Stopped." | stay visible |
| (b) unknown code + text | MSG plus "Something went wrong reaching Claude. Try again." | Nothing visible | "Something went wrong reaching Claude. Try again." | stay visible |
| `cancelled`, no text | empty | Nothing visible | "Stopped." | stay visible |
| hide-list code (e.g. `not_granted`) | — | — | "Claude isn't available on this page right now…" | **all AI buttons hidden** |
| resolve `{text:MSG}` for array input; `AI.json` resolves `null` | — | MSG stays as a tutor bubble and the question stays | Output cleared, nothing shown | stay visible |

**Recommendation:**
- The hub cannot show the owner's message on the chat, interview or JSON paths. So the bridge must open its own modal on every `AI()` and `AI.json()` call.
  - The modal says: "AI isn't supported here. Download this hub and use it in your own AI provider for Ask-AI features".
  - It has a "Download this hub" button and a Close button.
  - Only one modal at a time; ignore repeat calls while it is open.
- Error shape for both `AI()` and `AI.json()`: an already-rejected promise with `{code: "cancelled", text: "**AI isn't supported here.** Download this hub and use it in your own AI provider for Ask-AI features.\n\n[Download this hub](<absolute https URL>)"}`.
  - Explain shows the message inline with no contradictory note.
  - The JSON paths show only "Stopped.".
  - Rejecting synchronously means "Thinking…" is never painted.
  - Never call `onText`.
  - Never use an unknown code or a hide-list code.
- Optional refinements, checked against today's engines:
  - Resolve `{text: MSG, truncated: false}` when `input` is an array, so chat and interview keep the message.
  - Have `AI.json` resolve `null` for a blank result instead of "Stopped.". This is less robust if a future engine doesn't check for null.

## Bridge requirements

1. **Injection.** Insert `<script src="/bridge.js" data-hub="<slug>" data-hub-id="<HUB.id>" data-kind="engine|legacy" data-legacy-key="…" data-download="/hubs/<slug>/download"></script>` (plus an optional blocking `<script src="/api/hubs/<slug>/seed.js">`) immediately before the first `</head>`.
   - Classic synchronous scripts only.
   - No other byte changes and no `<base>`.
   - The catalog builder classifies hubs (engine if the file has `window.claude.use("db")` and `window.HUB =`, otherwise legacy from an explicit key map) and computes inline-script SHA-256 hashes.
2. **Define `window.claude = {use}` synchronously**, inside an IIFE.
   - Don't touch the hub globals (`HUB`, `M`, `MOCK`, `CARDS`) or the `window.HUB` value.
3. **`use(name)` always returns a promise that settles.**
   - `"db"` and `"user"` time out to `null` within about 5 s.
   - An unknown name rejects with `{code: "not_declared"}`.
4. **Anonymous users:** `use("db")` and `use("user")` resolve `null` within microtasks. Know the auth state synchronously, for example from the seed script.
5. **Signed-in users:**
   - `use("user")` returns `{id: async () => uid /* no "/" */, isOwner: async () => false}`.
   - `use("db")` returns `{doc(path)}`, and `doc` returns `{get, set}` synchronously.
6. **Path handling:** accept `^(progress|data/users/[^/]+)/(main|mocks|cards)$` and use the last segment as the part.
   - Namespace is (session uid, `window.HUB.id` checked against `data-hub-id`).
   - Ignore the path prefix and uid.
   - A malformed path rejects with `invalid_argument` (bugs only, because this turns sync off for the page).
7. **`get()`** returns `{exists: <boolean property>, data: () => deepCopy(storedPayload) | undefined}` with `upd` unchanged.
   - Prefetch all 3 parts in one request, started when the bridge loads.
   - Serve the 3 sequential `get`s from that response.
   - If you cache `visibilitychange` pulls, update the cache on every acknowledged `set`. Otherwise stale data triggers needless flushes.
8. **`set(payload)`** checks `payload.hub === HUB.id`, that `upd` is a number, and that `S`, `list` or `map` is present.
   - Store it exactly as received.
   - Keep the last payload per part and batch all changed parts into one request.
   - Resolve after the server acknowledges.
   - Server side: one document per (user, hub). If out-of-order beacon writes are a concern, guard on `upd`.
9. **`set()` error mapping:**
   - Signed out or revoked → `"revoked"`.
   - Daily quota, maintenance (503), network or 5xx → a generic code such as `"unavailable"`, shown as "Sync paused".
   - Per-user size cap → `"quota_exceeded"` (toast).
   - Never use `invalid_argument`, `not_granted` or `capability_*` for temporary failures.
   - Any `get()` rejection just shows "Sync paused".
10. **The bridge owns retries.** Retry changed parts with backoff, on `online`, and when the tab becomes visible. Optionally set `#syncPill` to `class="pill ok"`, `<span class="dot"></span>Synced to your account` after a background success.
11. **Flush on exit.** On `visibilitychange`→hidden and on `pagehide`, rebuild the payloads from `localStorage["studyhub."+HUB.id+".v2"]`, exactly as `payload()` does (including `MOCKS.slice(-25)`).
    - Send only parts whose `U[part]` is newer than the last acknowledged `upd`.
    - Use `fetch(..., {keepalive: true})` with cookie auth (64 KiB limit; larger bodies use a normal fetch).
    - localStorage always holds the latest state, and the hub re-flushes local-newer parts on its next load, so a missed flush only delays sync.
12. **Pre-seed (recommended).** Before the engine runs, for each part where `remote.upd > local U[part]`, write `S`, `MOCKS` or `CARDS` plus `U[part]` into LKEY using the original `setItem`. This avoids the first-render flash, the re-render that clears inputs, and the extra round trips.
    - Store the owner uid next to local data, and never merge leftovers that belong to a different uid.
13. **First sign-in merge:** the hub's per-part newest-wins pull handles hubs that get opened. Optionally the site shell can sweep `studyhub.*.v2` and the legacy keys at sign-in.
14. **Logout.**
    - Remove `studyhub.*` (`.v2`, `.mockrun`, `codeLang`), the legacy keys and the bridge sidecars.
    - Broadcast (BroadcastChannel) so every open hub tab reloads immediately; hubs rewrite LKEY from memory on every tab switch.
    - After logout, `set()` rejects with `"revoked"`.
    - When the user signs in from another tab, reload open hub tabs as well; `initSync` runs only once per page load.
15. **`use("sample")`** resolves immediately (no network) to a function `AI` that has `AI.json`. Never reject it, so `body.has-ai` keeps every AI button visible.
16. **`AI()` and `AI.json()`** open the modal (one at a time) and return `Promise.reject({code: "cancelled", text: MSG_MD})`, with the download link written as an absolute https URL.
    - Ignore `signal` and never call `onText`.
    - Optionally resolve `{text: MSG_MD, truncated: false}` for array input.
17. **Modal.**
    - Shadow DOM, z-index above the sticky header and toasts.
    - `role="dialog"`, `aria-modal`, Esc to close, focus restored on close.
    - A "Download this hub" link (same-origin, `download` attribute) that serves the **original, unmodified** file with `Content-Disposition: attachment; filename*=UTF-8''…`.
18. **Legacy AI-901 (before line 868).**
    - Seed `ai901hub.v1` from the synchronous seed when the server copy is newer than the sidecar timestamp.
    - Wrap `Storage.prototype.setItem`, filtered to `this === localStorage && key === legacyKey`; call the original, then update the sidecar timestamp, debounce the push, and flush on hidden or `pagehide`.
    - Keep the sidecar for anonymous users too.
    - Mid-session remote changes need a reload.
    - Watch the size: `mistakes` has no cap on the mock path.
19. **CSP header per hub:** `default-src 'none'; script-src 'self' <inline sha256 list>; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`.
20. **Serve hubs as top-level pages** and keep `#hash` deep links.
    - If an iframe is used: same origin, full height with its own scrolling, `allow="clipboard-write"`, and any sandbox must include `allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-downloads`.
21. **Shared storage.** Keep site storage keys out of the `studyhub.` and `ai901hub.` namespaces. Monitor total localStorage use on the origin as the number of hubs grows.