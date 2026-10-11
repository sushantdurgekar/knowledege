// Tests for verify-context.mjs: the Docker build context must hold only site/** and hub files.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { VERIFY, tmpDir, writeTree, writeConfig } from './helpers.mjs';

const GOOD = {
  'site/hubs.config.json': '{}', // replaced below by a real config
  'site/scripts/collect-hubs.mjs': '// code',
  'site/server/app/main.py': '# code',
  'site/deploy/aws/.env.example': 'APP_ENV=production',
  'site/README.md': '# site docs are fine inside site/',
  'technical/software-engineering/dsa/hubs/dsa-l1-foundation-hub.html': '<!doctype html>',
  'technical/certifications/ai-103/AI-103 Study Hub.html': '<!doctype html>',
};

describe('verify-context', () => {
  let dir, cleanup, cfg;
  before(() => {
    ({ dir, cleanup } = tmpDir('verify-context-test-'));
    cfg = path.join(dir, 'cfg.json');
    writeConfig(cfg);
  });
  after(() => cleanup());

  function check(extra = {}, setup = () => {}) {
    const root = fs.mkdtempSync(path.join(dir, 'ctx-'));
    writeTree(root, { ...GOOD, ...extra });
    setup(root);
    const r = spawnSync(process.execPath, [VERIFY, root, '--config', cfg], { encoding: 'utf8' });
    return { code: r.status, out: r.stdout + r.stderr };
  }

  it('passes for site/** plus the two hub globs (empty extra directories are fine)', () => {
    const r = check({}, (root) => fs.mkdirSync(path.join(root, 'technical/cloud/empty'), { recursive: true }));
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /ok \(5 file\(s\) under site\/, 2 hub file\(s\)\)/);
  });

  for (const [name, rel] of [
    ['a root README', 'README.md'],
    ['a note next to a hub', 'technical/certifications/ai-103/README.md'],
    ['_meta', '_meta/learner-profile.md'],
    ['sessions', 'sessions/2026/10/log.md'],
    ['practice', 'practice/srs/cards.jsonl'],
    ['work', 'work/gain-insights/x.txt'],
    ['a course file', 'technical/data-ai/rag/courses/udemy-x/README.md'],
    ['a hub-like file outside the globs', 'technical/software-engineering/dsa/notes/x-hub.html'],
  ]) {
    it(`fails on ${name}`, () => {
      const r = check({ [rel]: 'x' });
      assert.equal(r.code, 1, r.out);
      assert.ok(r.out.includes(rel), r.out);
    });
  }

  it('fails on a glob match that sits in a rejected segment', () => {
    const rel = 'technical/work/notes/hubs/x-l1-foundation-hub.html';
    const r = check({ [rel]: 'x' });
    assert.equal(r.code, 1);
    assert.match(r.out, /rejected segment "work"/);
  });

  it('fails on .env files, even inside site/', () => {
    const r = check({ 'site/server/.env': 'SECRET_KEY=x' });
    assert.equal(r.code, 1);
    assert.match(r.out, /site\/server\/\.env: environment\/secret file/);
  });

  it('fails on a symlink at a hub path', () => {
    const r = check({}, (root) => {
      fs.symlinkSync('/etc/hostname', path.join(root, 'technical/software-engineering/dsa/hubs/link-l2-proficient-hub.html'));
    });
    assert.equal(r.code, 1);
    assert.match(r.out, /not a regular file/);
  });

  it('exits 2 on usage errors', () => {
    let r = spawnSync(process.execPath, [VERIFY], { encoding: 'utf8' });
    assert.equal(r.status, 2);
    r = spawnSync(process.execPath, [VERIFY, path.join(dir, 'missing')], { encoding: 'utf8' });
    assert.equal(r.status, 2);
  });
});
