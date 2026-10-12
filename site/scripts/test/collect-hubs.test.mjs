// End-to-end and unit tests for collect-hubs.mjs (node:test, standard library only).
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {
  LINT_RULES, cspHash, deriveSlug, extractHubMetadata, findInjectionPoint, injectionSpan, extractInlineScripts,
  lintText, readAccent, scanHtml, storageKeysFor,
} from '../collect-hubs.mjs';
import { LINT_RULE_IDS, globToRegExp, matchesAny, rejectedSegment } from '../lib/hub-paths.mjs';
import {
  tmpDir, writeTree, writeConfig, runCollector, hubPage, jsonHub, modules, v2Engine, sha256Hex, sha256B64,
} from './helpers.mjs';

const PUBLIC_FIELDS = [
  'id', 'slug', 'title', 'code', 'kind', 'level', 'levelLabel', 'domain', 'domainLabel', 'subject', 'subjectLabel',
  'cert', 'blurb', 'modules', 'accent', 'engine', 'storageKeys', 'legacyKeys', 'downloadName', 'bytes', 'brBytes', 'sha256',
];
const CSP_TAIL =
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; " +
  "connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'";

// Source paths of the synthetic hubs.
const P = {
  dsa: 'technical/software-engineering/dsa/hubs/dsa-l1-foundation-hub.html',
  cert: 'technical/certifications/zz-100/ZZ-100 Study Hub.html',
  legacy: 'technical/certifications/ai-901/AI-901 Study Hub.html',
  static: 'technical/web-dev/react/hubs/react-l2-proficient-hub.html',
  noHead: 'technical/programming/python/hubs/python-l1-foundation-hub.html',
  bare: 'technical/web-dev/seo/hubs/seo-l1-foundation-hub.html',
  base: 'technical/devops/docker/hubs/docker-l1-foundation-hub.html',
  lint: 'technical/data-ai/rag/hubs/rag-l1-foundation-hub.html',
  rejected: 'technical/data-ai/courses/hubs/sneaky-l1-foundation-hub.html',
  notAHub: 'technical/software-engineering/dsa/notes/scratch-hub.html',
};
const AWS_KEY = 'AKIA' + 'ABCDEFGHIJKLMNOP'; // split so this test file never trips a scanner

const BASE_STRING_JS = 'var tpl = "<head><base href=\'/x/\' /></head>"; var t2 = \'<base />\';';

// Shaped like the real DSA hubs: the base theme sets --accent first, then a later
// "subject accent" block restates it for light and dark (dsa-l*-hub.html, end of <style>).
const SUBJECT_ACCENT_CSS =
  '/* subject accent */\n:root{--accent:#1d6b58;--accent-soft:#d9eee7;}\n' +
  '@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--accent:#6cd1b2;}}\n' +
  ':root[data-theme="dark"]{--accent:#6cd1b2;}\n';

function buildFixtures(root) {
  const files = {};
  // 1. Engine v2, window.HUB as JSON, one allowed lint hit.
  files[P.dsa] = hubPage({
    title: 'DSA L1 Foundation Hub',
    bodyExtra: `<style>${SUBJECT_ACCENT_CSS}</style>\n`,
    dataScripts: [jsonHub({
      id: 'dsa-l1', code: 'DSA · L1', title: 'DSA L1 Foundation Hub', cert: 'Data Structures & Algorithms · L1 Foundation',
      hero: { title: 'Think in **Big-O**, then solve', sub: 'x' }, contact: 'demo@studyhubs-demo.dev', modules: modules(8),
    })],
  });
  // 2. Engine v2, object literal plus a second data script using the bare HUB global, CRLF line endings.
  files[P.cert] = hubPage({
    title: 'ZZ-100 Study Hub',
    accent: '#0a7356',
    dataScripts: [
      '\r\nwindow.HUB = {\r\n  id: "zz100", code: "ZZ-100", title: "ZZ-100 Study Hub",\r\n  cert: "Made-up Certified: Testing Associate",\r\n' +
        '  hero: { title: "Pass the pretend exam" },\r\n  modules: [' + modules(5).map((m) => JSON.stringify(m)).join(',') + ']\r\n};\r\n',
      '\n/* story upgrade */\nHUB.kid = { m1: "Once upon a time" };\n',
    ],
  });
  // 3. Legacy (AI-901 style): no window.HUB, modules via M.push.
  files[P.legacy] = hubPage({
    title: 'AI-901 Study Hub',
    accent: '#2c56d6',
    dataScripts: [
      'window.M=[];window.MOCK=[];window.CARDS=[];',
      '\nM.push({id:"m1",t:"One"});\nM.push({ id:"m2",t:"Two"});\n',
      '\nM.push({id:"m3",t:"Three"});\n',
    ],
    engine: '\n(function(){ const KEY = "ai901hub.v1"; let S = {}; try { S = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) {} })();\n',
  });
  // 4. Static: no engine probes at all.
  files[P.static] = hubPage({ title: 'React L2 Hub', engine: '\ndocument.title = "React";\n' });
  // 5. No </head>: inject before the first real <script (not the one in the comment).
  files[P.noHead] =
    '<!doctype html><html><meta charset="utf-8"><body>\n<title>Python L1</title>\n<!-- <script>old()</script> -->\n' +
    `<script>${jsonHub({ id: 'python-l1', code: 'PY · L1', title: 'Python L1 Foundation Hub', hero: { title: 'Start Python' }, modules: modules(3) })}</script>\n` +
    `<script>${v2Engine()}</script>\n</body></html>\n`;
  // 6. Neither </head> nor <script>: static, no injection.
  files[P.bare] = '<!doctype html><html><body><title>SEO</title><p>Plain page</p></body></html>\n';
  // 7. "<base />" and "</head>" inside JS strings, including a script in <head>.
  files[P.base] = hubPage({
    title: 'Docker L1 Foundation Hub',
    headExtra: `<script>${BASE_STRING_JS}</script>`,
    bodyExtra: '<script>var more = "<base />"; var html = "</head>";</script>\n',
    dataScripts: [jsonHub({ id: 'docker-l1', code: 'DOCKER · L1', title: 'Docker L1 Foundation Hub', hero: { title: 'Containers' }, modules: modules(4) })],
  });
  // 8. Publish-lint hit: a real-looking email and an AWS key id.
  files[P.lint] = hubPage({
    title: 'RAG L1 Foundation Hub',
    dataScripts: [jsonHub({
      id: 'rag-l1', code: 'RAG · L1', title: 'RAG L1 Foundation Hub', hero: { title: 'Retrieval' }, modules: modules(2),
      note: `mail jane.doe@realcorp.com, key ${AWS_KEY}`,
    })],
  });
  // 9. Matches a glob but sits in a rejected segment ("courses" as the subject).
  files[P.rejected] = hubPage({ title: 'Sneaky', dataScripts: [jsonHub({ id: 'sneaky', title: 'S', modules: [] })] });
  // 10. Does not match any glob.
  files[P.notAHub] = hubPage({ title: 'Not a hub' });
  writeTree(root, files);
  return files;
}

