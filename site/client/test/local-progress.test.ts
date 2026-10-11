import { afterEach, describe, expect, it, vi } from 'vitest';
import { browserStorage, readLocalProgress } from '../src/lib/local-progress';
import { hubEntry } from './fixtures';

const v2Hub = () => hubEntry(); // DSA L1: 8 modules, storageKeys[0] = studyhub.dsa-l1.v2
const legacyHub = () =>
  hubEntry({ id: 'ai901', slug: 'ai-901', engine: 'legacy', storageKeys: [], legacyKeys: ['ai901hub.v1'], modules: 17 });

const v2Record = (done: unknown) =>
  JSON.stringify({ S: { v: 2, done, plan: {}, quiz: {} }, MOCKS: [], CARDS: {}, U: { main: 1, mocks: 0, cards: 0 } });

/** A minimal Storage stand-in that records writes. */
function memoryStorage(data: Record<string, string>) {
  return {
    getItem: vi.fn((key: string) => (key in data ? (data[key] ?? null) : null)),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('readLocalProgress: v2 hubs', () => {
  it('counts truthy entries of S.done', () => {
    localStorage.setItem('studyhub.dsa-l1.v2', v2Record({ m1: true, m2: true, m3: 1, m4: false, m5: null }));
    expect(readLocalProgress(v2Hub())).toEqual({ done: 3, total: 8 });
  });

  it('reads only storageKeys[0] (not the mockrun key)', () => {
    localStorage.setItem('studyhub.dsa-l1.mockrun', JSON.stringify({ S: { done: { a: true } } }));
    expect(readLocalProgress(v2Hub())).toBeNull();
  });

  it('reports 0 done for a valid record with no done map', () => {
    localStorage.setItem('studyhub.dsa-l1.v2', JSON.stringify({ S: { v: 2 } }));
    expect(readLocalProgress(v2Hub())).toEqual({ done: 0, total: 8 });
    localStorage.setItem('studyhub.dsa-l1.v2', v2Record(['m1', 'm2']));
    expect(readLocalProgress(v2Hub())).toEqual({ done: 0, total: 8 });
  });

  it('clamps to the module count', () => {
    const done = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`m${i}`, true]));
    localStorage.setItem('studyhub.dsa-l1.v2', v2Record(done));
    expect(readLocalProgress(v2Hub())).toEqual({ done: 8, total: 8 });
  });

  it.each([
    ['missing key', undefined],
    ['malformed JSON', '{"S":{"done":'],
    ['JSON null', 'null'],
    ['JSON array', '[1,2]'],
    ['JSON string', '"hello"'],
    ['no S object', JSON.stringify({ done: { m1: true } })],
    ['S is not an object', JSON.stringify({ S: 'x' })],
  ])('returns null for %s', (_label, raw) => {
    if (raw !== undefined) localStorage.setItem('studyhub.dsa-l1.v2', raw);
    expect(readLocalProgress(v2Hub())).toBeNull();
  });

  it('returns null when the hub lists no storage key', () => {
    expect(readLocalProgress(hubEntry({ storageKeys: [] }))).toBeNull();
  });
});

describe('readLocalProgress: legacy hub (AI-901)', () => {
  it('counts truthy entries of done in ai901hub.v1', () => {
    localStorage.setItem(
      'ai901hub.v1',
      JSON.stringify({ done: { m1: true, m2: true, m3: false }, plan: { p1: true }, mistakes: [], mockHist: [] }),
    );
    expect(readLocalProgress(legacyHub())).toEqual({ done: 2, total: 17 });
  });

  it('falls back to ai901hub.v1 when the AI-901 entry lists no legacy key', () => {
    localStorage.setItem('ai901hub.v1', JSON.stringify({ done: { m1: true } }));
    expect(readLocalProgress(hubEntry({ id: 'ai901', engine: 'legacy', legacyKeys: [] }))?.done).toBe(1);
    expect(readLocalProgress(hubEntry({ id: 'other', engine: 'legacy', legacyKeys: [] }))).toBeNull();
  });

  it('returns null for a missing key or bad JSON, and 0 for a record without done', () => {
    expect(readLocalProgress(legacyHub())).toBeNull();
    localStorage.setItem('ai901hub.v1', 'not json');
    expect(readLocalProgress(legacyHub())).toBeNull();
    localStorage.setItem('ai901hub.v1', JSON.stringify({ plan: {} }));
    expect(readLocalProgress(legacyHub())).toEqual({ done: 0, total: 17 });
  });
});

describe('readLocalProgress: safety', () => {
  it('ignores static and unknown engines', () => {
    localStorage.setItem('studyhub.dsa-l1.v2', v2Record({ m1: true }));
    expect(readLocalProgress(hubEntry({ engine: 'static' }))).toBeNull();
    expect(readLocalProgress(hubEntry({ engine: 'v3' }))).toBeNull();
  });

  it('survives storage that throws on read', () => {
    const storage = { getItem: vi.fn(() => { throw new DOMException('blocked', 'SecurityError'); }) };
    expect(readLocalProgress(v2Hub(), storage)).toBeNull();
  });

  it('survives a localStorage getter that throws (blocked site data)', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    });
    expect(browserStorage()).toBeNull();
    expect(readLocalProgress(v2Hub())).toBeNull();
  });

  it('never writes to storage', () => {
    const storage = memoryStorage({ 'studyhub.dsa-l1.v2': v2Record({ m1: true }), 'ai901hub.v1': '{"done":{}}' });
    readLocalProgress(v2Hub(), storage);
    readLocalProgress(legacyHub(), storage);
    expect(storage.getItem).toHaveBeenCalledTimes(2);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it('leaves real localStorage untouched', () => {
    localStorage.setItem('studyhub.dsa-l1.v2', v2Record({ m1: true }));
    const before = { ...localStorage };
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem');
    readLocalProgress(v2Hub());
    readLocalProgress(legacyHub());
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    expect({ ...localStorage }).toEqual(before);
  });
});
