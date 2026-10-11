#!/usr/bin/env node
// deploy-paths.mjs: which changed files affect the deployed site.
//
//   node site/scripts/deploy-paths.mjs <changed-files.txt> [--config site/hubs.config.json]
//
// Reads repo-relative paths, one per line, and prints the ones that change what Render builds
// or what CI tests: site/**, the hub globs from hubs.config.json, the root .dockerignore and
// the site workflow. These are also the workflow's `on.push.paths` (a test keeps them equal),
// so "no line printed" means: the image would be identical, and no workflow run was started
// for those files. Exit 0 when nothing matched, 1 when something did, 2 on usage errors.
//
// The CI deploy job uses it when main has moved past the tested commit: if only notes changed
// in between, it still deploys (the new head builds the same image); otherwise it leaves the
// deploy to the head's own run.
//
// Node standard library only (the deploy job runs it on the runner's preinstalled Node).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, matchesAny } from './lib/hub-paths.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CONFIG = path.resolve(SCRIPT_DIR, '..', 'hubs.config.json');

/** Paths that are not hubs but still feed the site build or its CI (the hub globs come from config). */
export const SITE_PATHS = Object.freeze(['site/**', '.dockerignore', '.github/workflows/site.yml']);

/** The full trigger list, in the order the workflow's `paths:` filters list it. */
export function deployGlobs(include) {
  return [SITE_PATHS[0], ...include, ...SITE_PATHS.slice(1)];
}

/** The changed paths (blank lines ignored) that match a deploy glob. */
export function deployRelevant(paths, include) {
  const globs = deployGlobs(include);
  return paths.map((p) => p.trim()).filter((p) => p && matchesAny(p, globs));
}

function main(argv) {
  let file = null;
  let config = DEFAULT_CONFIG;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--config' && argv[i + 1]) config = argv[++i];
    else if (!file && !argv[i].startsWith('--')) file = argv[i];
    else {
      console.error(`deploy-paths: unexpected argument "${argv[i]}"`);
      return 2;
    }
  }
  if (!file) {
    console.error('usage: deploy-paths.mjs <changed-files.txt> [--config hubs.config.json]');
    return 2;
  }
  let include;
  let lines;
  try {
    ({ include } = loadConfig(config));
    lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  } catch (e) {
    console.error(`deploy-paths: ${e.message}`);
    return 2;
  }
  const hits = deployRelevant(lines, include);
  for (const h of hits) console.log(h);
  return hits.length ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
