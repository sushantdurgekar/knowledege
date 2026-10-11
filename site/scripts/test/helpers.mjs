// Test helpers: synthetic hub files and throwaway trees under os.tmpdir().
// Nothing here is committed as a binary fixture; everything is generated at test time.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const SCRIPTS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SITE_DIR = path.resolve(SCRIPTS_DIR, '..');
export const REPO_ROOT = path.resolve(SITE_DIR, '..');
export const COLLECTOR = path.join(SCRIPTS_DIR, 'collect-hubs.mjs');
export const VERIFY = path.join(SCRIPTS_DIR, 'verify-context.mjs');
export const CHECK_IMAGE = path.join(SCRIPTS_DIR, 'check-image.sh');
export const REAL_CONFIG = path.join(SITE_DIR, 'hubs.config.json');

export const INCLUDE = ['technical/*/*/hubs/*-hub.html', 'technical/certifications/*/*Study Hub.html'];

/** Fresh temp directory, removed by the returned cleanup function. */
export function tmpDir(prefix = 'collect-hubs-test-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return { dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

/** Write {relPath: string|Buffer} under root. */
export function writeTree(root, files) {
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, ...rel.split('/'));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
}

export function writeConfig(file, extra = {}) {
  const cfg = {
    version: 1,
    include: INCLUDE,
    legacy: {},
    reservedSlugs: ['admin', 'api', 'assets', '_sh', 'h', 'signin', 'account'],
    labels: {
      domains: { 'software-engineering': 'Software Engineering', certifications: 'Certifications' },
      subjects: { dsa: 'Data Structures & Algorithms' },
    },
    overrides: {},
    lintAllow: [],
    ...extra,
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2));
  return cfg;
}

export function runCollector(args, opts = {}) {
  const r = spawnSync(process.execPath, [COLLECTOR, ...args], { encoding: 'utf8', ...opts });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

export const sha256Hex = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
export const sha256B64 = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('base64');

/** A minimal engine script that carries every v2 probe string. */
export function v2Engine() {
  return `
(function () {
"use strict";
/* ===== core: storage + account sync ===== */
const H = window.HUB;
const M = H.modules;
const LKEY = "studyhub." + H.id + ".v2";
const SYNC = { db: null, base: null };
async function initSync() {
  if (!window.claude || typeof window.claude.use !== "function") return;
  const [db, user] = await Promise.all([window.claude.use("db"), window.claude.use("user")]);
  SYNC.db = db;
}
async function pull(part) { const snap = await SYNC.db.doc(SYNC.base + "/" + part).get(); return snap.exists; }
const RUNKEY = "studyhub." + H.id + ".mockrun";
initSync();
})();
`;
}

/**
 * A hub page shaped like the real ones: an empty <head> with one <style>, then
 * the shell in <body>, data script(s), and the engine last.
 */
export function hubPage({
  title = 'Test Hub', accent = '#2343c4', headExtra = '', bodyExtra = '',
  dataScripts = [], engine = v2Engine(), headEnd = '</head>',
} = {}) {
  const data = dataScripts.map((d) => `<script>${d}</script>\n`).join('');
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">` +
    `<style>:root{--fg:#111;--accent:${accent};--accent-ink:#fff;--accent-soft:#eef}</style>${headExtra}${headEnd}<body>\n` +
    `<title>${title}</title>\n<header class="top"><h1>${title}</h1></header>\n<main id="app"></main>\n${bodyExtra}` +
    data +
    (engine ? `<script>${engine}</script>\n` : '') +
    `</body></html>\n`
  );
}

export const jsonHub = (hub) => `\nwindow.HUB = ${JSON.stringify(hub)};\n`;
export const modules = (n) => Array.from({ length: n }, (_, i) => ({ id: `m${i + 1}`, t: `Module ${i + 1}` }));
