/**
 * The public catalog (build-contracts.md section 3), loaded once per run.
 *
 * Tests are generated per hub, so the catalog must be known while Playwright collects the
 * test files, which happens synchronously. It is fetched from the server under test with a
 * short-lived child process and cached in an environment variable: the runner collects tests
 * first and passes its environment to the workers, so every process sees the same list.
 */
import { execFileSync } from 'node:child_process';
import { BASE_URL } from './env';

export type Engine = 'v2' | 'legacy' | 'static';

export interface HubEntry {
  id: string;
  slug: string;
  title: string;
  code: string | null;
  kind: 'level' | 'cert';
  level: number | null;
  levelLabel: string | null;
  domain: string;
  domainLabel: string;
  subject: string;
  subjectLabel: string;
  cert: string | null;
  blurb: string | null;
  modules: number;
  accent: string | null;
  engine: Engine;
  storageKeys: string[];
  legacyKeys: string[];
  downloadName: string;
  bytes: number;
  brBytes: number;
  sha256: string;
}

export interface Catalog {
  version: number;
  generatedAt: string;
  hubs: HubEntry[];
}

const CACHE_VAR = 'E2E_CATALOG_JSON';

// Runs in a child process: print the body of process.argv[1] or exit non-zero with a reason.
const FETCH_SCRIPT = `
fetch(process.argv[1], { signal: AbortSignal.timeout(15000) })
  .then(async (r) => {
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + r.statusText);
    process.stdout.write(await r.text());
  })
  .catch((e) => { process.stderr.write(String(e && e.cause ? e.cause : e)); process.exit(1); });
`;

function fetchCatalogText(url: string): string {
  try {
    return execFileSync(process.execPath, ['-e', FETCH_SCRIPT, url], {
      encoding: 'utf8',
      timeout: 20_000,
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch (e) {
    const detail = (e as { stderr?: string }).stderr?.trim() || (e as Error).message;
    throw new Error(
      `Cannot load ${url} (${detail}).\n` +
        'The e2e suite needs a running server: run `sh site/scripts/dev-e2e.sh` (builds nothing, ' +
        'starts uvicorn for you) or start one with `make -C site serve` and set BASE_URL if it is not ' +
        'http://127.0.0.1:10000.',
    );
  }
}

let cached: Catalog | null = null;

/** The catalog of the server under test (synchronous; fetched at most once per run). */
export function loadCatalog(): Catalog {
  if (cached) return cached;
  let text = process.env[CACHE_VAR];
  if (!text) {
    text = fetchCatalogText(`${BASE_URL}/catalog.json`);
    process.env[CACHE_VAR] = text;
  }
  const parsed = JSON.parse(text) as Catalog;
  if (!parsed || !Array.isArray(parsed.hubs)) throw new Error('catalog.json has no "hubs" array');
  cached = parsed;
  return parsed;
}

/** Hubs that run the bridge (everything except `static`, which is served without it). */
export const withBridge = (hub: HubEntry): boolean => hub.engine !== 'static';

export const hubPath = (hub: Pick<HubEntry, 'slug'>): string => `/h/${hub.slug}`;
export const downloadPath = (hub: Pick<HubEntry, 'slug'>): string => `/h/${hub.slug}/download`;

/** The localStorage record a v2 hub keeps its progress in (`studyhub.<id>.v2`). */
export const progressKey = (hub: Pick<HubEntry, 'id'>): string => `studyhub.${hub.id}.v2`;

/**
 * The exact span the collector inserts (build-contracts.md section 4). Attribute values are
 * HTML-escaped the same way the collector does it (ids, slugs and keys are plain today).
 */
export function injectionSpan(hub: HubEntry): string {
  const esc = (v: string) =>
    v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  if (hub.engine === 'legacy') {
    return (
      `<script src="/_sh/bridge.js" data-hub-id="${esc(hub.id)}" data-slug="${esc(hub.slug)}" data-engine="legacy" ` +
      `data-legacy-keys="${esc(hub.legacyKeys.join(','))}"></script><script src="/api/seed/${esc(hub.id)}.js"></script>`
    );
  }
  return `<script src="/_sh/bridge.js" data-hub-id="${esc(hub.id)}" data-slug="${esc(hub.slug)}" data-engine="${esc(hub.engine)}"></script>`;
}
