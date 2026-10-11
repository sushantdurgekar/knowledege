import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CatalogError,
  countByFilter,
  downloadHref,
  fetchCatalog,
  filterHubs,
  formatBytes,
  groupHubs,
  hubHref,
  isFilter,
  levelBadge,
  matchesQuery,
  parseCatalog,
  parseHubEntry,
  sanitizeAccent,
  searchTerms,
} from '../src/lib/catalog';
import { catalogFetch, hubEntry, rawCatalog } from './fixtures';

const hubs = () => parseCatalog(rawCatalog());
const slugs = (list: { slug: string }[]) => list.map((hub) => hub.slug);

describe('parseCatalog', () => {
  it('parses every entry of a well-formed catalog', () => {
    const list = hubs();
    expect(list).toHaveLength(7);
    const ai901 = list.find((hub) => hub.slug === 'ai-901');
    expect(ai901).toMatchObject({ id: 'ai901', engine: 'legacy', legacyKeys: ['ai901hub.v1'], modules: 17 });
  });

  it('rejects documents without a hubs array', () => {
    for (const bad of [null, 'x', [], {}, { hubs: {} }, { hubs: 'no' }]) {
      expect(() => parseCatalog(bad)).toThrow(CatalogError);
    }
  });

  it('skips malformed entries and duplicate slugs but keeps the rest', () => {
    const raw = rawCatalog();
    const first = raw.hubs[0];
    const list = parseCatalog({
      hubs: [
        null,
        'nope',
        { ...first, slug: '' },
        { ...first, slug: '../admin' },
        { ...first, slug: 'x y' },
        { ...first, title: '   ' },
        first,
        { ...first, title: 'Duplicate' },
      ],
    });
    expect(slugs(list)).toEqual(['ab-620']);
    expect(list[0]?.title).toBe('AB-620 Study Hub');
  });

  it('normalises odd field values instead of failing', () => {
    const entry = parseHubEntry({
      slug: 'x-hub',
      title: 'X Hub',
      level: 9,
      modules: -3,
      brBytes: 'big',
      storageKeys: ['studyhub.x.v2', 42, ''],
      kind: 'level',
    });
    expect(entry).toMatchObject({
      id: 'x-hub',
      level: null,
      levelLabel: null,
      modules: 0,
      brBytes: null,
      storageKeys: ['studyhub.x.v2'],
      domainLabel: 'Other',
      subjectLabel: 'General',
      engine: 'static',
      accent: null,
    });
  });

  it('fills a missing level label from the level number', () => {
    expect(hubEntry({ levelLabel: null, level: 2 }).levelLabel).toBe('Proficient');
  });
});

describe('sanitizeAccent', () => {
  it('accepts #rgb and #rrggbb, lowercased', () => {
    expect(sanitizeAccent('#2343C4')).toBe('#2343c4');
    expect(sanitizeAccent(' #abc ')).toBe('#abc');
  });

  it('rejects anything that is not a plain hex colour', () => {
    for (const bad of [
      'red',
      '2343c4',
      '#12345',
      '#1234567',
      '#ggg',
      'rgb(1,2,3)',
      '#fff;background:url(https://evil.example)',
      'var(--x)',
      '',
      null,
      42,
    ]) {
      expect(sanitizeAccent(bad)).toBeNull();
    }
  });

  it('is applied when parsing entries', () => {
    expect(hubEntry({ accent: 'expression(alert(1))' }).accent).toBeNull();
    expect(hubEntry({ accent: '#0A7356' }).accent).toBe('#0a7356');
  });
});

