// Shared helpers for collect-hubs.mjs and verify-context.mjs:
// glob matching (the subset .dockerignore and the collector agree on), the
// rejected-segment rule, directory expansion and hubs.config.json validation.
// Node 22 standard library only.

import fs from 'node:fs';
import path from 'node:path';

/** Path segments that can never hold a publishable hub (private or bulky vault areas). */
export const REJECTED_SEGMENTS = Object.freeze([
  'courses', 'projects', 'examples', 'datasets', 'media', 'docs',
  'notes', 'snippets', 'work', '_meta', 'sessions', 'practice',
]);
const REJECTED_SET = new Set(REJECTED_SEGMENTS);

/** Hub ids: also used in storage keys and URLs. */
export const ID_RE = /^[a-z0-9][a-z0-9-]{1,40}$/;
/** Slugs: URL path segment under /h/. */
export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/;
/** localStorage keys that legacy hubs own (written into a data- attribute, so keep them plain). */
export const STORAGE_KEY_RE = /^[A-Za-z0-9._:-]{1,80}$/;

/** Convert an OS path to the forward-slash form used in config files and reports. */
export function toPosix(p) {
  return p.split(path.sep).join('/');
}

/**
 * Compile a glob into an anchored RegExp.
 * Supported: `*` (any run of characters except `/`), `?` (one character except `/`)
 * and `**` as a whole segment (zero or more segments). This is the common subset of
 * Go's filepath.Match (used by .dockerignore) and our matcher; character classes,
 * braces and escapes are refused by validateGlob() so the two can never disagree.
 */
export function globToRegExp(glob) {
  const segs = glob.split('/');
  let re = '^';
  segs.forEach((seg, i) => {
    const last = i === segs.length - 1;
    if (seg === '**') {
      re += last ? '.*' : '(?:[^/]+/)*';
      return;
    }
    for (const ch of seg) {
      if (ch === '*') re += '[^/]*';
      else if (ch === '?') re += '[^/]';
      else re += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    if (!last) re += '/';
  });
  return new RegExp(re + '$');
}

/** Returns an error message for a glob we do not support, or null. */
export function validateGlob(glob) {
  if (typeof glob !== 'string' || glob.length === 0) return 'glob must be a non-empty string';
  if (glob.startsWith('/') || glob.startsWith('!')) return `glob "${glob}" must be repo-relative and must not start with "/" or "!"`;
  if (/[[\]{}\\]/.test(glob)) return `glob "${glob}" uses [], {} or \\ which are not supported`;
  const segs = glob.split('/');
  if (segs.some((s) => s === '' || s === '.' || s === '..')) return `glob "${glob}" has an empty, "." or ".." segment`;
  if (segs.some((s) => s.includes('**') && s !== '**')) return `glob "${glob}": "**" must be a whole segment`;
  if (!/\.html$/i.test(segs[segs.length - 1])) return `glob "${glob}" must end in .html`;
  return null;
}

/** True when the repo-relative posix path matches one of the globs. */
export function matchesAny(relPath, globs) {
  return globs.some((g) => globToRegExp(g).test(relPath));
}

/** Returns the first rejected segment found in the (posix) path, or null. */
export function rejectedSegment(relPath) {
  for (const seg of relPath.split('/')) {
    if (REJECTED_SET.has(seg.toLowerCase())) return seg;
  }
  return null;
}

/**
 * Expand one glob below `root` by walking only directories that can match,
 * so a large vault (courses, node_modules…) is never scanned in full.
 * Symlinks are never followed. Returns [{rel, kind}] where kind is
 * 'file' | 'symlink' | 'other' for entries whose full path matches.
 */
export function expandGlob(root, glob) {
  const segs = glob.split('/');
  const out = [];
  const seen = new Set();
  const push = (rel, kind) => {
    if (!seen.has(rel)) {
      seen.add(rel);
      out.push({ rel, kind });
    }
  };
  const segRe = (seg) => globToRegExp(seg); // single segment: no "/" inside

  function walk(dirRel, i) {
    const abs = dirRel ? path.join(root, ...dirRel.split('/')) : root;
    let entries;
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      return; // missing or unreadable directory: nothing matches below it
    }
    const seg = segs[i];
    const last = i === segs.length - 1;
    if (seg === '**') {
      walk(dirRel, i + 1); // zero segments
      for (const e of entries) {
        if (e.isDirectory()) walk(join(dirRel, e.name), i); // one or more
      }
      return;
    }
    const re = segRe(seg);
    for (const e of entries) {
      if (!re.test(e.name)) continue;
      const rel = join(dirRel, e.name);
      if (last) {
        if (e.isDirectory()) continue;
        push(rel, e.isFile() ? 'file' : e.isSymbolicLink() ? 'symlink' : 'other');
      } else if (e.isDirectory()) {
        walk(rel, i + 1);
      }
    }
  }
  walk('', 0);
  return out;
}

function join(a, b) {
  return a ? `${a}/${b}` : b;
}

/** Expand every glob, de-duplicated and sorted for deterministic output. */
export function expandGlobs(root, globs) {
  const byRel = new Map();
  for (const g of globs) for (const hit of expandGlob(root, g)) byRel.set(hit.rel, hit);
  return [...byRel.values()].sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
}