function configFor(root, { withLint = true } = {}) {
  const file = path.join(root, 'site', 'hubs.config.json');
  writeConfig(file, {
    legacy: { [P.legacy]: { id: 'ai901', keys: ['ai901hub.v1'] } },
    overrides: { [P.legacy]: { code: 'AI-901', cert: 'Made-up Fundamentals', blurb: 'Three-day sprint' } },
    lintAllow: [{ source: P.dsa, rule: 'email', match: 'demo@studyhubs-demo.dev', reason: 'test fixture address' }],
  });
  if (!withLint) fs.rmSync(path.join(root, ...P.lint.split('/')));
  return file;
}

const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

describe('collect-hubs end to end (synthetic repo)', () => {
  let root, cleanup, out, files, run, catalog, internal, report;

  before(() => {
    ({ dir: root, cleanup } = tmpDir());
    files = buildFixtures(root);
    const config = configFor(root);
    out = path.join(root, 'site', 'build');
    run = runCollector(['--src', root, '--config', config, '--out', out]);
    catalog = readJson(path.join(out, 'catalog.json'));
    internal = readJson(path.join(out, 'catalog.internal.json'));
    report = readJson(path.join(out, 'build-report.json'));
  });
  after(() => cleanup());

  const entry = (slug) => catalog.hubs.find((h) => h.slug === slug);
  const internalEntry = (slug) => internal.hubs.find((h) => h.slug === slug);

  it('exits 0 without --strict even though one hub failed', () => {
    assert.equal(run.code, 0, run.stderr);
    assert.match(run.stdout, /7 published, 1 skipped, 1 rejected/);
  });

  it('publishes exactly the valid hubs, never rejected or unmatched paths', () => {
    assert.deepEqual(catalog.hubs.map((h) => h.slug).sort(), [
      'ai-901', 'docker-l1-foundation', 'dsa-l1-foundation', 'python-l1-foundation', 'react-l2-proficient',
      'seo-l1-foundation', 'zz-100',
    ]);
    assert.deepEqual(fs.readdirSync(path.join(out, 'hubs')).sort(), catalog.hubs.map((h) => h.slug).sort());
    assert.deepEqual(report.rejected.map((r) => r.source), [P.rejected]);
    assert.ok(!report.hubs.some((h) => h.source === P.notAHub));
  });

  it('writes catalog.json with exactly the contract fields, in order', () => {
    assert.equal(catalog.version, 1);
    assert.ok(!Number.isNaN(Date.parse(catalog.generatedAt)));
    for (const h of catalog.hubs) assert.deepEqual(Object.keys(h), PUBLIC_FIELDS);
  });

  it('derives v2 metadata from a JSON window.HUB', () => {
    assert.deepEqual(entry('dsa-l1-foundation'), {
      ...entry('dsa-l1-foundation'),
      id: 'dsa-l1', title: 'DSA L1 Foundation Hub', code: 'DSA · L1', kind: 'level', level: 1, levelLabel: 'Foundation',
      domain: 'software-engineering', domainLabel: 'Software Engineering', subject: 'dsa',
      subjectLabel: 'Data Structures & Algorithms', cert: 'Data Structures & Algorithms · L1 Foundation',
      blurb: 'Think in Big-O, then solve', modules: 8, accent: '#1d6b58', engine: 'v2',
      storageKeys: ['studyhub.dsa-l1.v2', 'studyhub.dsa-l1.mockrun'], legacyKeys: [],
      downloadName: 'dsa-l1-foundation-hub.html',
    });
  });

  it('derives v2 metadata from an object literal plus a second data script', () => {
    const h = entry('zz-100');
    assert.equal(h.id, 'zz100');
    assert.equal(h.kind, 'cert');
    assert.equal(h.level, null);
    assert.equal(h.levelLabel, null);
    assert.equal(h.subjectLabel, 'ZZ-100'); // certifications fallback: upper-case subject
    assert.equal(h.domainLabel, 'Certifications');
    assert.equal(h.cert, 'Made-up Certified: Testing Associate');
    assert.equal(h.blurb, 'Pass the pretend exam');
    assert.equal(h.modules, 5);
    assert.equal(h.accent, '#0a7356');
    assert.equal(h.downloadName, 'ZZ-100 Study Hub.html');
  });

  it('handles the legacy hub from the config map', () => {
    const h = entry('ai-901');
    assert.equal(h.id, 'ai901');
    assert.equal(h.engine, 'legacy');
    assert.equal(h.title, 'AI-901 Study Hub');
    assert.equal(h.modules, 3);
    assert.deepEqual(h.legacyKeys, ['ai901hub.v1']);
    assert.deepEqual(h.storageKeys, []);
    assert.equal(h.code, 'AI-901');
    assert.equal(h.blurb, 'Three-day sprint');
    const served = fs.readFileSync(path.join(out, 'hubs/ai-901/index.html'), 'utf8');
    assert.ok(served.includes(
      '<script src="/_sh/bridge.js" data-hub-id="ai901" data-slug="ai-901" data-engine="legacy" data-legacy-keys="ai901hub.v1"></script>' +
      '<script src="/api/seed/ai901.js"></script></head>'));
  });

  it('serves unknown engines as static, still with the bridge', () => {
    const h = entry('react-l2-proficient');
    assert.equal(h.engine, 'static');
    assert.equal(h.id, 'react-l2-proficient');
    assert.equal(h.level, 2);
    assert.equal(h.levelLabel, 'Proficient');
    assert.equal(h.modules, null);
    assert.equal(h.subjectLabel, 'React'); // title-case fallback
    assert.equal(h.domainLabel, 'Web Dev');
    const served = fs.readFileSync(path.join(out, 'hubs/react-l2-proficient/index.html'), 'utf8');
    assert.ok(served.includes('data-engine="static"></script></head>'));
  });

  it('falls back to the first real <script when </head> is missing', () => {
    const h = entry('python-l1-foundation');
    assert.equal(h.engine, 'v2');
    const served = fs.readFileSync(path.join(out, 'hubs/python-l1-foundation/index.html'), 'utf8');
    const span = '<script src="/_sh/bridge.js" data-hub-id="python-l1" data-slug="python-l1-foundation" data-engine="v2"></script>';
    assert.ok(served.includes('<!-- <script>old()</script> -->\n' + span + '<script>\nwindow.HUB'));
    const r = report.hubs.find((x) => x.source === P.noHead);
    assert.equal(r.injected.anchor, 'script');
    assert.ok(r.warnings.some((w) => /no <\/head>/.test(w)));
  });

  it('leaves a page with neither </head> nor <script> untouched and static', () => {
    const h = entry('seo-l1-foundation');
    assert.equal(h.engine, 'static');
    const dir = path.join(out, 'hubs/seo-l1-foundation');
    assert.ok(fs.readFileSync(path.join(dir, 'index.html')).equals(fs.readFileSync(path.join(dir, 'original.html'))));
    assert.equal(report.hubs.find((x) => x.source === P.bare).injected, null);
    assert.equal(internalEntry('seo-l1-foundation').csp, `default-src 'none'; script-src 'self'; ${CSP_TAIL}`);
  });

  it('injects before the real </head>, not one inside a JS string, and adds no <base>', () => {
    const src = files[P.base];
    const realHead = src.indexOf(`${BASE_STRING_JS}</script></head>`) + `${BASE_STRING_JS}</script>`.length;
    const r = report.hubs.find((x) => x.source === P.base);
    assert.equal(r.injected.anchor, 'head');
    assert.equal(r.injected.offset, Buffer.byteLength(src.slice(0, realHead)));
    assert.ok(r.warnings.some((w) => /run before the bridge/.test(w)));
    const served = fs.readFileSync(path.join(out, 'hubs/docker-l1-foundation/index.html'), 'utf8');
    assert.equal(served.split('<base').length, src.split('<base').length);
    assert.equal(served.split('</head>').length, src.split('</head>').length);
  });

  it('keeps the invariant: served minus the exact contract span equals the original, for every hub', () => {
    for (const h of internal.hubs) {
      const original = fs.readFileSync(path.join(root, ...h.source.split('/')));
      const served = fs.readFileSync(path.join(out, 'hubs', h.slug, 'index.html'));
      const copy = fs.readFileSync(path.join(out, 'hubs', h.slug, 'original.html'));
      assert.ok(copy.equals(original), `${h.slug}: original.html differs from source`);
      assert.equal(h.sha256, sha256Hex(original));
      assert.equal(h.bytes, original.length);
      assert.equal(h.servedSha256, sha256Hex(served));
      assert.equal(h.source.endsWith(h.downloadName), true);
      if (served.equals(original)) continue; // the bare static page
      // Built here from the contract text, independent of the collector's own template.
      let span = `<script src="/_sh/bridge.js" data-hub-id="${h.id}" data-slug="${h.slug}" data-engine="${h.engine}"`;
      span += h.engine === 'legacy'
        ? ` data-legacy-keys="${h.legacyKeys.join(',')}"></script><script src="/api/seed/${h.id}.js"></script>`
        : '></script>';
      const spanBuf = Buffer.from(span);
      const at = served.indexOf(spanBuf);
      assert.ok(at >= 0, `${h.slug}: span not found`);
      assert.equal(served.indexOf(spanBuf, at + 1), -1, `${h.slug}: span appears twice`);
      const stripped = Buffer.concat([served.subarray(0, at), served.subarray(at + spanBuf.length)]);
      assert.ok(stripped.equals(original), `${h.slug}: served minus span != original`);
    }
  });

  it('computes the CSP from sha256 hashes of every inline script in the served file', () => {
    for (const h of internal.hubs) {
      const served = fs.readFileSync(path.join(out, 'hubs', h.slug, 'index.html'), 'utf8');
      // Independent re-computation: walk <script> tags by hand, hash LF-normalised text.
      const expected = [];
      let i = 0;
      for (;;) {
        const open = served.toLowerCase().indexOf('<script', i);
        if (open < 0) break;
        const gt = served.indexOf('>', open);
        const close = served.toLowerCase().indexOf('</script>', gt);
        const attrs = served.slice(open + 7, gt);
        if (!/\ssrc=/.test(attrs)) {
          const text = served.slice(gt + 1, close).replace(/\r\n?/g, '\n');
          const tag = `'sha256-${sha256B64(text)}'`;
          if (!expected.includes(tag)) expected.push(tag);
        }
        i = close + 9;
      }
      assert.equal(h.csp, `default-src 'none'; script-src 'self'${expected.map((x) => ' ' + x).join('')}; ${CSP_TAIL}`, h.slug);
    }
  });

  it('normalises CRLF before hashing (the browser hashes LF text)', () => {
    const csp = internalEntry('zz-100').csp;
    const crlfScript = extractInlineScripts(files[P.cert])[0].code;
    assert.ok(crlfScript.includes('\r\n'));
    assert.ok(csp.includes(`'sha256-${sha256B64(crlfScript.replace(/\r\n/g, '\n'))}'`));
    assert.ok(!csp.includes(`'sha256-${sha256B64(crlfScript)}'`));
  });

  it('writes .br and .gz siblings that decompress to the exact files', () => {
    for (const h of catalog.hubs) {
      for (const name of ['index.html', 'original.html']) {
        const f = path.join(out, 'hubs', h.slug, name);
        const raw = fs.readFileSync(f);
        assert.ok(zlib.brotliDecompressSync(fs.readFileSync(f + '.br')).equals(raw), `${h.slug}/${name}.br`);
        assert.ok(zlib.gunzipSync(fs.readFileSync(f + '.gz')).equals(raw), `${h.slug}/${name}.gz`);
      }
      assert.equal(h.brBytes, fs.statSync(path.join(out, 'hubs', h.slug, 'original.html.br')).size);
    }
    const cat = fs.readFileSync(path.join(out, 'catalog.json'));
    assert.ok(zlib.brotliDecompressSync(fs.readFileSync(path.join(out, 'catalog.json.br'))).equals(cat));
    assert.ok(zlib.gunzipSync(fs.readFileSync(path.join(out, 'catalog.json.gz'))).equals(cat));
  });

  it('internal catalog = public entry + source, csp, servedSha256', () => {
    assert.equal(internal.hubs.length, catalog.hubs.length);
    for (const h of internal.hubs) {
      const pub = entry(h.slug);
      for (const k of PUBLIC_FIELDS) assert.deepEqual(h[k], pub[k], `${h.slug}.${k}`);
      assert.ok(fs.existsSync(path.join(root, ...h.source.split('/'))));
      assert.match(h.csp, /^default-src 'none'; script-src 'self'/);
      assert.match(h.servedSha256, /^[0-9a-f]{64}$/);
    }
  });

  it('skips the lint hit, lists it in build-report.json and redacts the secret', () => {
    assert.equal(entry('rag-l1-foundation'), undefined);
    assert.ok(!fs.existsSync(path.join(out, 'hubs', 'rag-l1-foundation')));
    const r = report.hubs.find((x) => x.source === P.lint);
    assert.equal(r.status, 'skipped');
    assert.ok(r.errors.some((e) => /publish lint/.test(e)));
    const rules = r.lint.map((f) => f.rule).sort();
    assert.deepEqual(rules, ['aws-access-key', 'email']);
    const aws = r.lint.find((f) => f.rule === 'aws-access-key');
    assert.ok(!JSON.stringify(report).includes(AWS_KEY), 'secret must not appear in the report');
    assert.equal(aws.matchSha256, sha256Hex(Buffer.from(AWS_KEY)));
    assert.equal(report.ok, false);
  });

  it('honours a precise lintAllow entry', () => {
    const r = report.hubs.find((x) => x.source === P.dsa);
    assert.equal(r.status, 'published');
    assert.deepEqual(r.lint.map((f) => [f.rule, f.match, f.allowed]), [['email', 'demo@studyhubs-demo.dev', true]]);
  });

  it('--strict exits 1 on the same input, and still writes the report', () => {
    const r = runCollector(['--src', root, '--config', path.join(root, 'site/hubs.config.json'), '--out', out, '--strict']);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /--strict/);
    assert.equal(readJson(path.join(out, 'build-report.json')).ok, false);
  });

  it('--strict exits 0 once the failing hub is gone, and replaces the old outputs', () => {
    const { dir, cleanup: done } = tmpDir();
    try {
      buildFixtures(dir);
      const cfg = configFor(dir, { withLint: false });
      const o = path.join(dir, 'site', 'build');
      fs.mkdirSync(path.join(o, 'hubs', 'stale-hub'), { recursive: true });
      fs.writeFileSync(path.join(o, 'hubs', 'stale-hub', 'index.html'), 'old');
      fs.writeFileSync(path.join(o, 'build-report.json'), '{}');
      const r = runCollector(['--src', dir, '--config', cfg, '--out', o, '--strict']);
      assert.equal(r.code, 0, r.stdout + r.stderr);
      assert.ok(!fs.existsSync(path.join(o, 'hubs', 'stale-hub')));
      assert.ok(!fs.readdirSync(o).some((n) => n.startsWith('.staging-')));
      assert.equal(readJson(path.join(o, 'build-report.json')).ok, true);
    } finally {
      done();
    }
  });
});

