// Tests for check-image.sh: offline listing mode, plus the docker plumbing via a fake docker CLI.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { CHECK_IMAGE, SCRIPTS_DIR, tmpDir, writeTree } from './helpers.mjs';

const FAKE_DOCKER = path.join(SCRIPTS_DIR, 'test', 'fake-docker.sh');
const HUB_FILES = ['index.html', 'index.html.br', 'index.html.gz', 'original.html', 'original.html.br', 'original.html.gz'];
const SLUGS = ['ai-103', 'dsa-l1-foundation'];
const catalogJson = (slugs = SLUGS) => JSON.stringify({ version: 1, generatedAt: 'x', hubs: slugs.map((slug) => ({ slug })) });

/** The /app tree of a healthy image. */
function goodApp() {
  const files = {
    'app/main.py': '#',
    'app/hubs_routes.py': '#',
    'public/index.html': '<!doctype html>',
    'public/_sh/bridge.js': '//',
    'build/catalog.json': catalogJson(),
    'build/catalog.json.br': 'x',
    'build/catalog.json.gz': 'x',
    'build/catalog.internal.json': '{}',
    'build/build-report.json': '{}',
    'requirements.txt': 'fastapi',
  };
  for (const s of SLUGS) for (const f of HUB_FILES) files[`build/hubs/${s}/${f}`] = 'x';
  return files;
}

/** Offline listing in the same "<type>\t<path>" format the script produces. */
function listingOf(files) {
  const dirs = new Set();
  for (const rel of Object.keys(files)) {
    const parts = rel.split('/');
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'));
  }
  return [...[...dirs].map((d) => `d\t${d}`), ...Object.keys(files).map((f) => `f\t${f}`)].join('\n') + '\n';
}

describe('check-image.sh', () => {
  let dir, cleanup;
  before(() => ({ dir, cleanup } = tmpDir('check-image-test-')));
  after(() => cleanup());

  function offline(files, slugs = SLUGS) {
    const case_ = fs.mkdtempSync(path.join(dir, 'case-'));
    fs.writeFileSync(path.join(case_, 'listing.txt'), listingOf(files));
    fs.writeFileSync(path.join(case_, 'catalog.json'), catalogJson(slugs));
    const r = spawnSync('bash', [CHECK_IMAGE, '--listing', path.join(case_, 'listing.txt'), '--catalog', path.join(case_, 'catalog.json')], { encoding: 'utf8' });
    return { code: r.status, out: r.stdout + r.stderr };
  }

  it('passes a clean image listing', () => {
    const r = offline(goodApp());
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /2 catalog hub\(s\), 12 hub file\(s\)/);
  });

  for (const [name, rel, pattern] of [
    ['a markdown file', 'app/README.md', /markdown file/],
    ['_meta', '_meta/resume.md', /private folder '_meta'/],
    ['sessions', 'data/sessions/log.txt', /private folder 'sessions'/],
    ['practice', 'practice/srs/cards.jsonl', /private folder 'practice'/],
    ['work', 'build/work/client.txt', /private folder 'work'/],
    ['courses', 'public/courses/x.html', /private folder 'courses'/],
    ['raw vault content', 'technical/x/hubs/a-hub.html', /private folder 'technical'/],
    ['an env file', 'app/.env', /environment\/secret file/],
    ['a hub not in the catalog', 'build/hubs/ghost/index.html', /not an output for a catalog hub/],
    ['an unexpected file in a catalog hub folder', 'build/hubs/ai-103/notes.txt', /not an output for a catalog hub/],
    ['a hubs/ folder elsewhere', 'public/hubs/ai-103/index.html', /not an output for a catalog hub/],
  ]) {
    it(`fails on ${name}`, () => {
      const r = offline({ ...goodApp(), [rel]: 'x' });
      assert.equal(r.code, 1, r.out);
      assert.match(r.out, pattern);
    });
  }

  it('fails when a catalog hub is missing a file, or the catalogs are missing', () => {
    const files = goodApp();
    delete files['build/hubs/ai-103/original.html.gz'];
    delete files['build/catalog.internal.json'];
    const r = offline(files);
    assert.equal(r.code, 1);
    assert.match(r.out, /build\/hubs\/ai-103\/original\.html\.gz: missing/);
    assert.match(r.out, /build\/catalog\.internal\.json: missing/);
  });

  it('rejects a catalog with an unsafe slug', () => {
    const r = offline(goodApp(), ['../etc']);
    assert.equal(r.code, 2);
    assert.match(r.out, /invalid slug/);
  });

  describe('against an image (fake docker CLI)', () => {
    function image(files, env = {}) {
      const root = fs.mkdtempSync(path.join(dir, 'img-'));
      writeTree(path.join(root, 'app'), files);
      writeTree(root, { 'usr/lib/readme.md': 'outside /app is not checked' });
      const r = spawnSync('bash', [CHECK_IMAGE, 'fake/image:test'], {
        encoding: 'utf8',
        env: { ...process.env, DOCKER: FAKE_DOCKER, FAKE_ROOT: root, FAKE_IMAGE: 'fake/image:test', ...env },
      });
      return { code: r.status, out: r.stdout + r.stderr };
    }

    it('passes a clean image using find in the image', () => {
      const r = image(goodApp());
      assert.equal(r.code, 0, r.out);
      assert.match(r.out, /12 hub file\(s\)/);
    });

    it('fails on a planted file using find in the image', () => {
      const r = image({ ...goodApp(), 'build/hubs/ghost/index.html': 'x', 'app/notes.md': '#' });
      assert.equal(r.code, 1);
      assert.match(r.out, /ghost/);
      assert.match(r.out, /app\/notes\.md: markdown file/);
    });

    it('falls back to docker export when find cannot run', () => {
      let r = image(goodApp(), { FAKE_FIND_FAIL: '1' });
      assert.equal(r.code, 0, r.out);
      assert.match(r.out, /falling back to docker export/);
      r = image({ ...goodApp(), '_meta/x.txt': 'x' }, { FAKE_FIND_FAIL: '1' });
      assert.equal(r.code, 1);
      assert.match(r.out, /_meta/);
    });

    it('fails when the image has no catalog, and exits 2 for an unknown image', () => {
      const files = goodApp();
      delete files['build/catalog.json'];
      let r = image(files);
      assert.equal(r.code, 1);
      assert.match(r.out, /catalog\.json is missing/);
      r = spawnSync('bash', [CHECK_IMAGE, 'nope:latest'], { encoding: 'utf8', env: { ...process.env, DOCKER: FAKE_DOCKER, FAKE_ROOT: dir } });
      assert.equal(r.status, 2);
    });
  });
});