const TOP_KEYS = new Set(['$comment', 'version', 'include', 'legacy', 'reservedSlugs', 'labels', 'overrides', 'lintAllow']);
export const OVERRIDE_KEYS = new Set(['slug', 'id', 'title', 'code', 'cert', 'blurb', 'accent', 'kind', 'level']);
/** Ids of collect-hubs.mjs LINT_RULES, for validating lintAllow (a test keeps the two equal). */
export const LINT_RULE_IDS = new Set([
  'email', 'gain-insights', 'aws-access-key', 'google-api-key', 'anthropic-key', 'private-key',
  'openai-key', 'github-token', 'slack-token', 'jwt', 'azure-key',
]);

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Read and validate hubs.config.json. Throws an Error listing every problem,
 * because a broken config makes the whole build meaningless.
 */
export function loadConfig(file) {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`cannot read config ${file}: ${e.message}`);
  }
  const errs = [];
  if (!isObj(raw)) throw new Error(`config ${file} must be a JSON object`);
  for (const k of Object.keys(raw)) if (!TOP_KEYS.has(k)) errs.push(`unknown top-level key "${k}"`);
  if (raw.version !== 1) errs.push('"version" must be 1');

  if (!Array.isArray(raw.include) || raw.include.length === 0) errs.push('"include" must be a non-empty array of globs');
  else for (const g of raw.include) { const m = validateGlob(g); if (m) errs.push(`include: ${m}`); }

  const legacy = raw.legacy ?? {};
  if (!isObj(legacy)) errs.push('"legacy" must be an object');
  else for (const [src, v] of Object.entries(legacy)) {
    if (!isObj(v)) { errs.push(`legacy["${src}"] must be an object`); continue; }
    if (!ID_RE.test(v.id ?? '')) errs.push(`legacy["${src}"].id must match ${ID_RE}`);
    if (!Array.isArray(v.keys) || v.keys.length === 0 || !v.keys.every((k) => typeof k === 'string' && STORAGE_KEY_RE.test(k))) {
      errs.push(`legacy["${src}"].keys must be a non-empty array of keys matching ${STORAGE_KEY_RE}`);
    }
    for (const k of Object.keys(v)) if (k !== 'id' && k !== 'keys') errs.push(`legacy["${src}"] has unknown key "${k}"`);
  }

  const reserved = raw.reservedSlugs ?? [];
  if (!Array.isArray(reserved) || !reserved.every((s) => typeof s === 'string')) errs.push('"reservedSlugs" must be an array of strings');

  const labels = raw.labels ?? {};
  if (!isObj(labels)) errs.push('"labels" must be an object');
  for (const part of ['domains', 'subjects']) {
    const m = labels[part] ?? {};
    if (!isObj(m) || !Object.values(m).every((v) => typeof v === 'string' && v.trim())) errs.push(`labels.${part} must map names to non-empty strings`);
  }

  const overrides = raw.overrides ?? {};
  if (!isObj(overrides)) errs.push('"overrides" must be an object');
  else for (const [src, v] of Object.entries(overrides)) {
    if (!isObj(v)) { errs.push(`overrides["${src}"] must be an object`); continue; }
    for (const k of Object.keys(v)) if (!OVERRIDE_KEYS.has(k)) errs.push(`overrides["${src}"] has unknown key "${k}"`);
    if ('level' in v && !(v.level === null || [1, 2, 3, 4].includes(v.level))) errs.push(`overrides["${src}"].level must be 1-4 or null`);
    if ('kind' in v && !['level', 'cert'].includes(v.kind)) errs.push(`overrides["${src}"].kind must be "level" or "cert"`);
    for (const k of ['slug', 'id', 'title', 'code', 'cert', 'blurb', 'accent']) {
      if (k in v && v[k] !== null && typeof v[k] !== 'string') errs.push(`overrides["${src}"].${k} must be a string or null`);
    }
  }

  const lintAllow = raw.lintAllow ?? [];
  if (!Array.isArray(lintAllow)) errs.push('"lintAllow" must be an array');
  else lintAllow.forEach((a, i) => {
    if (!isObj(a)) { errs.push(`lintAllow[${i}] must be an object`); return; }
    if (typeof a.source !== 'string' || !a.source) errs.push(`lintAllow[${i}].source must be a hub path (or "*")`);
    if (!LINT_RULE_IDS.has(a.rule)) errs.push(`lintAllow[${i}].rule must be one of ${[...LINT_RULE_IDS].join(', ')}`);
    const hasMatch = typeof a.match === 'string' && a.match.length > 0;
    const hasHash = typeof a.matchSha256 === 'string' && /^[0-9a-f]{64}$/.test(a.matchSha256);
    if (!hasMatch && !hasHash) errs.push(`lintAllow[${i}] needs "match" (exact text) or "matchSha256" (hex sha256 of the text)`);
    if (typeof a.reason !== 'string' || !a.reason.trim()) errs.push(`lintAllow[${i}].reason is required`);
  });

  if (errs.length) throw new Error(`invalid config ${file}:\n  - ${errs.join('\n  - ')}`);
  return {
    include: [...raw.include],
    legacy,
    reservedSlugs: new Set(reserved.map((s) => s.toLowerCase())),
    domainLabels: labels.domains ?? {},
    subjectLabels: labels.subjects ?? {},
    overrides,
    lintAllow,
  };
}
