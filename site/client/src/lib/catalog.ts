// Catalog data: types, parsing, filtering, search and grouping (build-contracts.md §3, §7).
// Everything here is pure so it can be unit-tested without a DOM.

export type HubKind = 'level' | 'cert';
export type HubEngine = 'v2' | 'legacy' | 'static';

/** One entry of the public `catalog.json`, normalised for the UI. */
export interface HubEntry {
  id: string;
  slug: string;
  title: string;
  code: string;
  /** "level" | "cert"; unknown kinds are kept as-is and only show under the "All" filter. */
  kind: string;
  level: number | null;
  levelLabel: string | null;
  domain: string;
  domainLabel: string;
  subject: string;
  subjectLabel: string;
  cert: string;
  blurb: string;
  modules: number;
  /** A safe `#rgb` / `#rrggbb` colour, or null (the UI then falls back to the theme accent). */
  accent: string | null;
  /** "v2" | "legacy" | "static"; unknown engines are treated like "static" for local progress. */
  engine: string;
  storageKeys: string[];
  legacyKeys: string[];
  downloadName: string;
  bytes: number | null;
  brBytes: number | null;
}

export interface SubjectGroup {
  label: string;
  hubs: HubEntry[];
}

export interface DomainGroup {
  label: string;
  subjects: SubjectGroup[];
}

export const FILTERS = ['all', 'l1', 'l2', 'l3', 'l4', 'cert'] as const;
export type Filter = (typeof FILTERS)[number];

export const LEVEL_LABELS: Readonly<Record<number, string>> = {
  1: 'Foundation',
  2: 'Proficient',
  3: 'Specialist',
  4: 'Expert',
};

export class CatalogError extends Error {
  override name = 'CatalogError';
}

// ---------------------------------------------------------------------------
// Parsing

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const count = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item !== '') : [];

/** URL-safe slug (RFC 3986 unreserved characters only), so it can go into `/h/<slug>` as-is. */
const SLUG_RE = /^[A-Za-z0-9._~-]+$/;
const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Returns a lowercase `#rgb`/`#rrggbb` colour, or null for anything else (names, rgb(), CSS injection...). */
export function sanitizeAccent(value: unknown): string | null {
  const color = text(value);
  return HEX_COLOR_RE.test(color) ? color.toLowerCase() : null;
}

/** Normalises one raw catalog entry; returns null when it can't be shown safely. */
export function parseHubEntry(raw: unknown): HubEntry | null {
  if (!isObject(raw)) return null;
  const slug = text(raw.slug);
  const title = text(raw.title);
  if (!SLUG_RE.test(slug) || !title) return null;

  const level = count(raw.level);
  const validLevel = level !== null && level >= 1 && level <= 4 ? level : null;
  const domain = text(raw.domain);
  const subject = text(raw.subject);

  return {
    id: text(raw.id) || slug,
    slug,
    title,
    code: text(raw.code),
    kind: text(raw.kind),
    level: validLevel,
    levelLabel: text(raw.levelLabel) || (validLevel ? (LEVEL_LABELS[validLevel] ?? null) : null),
    domain,
    domainLabel: text(raw.domainLabel) || domain || 'Other',
    subject,
    subjectLabel: text(raw.subjectLabel) || subject || 'General',
    cert: text(raw.cert),
    blurb: text(raw.blurb),
    modules: count(raw.modules) ?? 0,
    accent: sanitizeAccent(raw.accent),
    engine: text(raw.engine) || 'static',
    storageKeys: strings(raw.storageKeys),
    legacyKeys: strings(raw.legacyKeys),
    downloadName: text(raw.downloadName),
    bytes: count(raw.bytes),
    brBytes: count(raw.brBytes),
  };
}

/**
 * Parses the `catalog.json` body (`{version, generatedAt, hubs: [...]}`).
 * Malformed entries are skipped; a malformed document throws `CatalogError`.
 */
export function parseCatalog(data: unknown): HubEntry[] {
  if (!isObject(data) || !Array.isArray(data.hubs)) {
    throw new CatalogError('The catalog has an unexpected format.');
  }
  const seen = new Set<string>();
  const hubs: HubEntry[] = [];
  for (const raw of data.hubs) {
    const hub = parseHubEntry(raw);
    if (!hub || seen.has(hub.slug)) continue;
    seen.add(hub.slug);
    hubs.push(hub);
  }
  return hubs;
}

