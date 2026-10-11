# Study Hubs bridge

The script the server injects as the first script of every hub page (`/h/<slug>`). It emulates
`window.claude` for the unmodified hub files, adds the floating menu and the "AI isn't supported
here" notice, and hooks `localStorage` writes. The interface is fixed in
[`../docs/build-contracts.md` §6](../docs/build-contracts.md). M0 is anonymous mode only, and it
makes **zero network requests**.

```bash
npm ci
npm run build   # -> ../server/public/_sh/{bridge.js,fflate.js} + .br/.gz; fails if bridge.js.gz > 14 KB
npm test        # tsc (src, then tests) + vitest/jsdom; the bundle smoke test needs `npm run build` first
npm run size    # size report and budget check of the built files
```

## Modules (`src/`)

| File | Role |
|---|---|
| `index.ts` | Boot: reads `document.currentScript.dataset`, defines `window.claude = Object.freeze({use})`, installs the storage hook, mounts the menu on `DOMContentLoaded`, exposes `window.__studyhubsBridge` |
| `config.ts` | `data-hub-id`, `data-slug`, `data-engine`, `data-legacy-keys`, the `sh_hint` cookie, derived paths |
| `ai.ts` | `use("sample")`: `AI()` rejects `{code:"cancelled", text}`, `AI.json()` resolves `null`; both open the modal |
| `chrome.ts` | Floating pill, notices ("sign in to keep it" nudge, "Browser storage is full") |
| `storage-hook.ts` | `Storage.prototype.setItem/removeItem` wrapper: legacy sidecar, quota notice, logout guard, `onHubWrite` |
| `local-progress.ts` | Key names, record parsing, summaries and payload builders (the client copies this logic) |
| `legacy.ts` | `legacySeed()`; a no-op for `{signedIn:false}` |
| `db.ts`, `outbox.ts`, `transport.ts` | M1 sync. Today `db`/`user` resolve `null` and the outbox is inert |
| `theme.ts` | Shadow-DOM styling that follows the hub's own tokens, `data-theme` and `prefers-color-scheme` |
| `vendor/fflate.ts` | Entry for `/_sh/fflate.js` (`window.__shFflate = {gzipSync}`), loaded lazily by M1 |

## Notes for other parts of `site/`

- The modal and the menu live in **closed** shadow roots. Playwright cannot see inside them, so
  e2e tests should read `window.__studyhubsBridge.stats()`: `ai.modalOpen`, `ai.modalOpens`,
  `chrome.mounted`, `chrome.notices` (`"nudge"`, `"storage-full"`), `legacy.seedCalls`, `network`.
  The keyboard also works: the dialog takes focus when it opens, Tab moves between
  "Download this hub" and "Close", and Esc closes it.
- Shadow hosts are the custom elements `<studyhubs-chrome>` and `<studyhubs-ai-dialog>`.
- The output files must be served with `Content-Type: text/javascript`. They are ASCII-only, so
  the charset does not matter.
- `package.json` pins `vite` and overrides it to that version. Without this, npm 10 crashes
  while resolving vite 8's optional peer chain (`Cannot read properties of null (reading 'edgesOut')`).
