# Study Hubs client (React shell)

The site's React shell: the catalog at `/`, the M1 account pages (`/signin`, `/signup`, `/reset`,
`/verify`, `/signout`, `/account`), privacy and 404 pages. `/admin/*` is an M2 placeholder.
Hubs themselves are **not** part of this app. They are full pages served by the backend at
`/h/<slug>`, so the catalog links to them with plain `<a href>`, not router links.
Interfaces are fixed in [`../docs/build-contracts.md`](../docs/build-contracts.md) §7.

## Commands

```bash
npm ci
npm run dev        # http://localhost:5173, proxies /api /h /_sh /catalog.json to http://127.0.0.1:10000
                   # (override with STUDY_HUBS_BACKEND=http://127.0.0.1:PORT)
npm run build      # typecheck, then build into ../server/public, then check size budgets
npm test           # vitest + Testing Library (jsdom)
npm run size       # re-run the budget check on the current build
```

## Build output

`vite build` writes `index.html`, `assets/*`, `favicon.svg` and `robots.txt` into
`../server/public/`, plus `.br` and `.gz` siblings for files of 1 KB or more. The server
serves those siblings automatically (br > gzip > identity).

That folder also holds the bridge output in `_sh/`. So `emptyOutDir` stays `false`, and a
small plugin in `vite.config.ts` deletes only `assets/` and `index.html` (with its siblings)
before each build. Old bundles are never served, and `_sh/` survives.

Budgets, checked by `scripts/check-budgets.mjs` after every build (gzip level 9):

| What | Budget |
|---|---|
| Main JS: the entry script plus every chunk `index.html` preloads | 90 KB |
| CSS | 10 KB |

The main JS is about 82 KB gz today (budget 90 KB; the lazy Firebase chunk is about 29 KB of its 80 KB), and React DOM is most of it. Load new pages
(sign-in, account, admin, Firebase) lazily with `React.lazy` so the main chunk stays
within budget.

## Layout

```
src/main.tsx               entry: BrowserRouter (useTransitions={false}, see comment) + styles
src/App.tsx                route table (keep in step with SPA_ROUTES in ../server/app/static_routes.py)
src/components/            Layout (header, main, footer), AccountNav (user menu), Dialog, forms, HubCard, FilterBar
src/context/me.tsx         MeProvider: /api/me when the sh_hint cookie is present
src/pages/                 Catalog, SignIn (+ fake-mode test form), SignUp, ResetPassword, Verify, SignOut,
                           Account, ComingSoon (M2 admin placeholder), Privacy, NotFound
src/hooks/                 useCatalog, useStorageVersion, useDocumentTitle, useAuth, useSignInCompletion
src/lib/api.ts             the only door to /api (X-StudyHubs: 1, same-origin credentials, ApiProblem)
src/lib/auth-kit.ts        lazy loader of src/lib/firebase-auth.ts (Firebase chunk; never in fake mode)
src/lib/signin-flow.ts     session → account-switch dialog → reconcileUp → owner → broadcast → next
src/lib/signout-flow.ts    flush broadcast → reconcileUp → (dirty choices) → logout → wipe → broadcast
src/lib/reconcile.ts       reconcileUp: POST /api/sync batches ≤ 1 MiB / 25 hubs, gzip via CompressionStream
src/lib/next.ts            ?next= validation
src/lib/catalog.ts         catalog types, parsing, accent sanitising, filter/search/group
src/lib/local-progress.ts  read-only progress summary from the hubs' localStorage keys
src/styles/tokens.css      the hub design tokens, copied verbatim (light, dark, data-theme)
src/styles/app.css         shell styles
test/                      vitest suites, fixtures shaped like catalog.json, api-mock.ts (fake /api)
```

## Rules this code follows

- It never writes the `studyhub.*` or `ai901hub.*` keys. Those belong to the hubs.
  `local-progress.ts` only calls `getItem`, and every read is wrapped in try/catch. The only
  removals are sign-out and account-switch wipes, through the bridge's shared `wipeKeys`
  (`@bridge-shared`, which keeps `studyhub.codeLang` and `studyhubs.ui.*`).
- `entry.accent` is used only after it passes the `#rgb`/`#rrggbb` check.
- Filter and search state live in the URL (`/?filter=l2&q=graphs`), written with `replace`.
