#!/usr/bin/env node
// Checks the built shell against its size budgets (build-contracts.md §7, §14, §21):
//   main JS      <= 90 KB gzipped   (entry script + every chunk index.html preloads)
//   CSS          <= 10 KB gzipped   (every stylesheet index.html links)
//   Firebase JS  <= 80 KB gzipped   (assets/firebase-*.js: the SDK chunk + the shell's wrapper)
//   admin JS     <= 40 KB gzipped   (assets/Admin-*.js plus every lazy chunk it imports statically)
// and that the main JS holds no Firebase code (the SDK must stay a lazy chunk).
// Other lazy chunks are listed for information only. Sizes use gzip level 9, like the build's .gz files.
//
// Usage: node scripts/check-budgets.mjs [publicDir]    (default: ../server/public)
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const KB = 1024;
const BUDGETS = { js: 90 * KB, css: 10 * KB, firebase: 80 * KB, admin: 40 * KB };
// Lazy Firebase chunks: `firebase` (vite.config.ts manualChunks) and the `firebase-auth` wrapper.
const FIREBASE_CHUNK = /^assets\/firebase-.*\.js$/;
// The lazy /admin page (App.tsx: import('./pages/admin/Admin')).
const ADMIN_CHUNK = /^assets\/Admin-[\w-]+\.js$/;
// Static imports between built chunks: `import{a as b}from"./x-123.js"` (not dynamic `import("./…")`).
const STATIC_IMPORT = /\bimport\s*(?:[^"';()]*?\bfrom\s*)?["']\.\/([^"']+?\.js)["']/g;
// Strings only the Firebase Auth SDK contains; none may appear in the main JS.
const FIREBASE_MARKERS = ['identitytoolkit.googleapis.com', 'securetoken.googleapis.com'];

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(process.argv[2] ?? path.join(here, '..', '..', 'server', 'public'));

const gz = async (rel) => {
  const body = await readFile(path.join(publicDir, rel));
  return { rel, raw: body.length, gz: gzipSync(body, { level: 9 }).length, text: body.toString('utf8') };
};
const fmt = (n) => `${(n / KB).toFixed(1)} KB`;

let html;
try {
  html = await readFile(path.join(publicDir, 'index.html'), 'utf8');
} catch {
  console.error(`check-budgets: no index.html in ${publicDir}. Run "npm run build" first.`);
  process.exit(1);
}

// Local files referenced by index.html: <script src>, <link rel=modulepreload|stylesheet href>.
const localRef = (url) => (url.startsWith('/') && !url.startsWith('//') ? url.slice(1) : null);
const scripts = new Set();
const styles = new Set();
for (const tag of html.match(/<(?:script|link)\b[^>]*>/gi) ?? []) {
  const url = /\b(?:src|href)="([^"]+)"/i.exec(tag)?.[1];
  const rel = url ? localRef(url) : null;
  if (!rel) continue;
  if (/^<script/i.test(tag) || /rel="modulepreload"/i.test(tag)) scripts.add(rel);
  else if (/rel="stylesheet"/i.test(tag)) styles.add(rel);
}
if (scripts.size === 0) {
  console.error('check-budgets: index.html references no local script; is this a Vite build?');
  process.exit(1);
}

const mainJs = await Promise.all([...scripts].map(gz));
const css = await Promise.all([...styles].map(gz));
const initial = new Set([...scripts, ...styles]);
const assetNames = await readdir(path.join(publicDir, 'assets')).catch(() => []);
const lazyAll = await Promise.all(
  assetNames
    .map((name) => `assets/${name}`)
    .filter((rel) => /\.(?:js|css)$/.test(rel) && !initial.has(rel))
    .map(gz),
);
const firebase = lazyAll.filter((file) => FIREBASE_CHUNK.test(file.rel));
const lazy = lazyAll.filter((file) => !FIREBASE_CHUNK.test(file.rel));

// The admin chunk and the lazy chunks it pulls in statically (shared helpers), never the main JS.
const byRel = new Map(lazyAll.map((file) => [file.rel, file]));
const admin = [];
const pending = lazyAll.filter((file) => ADMIN_CHUNK.test(file.rel)).map((file) => file.rel);
const seen = new Set(pending);
while (pending.length > 0) {
  const file = byRel.get(pending.pop());
  if (!file) continue;
  admin.push(file);
  for (const match of file.text.matchAll(STATIC_IMPORT)) {
    const rel = `assets/${match[1]}`;
    if (!seen.has(rel) && byRel.has(rel)) {
      seen.add(rel);
      pending.push(rel);
    }
  }
}
if (admin.length === 0) {
  console.error('check-budgets: no assets/Admin-*.js chunk; is /admin still a lazy route?');
  process.exit(1);
}

const sum = (files) => files.reduce((total, file) => total + file.gz, 0);
const rows = [
  ['main JS', mainJs, BUDGETS.js],
  ['CSS', css, BUDGETS.css],
  ['Firebase', firebase, BUDGETS.firebase],
  ['admin JS', admin, BUDGETS.admin],
];

let failed = false;
for (const file of mainJs) {
  const hits = FIREBASE_MARKERS.filter((marker) => file.text.includes(marker));
  if (FIREBASE_CHUNK.test(file.rel) || hits.length > 0) {
    failed = true;
    console.error(`check-budgets: main JS ${file.rel} contains Firebase (${hits.join(', ') || 'preloaded chunk'}).`);
  }
}
console.log(`Budgets for ${path.relative(process.cwd(), publicDir) || '.'} (gzip -9):`);
for (const [label, files, budget] of rows) {
  const total = sum(files);
  const ok = total <= budget;
  failed ||= !ok;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(9)} ${fmt(total).padStart(9)} / ${fmt(budget)}`);
  for (const file of files) console.log(`         ${file.rel}  ${fmt(file.raw)} raw, ${fmt(file.gz)} gz`);
}
if (lazy.length > 0) {
  console.log('  lazy chunks (not budgeted here):');
  for (const file of lazy) console.log(`         ${file.rel}  ${fmt(file.raw)} raw, ${fmt(file.gz)} gz`);
}
if (failed) {
  console.error('check-budgets: over budget.');
  process.exit(1);
}
