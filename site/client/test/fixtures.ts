// Catalog fixtures shaped like site/build/catalog.json (build-contracts.md §3).
import { parseHubEntry, type HubEntry } from '../src/lib/catalog';

const levelHub = (level: 1 | 2 | 3, label: string, slugLabel: string, modules: number) => ({
  id: `dsa-l${level}`,
  slug: `dsa-l${level}-${slugLabel}`,
  title: `DSA L${level} ${label} Hub`,
  code: `DSA · L${level}`,
  kind: 'level',
  level,
  levelLabel: label,
  domain: 'software-engineering',
  domainLabel: 'Software Engineering',
  subject: 'dsa',
  subjectLabel: 'Data Structures & Algorithms',
  cert: `Data Structures & Algorithms · L${level} ${label}`,
  blurb: `Level ${level} of data structures and algorithms`,
  modules,
  accent: '#2343c4',
  engine: 'v2',
  storageKeys: [`studyhub.dsa-l${level}.v2`, `studyhub.dsa-l${level}.mockrun`],
  legacyKeys: [],
  downloadName: `dsa-l${level}-${slugLabel}-hub.html`,
  bytes: 393273,
  brBytes: 100317,
  sha256: 'a'.repeat(64),
});

const certHub = (code: string, cert: string, blurb: string, modules: number, accent: string) => {
  const id = code.toLowerCase().replace('-', '');
  return {
    id,
    slug: code.toLowerCase(),
    title: `${code} Study Hub`,
    code,
    kind: 'cert',
    level: null,
    levelLabel: null,
    domain: 'certifications',
    domainLabel: 'Certifications',
    subject: code.toLowerCase(),
    subjectLabel: code,
    cert,
    blurb,
    modules,
    accent,
    engine: 'v2',
    storageKeys: [`studyhub.${id}.v2`, `studyhub.${id}.mockrun`],
    legacyKeys: [] as string[],
    downloadName: `${code} Study Hub.html`,
    bytes: 802992,
    brBytes: 201778,
    sha256: 'b'.repeat(64),
  };
};

/** Raw `catalog.json` body with the 7 hubs that exist today. */
export function rawCatalog() {
  return {
    version: 1,
    generatedAt: '2026-10-11T13:08:37.204Z',
    hubs: [
      certHub('AB-620', 'Microsoft Certified: AI Agent Builder Associate', 'Build enterprise agents in Copilot Studio', 20, '#0a7356'),
      certHub(
        'AI-103',
        'Microsoft Certified: Azure AI Apps and Agents Developer Associate',
        'Become an Azure AI apps and agents developer',
        37,
        '#2343c4',
      ),
      certHub(
        'AI-500',
        'Microsoft Certified: Multi-Agent AI Solutions Expert',
        'Architect, build and run production multi-agent systems',
        28,
        '#7328b3',
      ),
      {
        ...certHub('AI-901', 'Microsoft Certified: Azure AI Fundamentals', 'Pass Azure AI Fundamentals with a 3-day plan', 17, '#2c56d6'),
        engine: 'legacy',
        storageKeys: [],
        legacyKeys: ['ai901hub.v1'],
      },
      levelHub(1, 'Foundation', 'foundation', 8),
      levelHub(2, 'Proficient', 'proficient', 12),
      levelHub(3, 'Specialist', 'specialist', 12),
    ],
  };
}

/** One parsed entry, with optional overrides of the raw fields. */
export function hubEntry(overrides: Record<string, unknown> = {}): HubEntry {
  const base = rawCatalog().hubs.find((hub) => hub.slug === 'dsa-l1-foundation');
  const entry = parseHubEntry({ ...base, ...overrides });
  if (!entry) throw new Error('fixture did not parse');
  return entry;
}

/** A `fetch` stub that answers `/catalog.json` with `body` (or fails the way `mode` says). */
export function catalogFetch(body: unknown = rawCatalog(), mode: 'ok' | 'http-500' | 'network' | 'bad-json' = 'ok') {
  return async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.endsWith('/catalog.json')) return new Response('not found', { status: 404 });
    switch (mode) {
      case 'network':
        throw new TypeError('Failed to fetch');
      case 'http-500':
        return new Response('oops', { status: 500 });
      case 'bad-json':
        return new Response('{not json', { status: 200, headers: { 'Content-Type': 'application/json' } });
      default:
        return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
  };
}