describe('filters and search', () => {
  it('filters by level and by certification', () => {
    expect(slugs(filterHubs(hubs(), 'l1', ''))).toEqual(['dsa-l1-foundation']);
    expect(slugs(filterHubs(hubs(), 'l3', ''))).toEqual(['dsa-l3-specialist']);
    expect(filterHubs(hubs(), 'l4', '')).toEqual([]);
    expect(slugs(filterHubs(hubs(), 'cert', ''))).toEqual(['ab-620', 'ai-103', 'ai-500', 'ai-901']);
    expect(filterHubs(hubs(), 'all', '')).toHaveLength(7);
  });

  it('searches title, code, cert and blurb, case- and accent-insensitively', () => {
    expect(slugs(filterHubs(hubs(), 'all', 'copilot'))).toEqual(['ab-620']); // blurb
    expect(slugs(filterHubs(hubs(), 'all', 'FUNDAMENTALS'))).toEqual(['ai-901']); // cert + blurb
    expect(slugs(filterHubs(hubs(), 'all', 'ai-500'))).toEqual(['ai-500']); // code
    expect(slugs(filterHubs(hubs(), 'all', 'Specialist Hub'))).toEqual(['dsa-l3-specialist']); // title
    expect(slugs(filterHubs(hubs(), 'all', 'cópilot'))).toEqual(['ab-620']);
  });

  it('requires every term to match and ignores punctuation as a fallback', () => {
    expect(slugs(filterHubs(hubs(), 'all', 'ai103'))).toEqual(['ai-103']);
    expect(slugs(filterHubs(hubs(), 'all', 'dsa l2'))).toEqual(['dsa-l2-proficient']);
    expect(filterHubs(hubs(), 'all', 'dsa copilot')).toEqual([]);
    expect(filterHubs(hubs(), 'all', 'zzz')).toEqual([]);
  });

  it('combines the filter chip with the search', () => {
    expect(slugs(filterHubs(hubs(), 'cert', 'azure'))).toEqual(['ai-103', 'ai-901']);
    expect(filterHubs(hubs(), 'l1', 'azure')).toEqual([]);
  });

  it('treats an empty or blank query as "match everything"', () => {
    expect(searchTerms('   ')).toEqual([]);
    expect(matchesQuery(hubEntry(), [])).toBe(true);
    expect(filterHubs(hubs(), 'all', '  ')).toHaveLength(7);
  });

  it('counts hubs per chip for the current search', () => {
    expect(countByFilter(hubs())).toEqual({ all: 7, l1: 1, l2: 1, l3: 1, l4: 0, cert: 4 });
    expect(countByFilter(hubs(), 'azure')).toEqual({ all: 2, l1: 0, l2: 0, l3: 0, l4: 0, cert: 2 });
  });

  it('validates filter names', () => {
    expect(isFilter('l2')).toBe(true);
    expect(isFilter('cert')).toBe(true);
    expect(isFilter('l5')).toBe(false);
    expect(isFilter(null)).toBe(false);
  });
});

describe('groupHubs', () => {
  it('groups by domain label, then subject label, sorted, with levels in order', () => {
    const shuffled = [...hubs()].reverse();
    const groups = groupHubs(shuffled);
    expect(groups.map((group) => group.label)).toEqual(['Certifications', 'Software Engineering']);
    expect(groups[0]?.subjects.map((subject) => subject.label)).toEqual(['AB-620', 'AI-103', 'AI-500', 'AI-901']);
    const dsa = groups[1]?.subjects;
    expect(dsa).toHaveLength(1);
    expect(dsa?.[0]?.label).toBe('Data Structures & Algorithms');
    expect(slugs(dsa?.[0]?.hubs ?? [])).toEqual(['dsa-l1-foundation', 'dsa-l2-proficient', 'dsa-l3-specialist']);
  });

  it('returns no groups for no hubs', () => {
    expect(groupHubs([])).toEqual([]);
  });
});

describe('display helpers', () => {
  it('formats sizes', () => {
    expect(formatBytes(870)).toBe('870 B');
    expect(formatBytes(144722)).toBe('141 KB');
    expect(formatBytes(1_048_000)).toBe('1023 KB');
    expect(formatBytes(1_500_000)).toBe('1.4 MB');
  });

  it('builds hub and download links', () => {
    expect(hubHref({ slug: 'ai-103' })).toBe('/h/ai-103');
    expect(downloadHref({ slug: 'ai-103' })).toBe('/h/ai-103/download');
  });

  it('labels level hubs only', () => {
    expect(levelBadge(hubEntry())).toBe('L1 · Foundation');
    const cert = hubs().find((hub) => hub.kind === 'cert');
    expect(cert && levelBadge(cert)).toBeNull();
  });
});

describe('fetchCatalog', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches /catalog.json and parses it', async () => {
    const spy = vi.fn(catalogFetch());
    vi.stubGlobal('fetch', spy);
    await expect(fetchCatalog()).resolves.toHaveLength(7);
    expect(spy).toHaveBeenCalledWith('/catalog.json', expect.objectContaining({ credentials: 'same-origin' }));
  });

  it.each([
    ['http-500', /500/],
    ['network', /reach the server/],
    ['bad-json', /not valid JSON/],
  ] as const)('turns a %s failure into a CatalogError', async (mode, message) => {
    vi.stubGlobal('fetch', catalogFetch(undefined, mode));
    const error = await fetchCatalog().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CatalogError);
    expect((error as Error).message).toMatch(message);
  });

  it('rejects a malformed document', async () => {
    vi.stubGlobal('fetch', catalogFetch({ hubs: null }));
    await expect(fetchCatalog()).rejects.toBeInstanceOf(CatalogError);
  });
});
