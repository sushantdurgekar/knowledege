// Tests for site/hubs.config.json itself, and its agreement with every other file that lists
// the hub globs: the root .dockerignore, the CI workflow's path filters, render.yaml's build
// filter and deploy-paths.mjs. A hub glob missing from any of them means new hubs never build,
// never trigger CI or never deploy.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, matchesAny } from '../lib/hub-paths.mjs';
import { deployGlobs, deployRelevant } from '../deploy-paths.mjs';
import { INCLUDE, REAL_CONFIG, REPO_ROOT } from './helpers.mjs';

const DOCKERIGNORE = path.join(REPO_ROOT, '.dockerignore');
const WORKFLOW = path.join(REPO_ROOT, '.github', 'workflows', 'site.yml');
const RENDER_YAML = path.join(REPO_ROOT, 'site', 'render.yaml');

/**
 * The items of every YAML block list that follows a `paths:` key, in file order. A tiny
 * line-based reader is enough for these two hand-written files and keeps the tests free of
 * a YAML dependency.
 */
function yamlPathLists(text) {
  const lists = [];
  let cur = null;
  let keyIndent = -1;
  for (const line of text.split(/\r?\n/)) {
    const m = /^(\s*)paths:\s*$/.exec(line);
    if (m) {
      cur = [];
      keyIndent = m[1].length;
      lists.push(cur);
      continue;
    }
    if (!cur) continue;
    const item = /^(\s*)-\s+(.*?)\s*$/.exec(line);
    if (item && item[1].length >= keyIndent) cur.push(item[2].replace(/^(['"])(.*)\1$/, '$2'));
    else if (line.trim() && !line.trim().startsWith('#')) cur = null;
  }
  return lists;
}

/** The `!pattern` lines of a .dockerignore that re-include something outside site/. */
function dockerignoreHubGlobs(text) {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith('!') && l !== '!site' && !l.startsWith('!site/'))
    .map((l) => l.slice(1));
}

describe('hubs.config.json', () => {
  const raw = JSON.parse(fs.readFileSync(REAL_CONFIG, 'utf8'));
  const cfg = loadConfig(REAL_CONFIG);

  it('loads and validates', () => {
    assert.ok(cfg.include.length > 0);
  });

  it('has exactly the two hub globs', () => {
    assert.deepEqual(raw.include, INCLUDE);
  });

  it('maps the AI-901 legacy hub exactly', () => {
    assert.deepEqual(raw.legacy, {
      'technical/certifications/ai-901/AI-901 Study Hub.html': { id: 'ai901', keys: ['ai901hub.v1'] },
    });
  });

  it('reserves the shell and API route names', () => {
    for (const s of ['admin', 'api', 'assets', '_sh', 'h', 'signin', 'account']) assert.ok(cfg.reservedSlugs.has(s), s);
  });

  it('labels the domains in use', () => {
    assert.equal(cfg.subjectLabels.dsa, 'Data Structures & Algorithms');
    assert.equal(cfg.domainLabels['software-engineering'], 'Software Engineering');
    assert.equal(cfg.domainLabels.certifications, 'Certifications');
  });

  it('only names hub paths the globs can match in legacy, overrides and lintAllow', () => {
    const paths = [
      ...Object.keys(cfg.legacy),
      ...Object.keys(cfg.overrides),
      ...cfg.lintAllow.map((a) => a.source).filter((s) => s !== '*'),
    ];
    for (const p of paths) assert.ok(matchesAny(p, cfg.include), p);
  });

  it('matches the hub allow-list lines in the root .dockerignore', (t) => {
    if (!fs.existsSync(DOCKERIGNORE)) {
      t.skip('no root .dockerignore yet (the infra component writes it)');
      return;
    }
    const allow = dockerignoreHubGlobs(fs.readFileSync(DOCKERIGNORE, 'utf8'));
    assert.deepEqual(allow.sort(), [...raw.include].sort());
  });

  it('reads hub globs from a .dockerignore shaped like architecture-spec §4.12', () => {
    const spec = '**\n!site/**\n!technical/*/*/hubs/*-hub.html\n!technical/certifications/*/*Study Hub.html\n' +
      'site/**/node_modules\nsite/**/.venv\nsite/build\nsite/**/.env*\n';
    assert.deepEqual(dockerignoreHubGlobs(spec).sort(), [...raw.include].sort());
    assert.deepEqual(dockerignoreHubGlobs(spec + '!_meta/**\n').length, 3);
  });

  it('appears in both path filters of the site workflow, in deploy-paths order', () => {
    const lists = yamlPathLists(fs.readFileSync(WORKFLOW, 'utf8'));
    assert.equal(lists.length, 2, 'expected the push and pull_request paths lists');
    for (const list of lists) assert.deepEqual(list, deployGlobs(raw.include));
  });

  it("appears in render.yaml's build filter", () => {
    const lists = yamlPathLists(fs.readFileSync(RENDER_YAML, 'utf8'));
    assert.equal(lists.length, 1, 'expected one buildFilter.paths list');
    for (const g of raw.include) assert.ok(lists[0].includes(g), `${g} missing from render.yaml buildFilter.paths`);
    assert.ok(lists[0].includes('site/**'));
  });
});

describe('deploy-paths', () => {
  const { include } = loadConfig(REAL_CONFIG);

  it('treats site code, hub files and build inputs as deploy-relevant', () => {
    const hits = deployRelevant([
      'site/server/app/main.py',
      'technical/software-engineering/dsa/hubs/dsa-l4-expert-hub.html',
      'technical/certifications/ai-103/AI-103 Study Hub.html',
      '.dockerignore',
      '.github/workflows/site.yml',
    ], include);
    assert.equal(hits.length, 5);
  });

  it('ignores notes, plans, sessions and other workflows', () => {
    assert.deepEqual(deployRelevant([
      'technical/software-engineering/dsa/concepts/l4-01-graphs.md',
      'technical/software-engineering/dsa/hubs/README.md',
      'sessions/2026/10/2026-10-11-0600-dsa-l3-hub.md',
      '_meta/hub-program/README.md',
      '.github/workflows/other.yml',
      'INDEX.md',
      '',
    ], include), []);
  });
});