/** Fetches and parses `/catalog.json`. Throws `CatalogError` (or an AbortError) on failure. */
export async function fetchCatalog(signal?: AbortSignal): Promise<HubEntry[]> {
  let response: Response;
  try {
    response = await fetch('/catalog.json', {
      signal,
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new CatalogError('Could not reach the server.');
  }
  if (!response.ok) {
    throw new CatalogError(`The server answered ${response.status}.`);
  }
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new CatalogError('The catalog is not valid JSON.');
  }
  return parseCatalog(data);
}

// ---------------------------------------------------------------------------
// Filtering and search

export function isFilter(value: unknown): value is Filter {
  return typeof value === 'string' && (FILTERS as readonly string[]).includes(value);
}

export function matchesFilter(hub: HubEntry, filter: Filter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'cert':
      return hub.kind === 'cert';
    default:
      return hub.kind === 'level' && hub.level === Number(filter.slice(1));
  }
}

const fold = (value: string): string =>
  value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip accents: "résumé" matches "resume"
    .toLowerCase();

const compact = (value: string): string => value.replace(/[^\p{L}\p{N}]+/gu, '');

/** Splits a query into lowercase, accent-free terms. */
export function searchTerms(query: string): string[] {
  return fold(query).split(/\s+/).filter(Boolean);
}

/**
 * True when every term appears in the hub's title, code, cert line or blurb.
 * Punctuation is ignored as a fallback, so "ai103" finds "AI-103" and "dsal1" finds "DSA · L1".
 */
export function matchesQuery(hub: HubEntry, terms: readonly string[]): boolean {
  if (terms.length === 0) return true;
  const haystack = fold([hub.title, hub.code, hub.cert, hub.blurb].join('\n'));
  const squashed = compact(haystack);
  return terms.every((term) => {
    if (haystack.includes(term)) return true;
    const bare = compact(term);
    return bare !== '' && squashed.includes(bare);
  });
}

export function filterHubs(hubs: readonly HubEntry[], filter: Filter, query: string): HubEntry[] {
  const terms = searchTerms(query);
  return hubs.filter((hub) => matchesFilter(hub, filter) && matchesQuery(hub, terms));
}

/** How many hubs each filter chip would show for the current search. */
export function countByFilter(hubs: readonly HubEntry[], query = ''): Record<Filter, number> {
  const terms = searchTerms(query);
  const matching = hubs.filter((hub) => matchesQuery(hub, terms));
  const counts = {} as Record<Filter, number>;
  for (const filter of FILTERS) {
    counts[filter] = matching.filter((hub) => matchesFilter(hub, filter)).length;
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Grouping and display helpers

const byLabel = (a: string, b: string): number => a.localeCompare(b, 'en', { sensitivity: 'base', numeric: true });

/** Level hubs first in level order (L1 to L4), then everything else by code and title. */
function compareHubs(a: HubEntry, b: HubEntry): number {
  const rank = (hub: HubEntry) => (hub.kind === 'level' && hub.level !== null ? hub.level : 99);
  return rank(a) - rank(b) || byLabel(a.code, b.code) || byLabel(a.title, b.title);
}

/** Groups hubs by domainLabel, then subjectLabel, all sorted alphabetically. */
export function groupHubs(hubs: readonly HubEntry[]): DomainGroup[] {
  const domains = new Map<string, Map<string, HubEntry[]>>();
  for (const hub of hubs) {
    let subjects = domains.get(hub.domainLabel);
    if (!subjects) domains.set(hub.domainLabel, (subjects = new Map()));
    let list = subjects.get(hub.subjectLabel);
    if (!list) subjects.set(hub.subjectLabel, (list = []));
    list.push(hub);
  }
  return [...domains.entries()]
    .sort(([a], [b]) => byLabel(a, b))
    .map(([label, subjects]) => ({
      label,
      subjects: [...subjects.entries()]
        .sort(([a], [b]) => byLabel(a, b))
        .map(([subjectLabel, list]) => ({ label: subjectLabel, hubs: [...list].sort(compareHubs) })),
    }));
}

/** "L2 · Proficient" for level hubs, otherwise null. */
export function levelBadge(hub: HubEntry): string | null {
  if (hub.kind !== 'level' || hub.level === null) return null;
  return hub.levelLabel ? `L${hub.level} · ${hub.levelLabel}` : `L${hub.level}`;
}

/** Human-readable size: "870 B", "141 KB", "1.4 MB" (binary units). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = Math.round(bytes / 1024);
  if (kb < 1024) return `${kb} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

export function hubHref(hub: Pick<HubEntry, 'slug'>): string {
  return `/h/${encodeURIComponent(hub.slug)}`;
}

export function downloadHref(hub: Pick<HubEntry, 'slug'>): string {
  return `${hubHref(hub)}/download`;
}

export function pluralize(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
