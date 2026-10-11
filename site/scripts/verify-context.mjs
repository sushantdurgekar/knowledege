#!/usr/bin/env node
// verify-context.mjs: prove that a copied Docker build context held to the allow-list.
//
//   node site/scripts/verify-context.mjs <root> [--config <hubs.config.json>]
//
// Passes only when every non-directory entry under <root> is either
//   - under site/, or
//   - a regular file matching one of the hub globs in hubs.config.json ("include"),
//     with no rejected segment (courses, work, _meta, sessions, practice, …) in its path.
// Also fails on any .env / .env.* file (except *.example) anywhere, and on symlinks
// outside site/. Directories are not judged on their own: they hold nothing.
//
// Exit codes: 0 ok, 1 violations found, 2 usage or config error. Standard library only.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, matchesAny, rejectedSegment } from './lib/hub-paths.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const USAGE = 'usage: verify-context.mjs <root> [--config <hubs.config.json>]';
const MAX_LISTED = 50;

const isEnvFile = (name) => (name === '.env' || name.startsWith('.env.')) && !name.endsWith('.example');

/** Walk the tree without following symlinks; returns violations and counts. */
export function verifyContext(root, globs) {
  const violations = [];
  const counts = { site: 0, hubs: 0 };
  const walk = (dirRel) => {
    const abs = dirRel ? path.join(root, ...dirRel.split('/')) : root;
    let entries;
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch (e) {
      violations.push(`${dirRel || '.'}: cannot read directory (${e.code ?? e.message})`);
      return;
    }
    for (const e of entries) {
      const rel = dirRel ? `${dirRel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        walk(rel);
        continue;
      }
      if (isEnvFile(e.name)) {
        violations.push(`${rel}: environment/secret file`);
        continue;
      }
      if (rel.startsWith('site/')) {
        counts.site++;
        continue;
      }
      if (!matchesAny(rel, globs)) {
        violations.push(`${rel}: not under site/ and not a hub file`);
        continue;
      }
      const bad = rejectedSegment(rel);
      if (bad) violations.push(`${rel}: hub path contains the rejected segment "${bad}"`);
      else if (!e.isFile()) violations.push(`${rel}: hub path is not a regular file (symlink or special file)`);
      else counts.hubs++;
    }
  };
  walk('');
  return { violations, counts };
}

function defaultConfig(root) {
  const beside = path.join(SCRIPT_DIR, '..', 'hubs.config.json');
  if (fs.existsSync(beside)) return beside;
  return path.join(root, 'site', 'hubs.config.json');
}

function main(argv) {
  let root = null;
  let configPath = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--config') {
      configPath = argv[++i];
      if (!configPath) { console.error(USAGE); return 2; }
    } else if (a === '-h' || a === '--help') {
      console.log(USAGE);
      return 0;
    } else if (a.startsWith('--') || root !== null) {
      console.error(`unknown argument "${a}"\n${USAGE}`);
      return 2;
    } else root = a;
  }
  if (!root) { console.error(USAGE); return 2; }
  root = path.resolve(root);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    console.error(`verify-context: ${root} is not a directory`);
    return 2;
  }
  let config;
  try {
    config = loadConfig(configPath ?? defaultConfig(root));
  } catch (e) {
    console.error(`verify-context: ${e.message}`);
    return 2;
  }
  const { violations, counts } = verifyContext(root, config.include);
  if (violations.length) {
    console.error(`verify-context: FAIL, ${violations.length} entr${violations.length === 1 ? 'y' : 'ies'} outside the allow-list in ${root}:`);
    for (const v of violations.slice(0, MAX_LISTED)) console.error(`  ${v}`);
    if (violations.length > MAX_LISTED) console.error(`  … and ${violations.length - MAX_LISTED} more`);
    return 1;
  }
  console.log(`verify-context: ok (${counts.site} file(s) under site/, ${counts.hubs} hub file(s)) in ${root}`);
  if (counts.hubs === 0) console.warn('verify-context: warning: no hub files found');
  return 0;
}

const invokedPath = process.argv[1] ? fs.realpathSync(path.resolve(process.argv[1])) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