describe('collect-hubs validation', () => {
  function scenario(files, extraConfig = {}, args = []) {
    const { dir, cleanup } = tmpDir();
    try {
      writeTree(dir, files);
      const cfg = path.join(dir, 'cfg.json');
      writeConfig(cfg, extraConfig);
      const out = path.join(dir, 'out');
      const r = runCollector(['--src', dir, '--config', cfg, '--out', out, ...args]);
      const report = fs.existsSync(path.join(out, 'build-report.json')) ? readJson(path.join(out, 'build-report.json')) : null;
      const catalog = fs.existsSync(path.join(out, 'catalog.json')) ? readJson(path.join(out, 'catalog.json')) : null;
      return { ...r, report, catalog };
    } finally {
      cleanup();
    }
  }
  const hub = (id, extra = {}) => hubPage({ dataScripts: [jsonHub({ id, title: `${id} hub`, hero: { title: 'x' }, modules: modules(1), ...extra })] });

  it('skips every hub that shares an id', () => {
    const r = scenario({
      'technical/web-dev/react/hubs/react-l1-foundation-hub.html': hub('same-id'),
      'technical/web-dev/nodejs/hubs/nodejs-l1-foundation-hub.html': hub('same-id'),
      'technical/web-dev/nextjs/hubs/nextjs-l1-foundation-hub.html': hub('nextjs-l1'),
    }, {}, ['--strict']);
    assert.equal(r.code, 1);
    assert.deepEqual(r.catalog.hubs.map((h) => h.id), ['nextjs-l1']);
    assert.equal(r.report.hubs.filter((h) => h.errors.some((e) => /id "same-id" is also used/.test(e))).length, 2);
  });

  it('rejects an id that is another hub\'s slug', () => {
    const r = scenario({
      'technical/web-dev/react/hubs/react-l1-foundation-hub.html': hub('nodejs-l1-foundation'),
      'technical/web-dev/nodejs/hubs/nodejs-l1-foundation-hub.html': hub('nodejs-l1'),
    });
    assert.ok(r.report.hubs.some((h) => h.errors.some((e) => /equals the slug of/.test(e))));
  });

  it('rejects a reserved slug and a bad id', () => {
    const r = scenario({
      'technical/web-dev/react/hubs/admin-hub.html': hub('react-admin'),
      'technical/web-dev/react/hubs/react-l3-specialist-hub.html': hub('Bad_ID'),
    });
    const errs = r.report.hubs.flatMap((h) => h.errors).join('\n');
    assert.match(errs, /slug "admin" is reserved/);
    assert.match(errs, /id "Bad_ID" does not match/);
    assert.equal(r.catalog.hubs.length, 0);
  });

  it('refuses an id override on an engine hub, accepts other overrides', () => {
    const src = 'technical/web-dev/react/hubs/react-l1-foundation-hub.html';
    const r = scenario({ [src]: hub('react-l1') }, { overrides: { [src]: { id: 'other' } } });
    assert.match(r.report.hubs[0].errors.join(), /override "id" is only allowed for static hubs/);
    const r2 = scenario({ [src]: hub('react-l1') }, { overrides: { [src]: { slug: 'react-basics', blurb: 'Hello' } } });
    assert.equal(r2.catalog.hubs[0].slug, 'react-basics');
    assert.equal(r2.catalog.hubs[0].blurb, 'Hello');
  });

  it('fails a v2 hub whose data script throws or never ends (3 s budget)', () => {
    const r = scenario({
      'technical/web-dev/react/hubs/react-l1-foundation-hub.html': hubPage({ dataScripts: ['window.HUB = {id:"react-l1"}; document.body;'] }),
      'technical/web-dev/react/hubs/react-l2-proficient-hub.html': hubPage({ dataScripts: ['window.HUB = {id:"react-l2"}; for(;;){}'] }),
    });
    const errs = r.report.hubs.map((h) => h.errors.join(' '));
    assert.match(errs[0], /metadata scripts failed: .*document is not defined/);
    assert.match(errs[1], /metadata scripts failed: .*timed out/);
    assert.equal(r.catalog.hubs.length, 0);
  });

  it('fails --strict when no hub matches, and when a legacy entry is stale', () => {
    const r = scenario({ 'technical/web-dev/react/notes/readme.html': 'x' }, { legacy: { 'technical/certifications/x/X Study Hub.html': { id: 'x1', keys: ['k.v1'] } } }, ['--strict']);
    assert.equal(r.code, 1);
    assert.match(r.report.errors.join('\n'), /no hub files matched/);
    assert.match(r.report.errors.join('\n'), /legacy entry .* matches no discovered hub/);
  });

  it('never publishes a symlink', () => {
    const { dir, cleanup } = tmpDir();
    try {
      writeTree(dir, { 'outside/secret.html': hub('leak') });
      fs.mkdirSync(path.join(dir, 'technical/web-dev/react/hubs'), { recursive: true });
      fs.symlinkSync(path.join(dir, 'outside/secret.html'), path.join(dir, 'technical/web-dev/react/hubs/leak-hub.html'));
      const cfg = path.join(dir, 'cfg.json');
      writeConfig(cfg);
      const r = runCollector(['--src', dir, '--config', cfg, '--out', path.join(dir, 'out')]);
      assert.equal(r.code, 0);
      const report = readJson(path.join(dir, 'out', 'build-report.json'));
      assert.match(report.hubs[0].errors[0], /symlink/);
      assert.equal(readJson(path.join(dir, 'out', 'catalog.json')).hubs.length, 0);
    } finally {
      cleanup();
    }
  });

  it('refuses unsafe --out directories and bad arguments', () => {
    const { dir, cleanup } = tmpDir();
    try {
      writeTree(dir, { 'technical/web-dev/react/hubs/react-l1-foundation-hub.html': hub('react-l1'), 'other/hubs/keep.txt': 'mine' });
      const cfg = path.join(dir, 'cfg.json');
      writeConfig(cfg);
      let r = runCollector(['--src', dir, '--config', cfg, '--out', dir]);
      assert.equal(r.code, 2);
      assert.match(r.stderr, /must not be the source root/);
      r = runCollector(['--src', dir, '--config', cfg, '--out', path.join(dir, 'other')]);
      assert.equal(r.code, 2);
      assert.match(r.stderr, /refusing to replace/);
      assert.equal(fs.readFileSync(path.join(dir, 'other/hubs/keep.txt'), 'utf8'), 'mine');
      r = runCollector(['--src', dir, '--bogus']);
      assert.equal(r.code, 2);
      fs.writeFileSync(cfg, JSON.stringify({ version: 1, include: ['technical/[ab]/x.html'] }));
      r = runCollector(['--src', dir, '--config', cfg, '--out', path.join(dir, 'out')]);
      assert.equal(r.code, 2);
      assert.match(r.stderr, /not supported/);
    } finally {
      cleanup();
    }
  });
});

describe('collect-hubs units', () => {
  it('derives slugs as the contract lists them', () => {
    assert.equal(deriveSlug('technical/software-engineering/dsa/hubs/dsa-l1-foundation-hub.html'), 'dsa-l1-foundation');
    assert.equal(deriveSlug('technical/certifications/ab-620/AB-620 Study Hub.html'), 'ab-620');
    assert.equal(deriveSlug('technical/certifications/ai-901/AI-901 Study Hub.html'), 'ai-901');
    assert.equal(deriveSlug('x/Weird  Name (v2) Study Hub.html'), 'weird-name-v2');
  });

  it('finds the injection point outside comments, strings and raw-text elements', () => {
    const at = (s) => findInjectionPoint(Buffer.from(s));
    assert.deepEqual(at('<html><HEAD></HEAD >'), { at: 12, anchor: 'head' });
    const tricky = '<!-- </head> --><title></head></title><style>a{} </head></style><x a="</head>"></head>';
    assert.deepEqual(at(tricky), { at: tricky.lastIndexOf('</head>'), anchor: 'head' });
    assert.deepEqual(at('<head><script>"</head>"</script></head>'), { at: 32, anchor: 'head' });
    assert.deepEqual(at('<p><!-- <script> --><script>x</script>'), { at: 20, anchor: 'script' });
    assert.deepEqual(at('<p>no tags of interest</p>'), { at: -1, anchor: null });
    // Byte offsets, not character offsets, with multi-byte text before </head>.
    assert.equal(at('<head><meta content="é✓"></head>').at, Buffer.byteLength('<head><meta content="é✓">'));
  });

  it('lists only the script elements a browser would run', () => {
    const html = '<!--><script>a()</script><!-- <script>b()</script> --><!---><SCRIPT type="x">c()</script ><textarea><script>d()</script></textarea>';
    const scan = scanHtml(Buffer.from(html));
    assert.deepEqual(scan.scripts.map((x) => x.code), ['a()', 'c()']);
    assert.equal(scan.firstScript, 5);
    assert.equal(scan.headEnd, -1);
    // The CSP regex sees more (commented and textarea text), which is harmless but a superset.
    assert.deepEqual(extractInlineScripts(html).map((x) => x.code), ['a()', 'b()', 'c()', 'd()']);
  });

  it('builds the exact spans from build-contracts.md §4', () => {
    assert.equal(injectionSpan({ id: 'ai103', slug: 'ai-103', engine: 'v2' }),
      '<script src="/_sh/bridge.js" data-hub-id="ai103" data-slug="ai-103" data-engine="v2"></script>');
    assert.equal(injectionSpan({ id: 'ai901', slug: 'ai-901', engine: 'legacy', legacyKeys: ['ai901hub.v1'] }),
      '<script src="/_sh/bridge.js" data-hub-id="ai901" data-slug="ai-901" data-engine="legacy" data-legacy-keys="ai901hub.v1"></script><script src="/api/seed/ai901.js"></script>');
  });

  it('hashes inline scripts the way browsers do', () => {
    assert.equal(cspHash('a\r\nb\rc\n'), `'sha256-${sha256B64('a\nb\nc\n')}'`);
    assert.equal(cspHash(''), "'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='");
    const scripts = extractInlineScripts('<script src="/a.js"></script><script data-src="x">1</script><SCRIPT type=module>2</script >');
    assert.deepEqual(scripts.map((s) => s.code), ['1', '2']);
  });

  it('finds storage keys with the .v2 key first', () => {
    assert.deepEqual(storageKeysFor('"studyhub." + H.id + ".mockrun"; "studyhub." + H.id + ".v2"', 'x1'), ['studyhub.x1.v2', 'studyhub.x1.mockrun']);
  });

  it('matches globs like .dockerignore and rejects private segments', () => {
    const re = globToRegExp('technical/certifications/*/*Study Hub.html');
    assert.ok(re.test('technical/certifications/ai-103/AI-103 Study Hub.html'));
    assert.ok(!re.test('technical/certifications/ai-103/sub/AI-103 Study Hub.html'));
    assert.ok(matchesAny('technical/a/b/hubs/x-hub.html', ['technical/*/*/hubs/*-hub.html']));
    assert.ok(!matchesAny('technical/a/b/c/hubs/x-hub.html', ['technical/*/*/hubs/*-hub.html']));
    assert.ok(globToRegExp('a/**/b.html').test('a/b.html'));
    assert.ok(globToRegExp('a/**/b.html').test('a/x/y/b.html'));
    assert.equal(rejectedSegment('technical/data-ai/courses/hubs/x-hub.html'), 'courses');
    assert.equal(rejectedSegment('technical/work/x/hubs/x-hub.html'), 'work');
    assert.equal(rejectedSegment('technical/data-ai/rag/hubs/x-hub.html'), null);
  });

  it('reads the light accent from the last plain :root rule, as the cascade does', () => {
    const base = ':root{--fg:#111;--accent:#2343c4;--accent-ink:#fff}\n' +
      '@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--accent:#8fa4ff}}';
    assert.equal(readAccent([base]), '#2343c4');
    assert.equal(readAccent([base, SUBJECT_ACCENT_CSS]), '#1d6b58');
    assert.equal(readAccent([base + '\n' + SUBJECT_ACCENT_CSS]), '#1d6b58');
    // Comments, other selectors, @media blocks and look-alike properties never count.
    assert.equal(readAccent([base, '/* :root{--accent:#000000} */ body :root{--accent:#111111}']), '#2343c4');
    assert.equal(readAccent([base, '@media print{:root{--accent:#222222}} :root{--sub--accent-x:#333333}']), '#2343c4');
    assert.equal(readAccent([base, ':root { --accent : #444444 !important ; }']), '#444444');
    assert.equal(readAccent([base, ':root{content:"}{";--accent:#555555}']), '#555555');
    // No plain :root rule sets it: the first declaration anywhere, else null.
    assert.equal(readAccent(['body{--accent:#666666} main{--accent:#777777}']), '#666666');
    assert.equal(readAccent(['body{color:red}']), null);
    assert.equal(readAccent([]), null);
  });

  it('collects the text of every real <style> element', () => {
    const html = '<style>a{}</style><!-- <style>b{}</style> --><script>"<style>c{}</style>"</script><STYLE media=x>d{}</style >';
    assert.deepEqual(scanHtml(Buffer.from(html)).styles, ['a{}', 'd{}']);
  });

  it('keeps hub code away from host objects while reading window.HUB', () => {
    // With a host-realm context object, this.constructor.constructor is the host's Function
    // (no codeGeneration limit) and returns the real `process`.
    const escape = "window.HUB = { id: 'x1', title: String(this.constructor.constructor('return process')().pid), modules: [] };";
    assert.throws(() => extractHubMetadata([{ attrs: '', code: escape }], 'escape'), /Code generation from strings disallowed/);
    const probe = `var leaked = [];
      try { leaked.push(typeof this.constructor.constructor('return process')()); } catch (e) { leaked.push(e.name); }
      try { leaked.push(typeof Object.getPrototypeOf(globalThis).constructor.constructor('return 1')()); } catch (e) { leaked.push(e.name); }
      leaked.push(typeof process, typeof require);
      window.HUB = { id: 'x2', title: leaked.join(','), modules: [1, 2] };`;
    const meta = extractHubMetadata([{ attrs: '', code: probe }], 'probe');
    // Every Function reachable from hub code is the context's own, which refuses strings.
    assert.equal(meta.title, 'EvalError,EvalError,undefined,undefined');
    assert.equal(meta.modules, 2);
  });

  it('lint catches common token formats and leaves prose alone', () => {
    const hits = (text) => lintText(text, 'x.html', []).findings.map((f) => f.rule);
    const samples = {
      'openai-key': ['sk-proj-' + 'a1B2'.repeat(10), 'sk-' + 'Z9'.repeat(24)],
      'github-token': ['ghp_' + 'A1'.repeat(18), 'gho_' + 'b2'.repeat(20), 'github_pat_' + '11AB_'.repeat(6)],
      'slack-token': ['xoxb-1234567890-' + 'abcDEF'.repeat(3)],
      jwt: ['eyJ' + 'hbGciOi'.repeat(3) + '.eyJ' + 'zdWIiOi'.repeat(3) + '.' + 'SflKxwRJ'.repeat(3)],
      'azure-key': [
        'DefaultEndpointsProtocol=https;AccountName=demo;AccountKey=' + 'Q2xhdWRl'.repeat(6) + '==;EndpointSuffix=core',
        'Endpoint=sb://x.servicebus.windows.net/;SharedAccessKeyName=r;SharedAccessKey=' + 'aB3+'.repeat(10) + '=',
        'https://a.blob.core.windows.net/c?sv=2022-11-02&sp=r&sig=' + 'AbC%2Bd'.repeat(5),
      ],
    };
    for (const [rule, list] of Object.entries(samples)) {
      for (const text of list) assert.deepEqual(hits(`<p>${text}</p>`), [rule], text);
    }
    // An Anthropic key is reported once, under its own rule.
    assert.deepEqual(hits('sk-ant-' + 'api03-' + 'x'.repeat(30)), ['anthropic-key']);
    // Secrets are redacted in the report.
    const [f] = lintText('ghp_' + 'A1'.repeat(18), 'x.html', []).findings;
    assert.match(f.match, /^ghp_A1… \(40 chars, redacted\)$/);
    // Prose and placeholders that only look similar.
    const prose = [
      'risk-assessment-and-mitigation-planning-for-agents', 'task-management-and-scheduling-overview',
      'design=responsive-layout-with-grid-areas', 'sig=<signature>', 'AccountKey=<your-key>', 'ghp_short',
      'eyJhbGciOiJIUzI1NiJ9 alone', 'xoxb-', 'the sk- prefix',
    ];
    for (const text of prose) assert.deepEqual(hits(text), [], text);
  });

  it('accepts lintAllow entries for every lint rule, and only those', () => {
    assert.deepEqual([...LINT_RULE_IDS].sort(), LINT_RULES.map((r) => r.rule).sort());
  });
});

describe('publish lint: reserved example domains', () => {
  it('skips RFC 2606/6761 example addresses but still flags real ones', async () => {
    const { lintText, isReservedEmailDomain } = await import('../collect-hubs.mjs');
    assert.ok(isReservedEmailDomain('ana@example.com'));
    assert.ok(isReservedEmailDomain('ops@mail.example.org'));
    assert.ok(isReservedEmailDomain('x@corp.test'));
    assert.ok(!isReservedEmailDomain('ana@examples.com'));
    const { findings } = lintText('mail ana@example.com or bob@gmail.com', 'hub.html', []);
    assert.deepEqual(findings.map((f) => f.match), ['bob@gmail.com']);
  });
});
