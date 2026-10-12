#!/usr/bin/env node
// collect-hubs.mjs: build the hub catalog and the files the server serves.
//
//   node site/scripts/collect-hubs.mjs --src <repoRoot> --config <hubs.config.json> --out <dir> [--strict]
//
// Pipeline (see site/docs/build-contracts.md §1, §3, §4 and architecture-spec.md §4.3):
//   discover -> inspect -> metadata -> engine -> derive -> validate -> inject -> CSP -> outputs
//
// Hub files are only ever read. The served variant is the original bytes with one
// span inserted at a single offset; that is asserted byte-for-byte before writing.
// A hub that fails validation is left out and listed in build-report.json;
// --strict makes the process exit 1 when anything failed.
//
// Node 22, standard library only.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import vm from 'node:vm';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  ID_RE, SLUG_RE, STORAGE_KEY_RE, expandGlobs, loadConfig, rejectedSegment,
} from './lib/hub-paths.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const CATALOG_VERSION = 1;
const MAX_HUB_BYTES = 8 * 1024 * 1024;
const VM_TIMEOUT_MS = 3000;
const LEVEL_LABELS = { 1: 'Foundation', 2: 'Proficient', 3: 'Specialist', 4: 'Expert' };

/** Strings that must all be present for the modern (v2) engine: architecture-spec §4.3. */
export const V2_PROBES = Object.freeze([
  'window.HUB',
  'window.claude.use("db")',
  'window.claude.use("user")',
  '.doc(SYNC.base + "/" + part)',
  'snap.exists',
  '"studyhub." + H.id + ".v2"',
]);

/** Publish lint: secrets and private details that must never reach a public page. */
export const LINT_RULES = Object.freeze([
  { rule: 'email', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, secret: false },
  // Superset of the spec's (?i)gain ?insights: also catches gain-insights / gain_insights.
  { rule: 'gain-insights', re: /gain[\s_-]?insights/gi, secret: false },
  { rule: 'aws-access-key', re: /AKIA[0-9A-Z]{16}/g, secret: true },
  { rule: 'google-api-key', re: /AIza[0-9A-Za-z_-]{35}/g, secret: true },
  { rule: 'anthropic-key', re: /sk-ant-[A-Za-z0-9_-]*/g, secret: true },
  { rule: 'private-key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g, secret: false },
  // Beyond the spec's six: common token formats a hub could pick up from course or work
  // material. \b keeps prose such as "risk-assessment-..." or "design=" from matching.
  { rule: 'openai-key', re: /\bsk-(?!ant-)(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}/g, secret: true },
  { rule: 'github-token', re: /\bgh[pousr]_[A-Za-z0-9]{36,}|\bgithub_pat_[A-Za-z0-9_]{20,}/g, secret: true },
  { rule: 'slack-token', re: /\bxox[abposr]-[A-Za-z0-9-]{10,}/g, secret: true },
  { rule: 'jwt', re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, secret: true },
  {
    rule: 'azure-key',
    re: /(?:\bAccountKey|\bSharedAccessKey|\bSharedAccessSignature|\bsig)=[A-Za-z0-9%+/=]{20,}/g,
    secret: true,
  },
]);
const MAX_FINDINGS_PER_HUB = 50;

const CSP_TAIL =
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; " +
  "img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; " +
  "frame-ancestors 'none'; object-src 'none'";

const brotli = promisify(zlib.brotliCompress);
const gzip = promisify(zlib.gzip);

// ───────────────────────────── helpers ─────────────────────────────

export const sha256Hex = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/** Inline scripts, using the regex the CSP check was validated with (scripts with src= skipped). */
const hasSrc = (attrs) => /(?:^|\s)src\s*=/i.test(attrs);

export function extractInlineScripts(html) {
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  const out = [];
  for (const m of html.matchAll(re)) {
    if (hasSrc(m[1])) continue;
    out.push({ attrs: m[1], code: m[2], index: m.index });
  }
  return out;
}

const JS_TYPES = new Set([
  '', 'module', 'text/javascript', 'application/javascript', 'application/x-javascript',
  'text/ecmascript', 'application/ecmascript', 'text/jscript', 'text/x-javascript',
]);

/** True when the browser would execute the script (no type, or a JavaScript MIME type). */
export function isJsScript(attrs) {
  const m = /(?:^|\s)type\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(attrs);
  if (!m) return true;
  const t = (m[1] ?? m[2] ?? m[3] ?? '').trim().toLowerCase().split(';')[0].trim();
  return JS_TYPES.has(t);
}

/**
 * CSP source expression for an inline script. The browser hashes the element's
 * text after HTML input preprocessing, which turns CRLF and lone CR into LF.
 */
export function cspHash(code) {
  const normalized = code.replace(/\r\n?/g, '\n');
  return `'sha256-${crypto.createHash('sha256').update(normalized, 'utf8').digest('base64')}'`;
}

export function buildCsp(hashes) {
  const uniq = [...new Set(hashes)];
  return `default-src 'none'; script-src 'self'${uniq.map((h) => ' ' + h).join('')}; ${CSP_TAIL}`;
}

// Elements whose content the HTML tokenizer reads as text, so tags inside them are not tags.
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript']);
const TAG_RE = /<(\/?)([A-Za-z][^\t\n\f\r />]*)/y;
const isWs = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f';

/** Index of the '>' that closes a tag starting before `from`, honouring quoted attribute values. */
function findTagEnd(s, from) {
  let quote = null;
  for (let k = from; k < s.length; k++) {
    const c = s[k];
    if (quote) {
      if (c === quote) quote = null;
      continue;
    }
    if (c === '>') return k;
    if (c === '"' || c === "'") {
      let p = k - 1;
      while (p >= from && isWs(s[p])) p--;
      if (s[p] === '=') quote = c;
    }
  }
  return -1;
}

/** Start of the end tag of a raw-text element and the index just past it, or null when it never closes. */
function findRawTextEnd(s, lower, from, name) {
  const needle = '</' + name;
  let k = from;
  for (;;) {
    k = lower.indexOf(needle, k);
    if (k < 0) return null;
    const after = s[k + needle.length];
    if (after === undefined || after === '>' || after === '/' || isWs(after)) {
      const end = findTagEnd(s, k + needle.length);
      return end < 0 ? null : { closeStart: k, next: end + 1 };
    }
    k += needle.length;
  }
}

/**
 * Tokenise just enough HTML to know what a browser would treat as markup:
 * comments and raw-text elements (script, style, title, textarea, …) are skipped as
 * units, so `</head>` or `<script` text inside a JS string or a comment is never
 * mistaken for a tag. Works on bytes (latin1 view) so every offset is a byte offset.
 * Returns {headEnd, firstScript, scripts, styles}: offsets of the first real `</head>` and
 * `<script` (or -1), every real <script> element ({start, attrs, code}, code as UTF-8) and
 * the text of every real <style> element (UTF-8), in document order.
 */
export function scanHtml(buf) {
  const s = buf.toString('latin1');
  const lower = s.toLowerCase(); // 1:1 for latin1, so indexes stay valid
  const out = { headEnd: -1, firstScript: -1, scripts: [], styles: [] };
  let i = 0;
  for (;;) {
    const lt = s.indexOf('<', i);
    if (lt < 0) break;
    if (s.startsWith('<!--', lt)) {
      // "<!-->" and "<!--->" are complete (empty) comments in HTML.
      const end = s.startsWith('<!-->', lt) ? lt + 2 : s.startsWith('<!--->', lt) ? lt + 3 : s.indexOf('-->', lt + 4);
      if (end < 0) break;
      i = end + 3;
      continue;
    }
    if (s[lt + 1] === '!' || s[lt + 1] === '?') { // doctype / bogus comment
      const end = s.indexOf('>', lt + 2);
      if (end < 0) break;
      i = end + 1;
      continue;
    }
    TAG_RE.lastIndex = lt;
    const m = TAG_RE.exec(s);
    if (!m) {
      i = lt + 1;
      continue;
    }
    const closing = m[1] === '/';
    const name = m[2].toLowerCase();
    const nameEnd = TAG_RE.lastIndex;
    const tagEnd = findTagEnd(s, nameEnd);
    if (tagEnd < 0) break;
    if (closing) {
      if (name === 'head' && out.headEnd < 0) out.headEnd = lt;
      i = tagEnd + 1;
      continue;
    }
    if (RAW_TEXT.has(name)) {
      const close = findRawTextEnd(s, lower, tagEnd + 1, name);
      if (close === null) break;
      if (name === 'script') {
        if (out.firstScript < 0) out.firstScript = lt;
        out.scripts.push({
          start: lt,
          attrs: buf.subarray(nameEnd, tagEnd).toString('utf8'),
          code: buf.subarray(tagEnd + 1, close.closeStart).toString('utf8'),
        });
      } else if (name === 'style') {
        out.styles.push(buf.subarray(tagEnd + 1, close.closeStart).toString('utf8'));
      }
      i = close.next;
      continue;
    }
    i = tagEnd + 1;
  }
  return out;
}

/**
 * Where to inject (build-contracts.md §4): before the first real `</head>`, else before
 * the first real `<script`, else nowhere ({at: -1}).
 */
export function findInjectionPoint(buf) {
  return injectionPointOf(scanHtml(buf));
}

function injectionPointOf({ headEnd, firstScript }) {
  if (headEnd >= 0) return { at: headEnd, anchor: 'head' };
  if (firstScript >= 0) return { at: firstScript, anchor: 'script' };
  return { at: -1, anchor: null };
}

const escAttr = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The exact span from build-contracts.md §4. */
export function injectionSpan({ id, slug, engine, legacyKeys = [] }) {
  if (engine === 'legacy') {
    return (
      `<script src="/_sh/bridge.js" data-hub-id="${escAttr(id)}" data-slug="${escAttr(slug)}" data-engine="legacy" ` +
      `data-legacy-keys="${escAttr(legacyKeys.join(','))}"></script><script src="/api/seed/${escAttr(id)}.js"></script>`
    );
  }
  return `<script src="/_sh/bridge.js" data-hub-id="${escAttr(id)}" data-slug="${escAttr(slug)}" data-engine="${escAttr(engine)}"></script>`;
}

/** Served bytes = original with `span` inserted at `at`; asserts the round trip. */
export function injectAt(original, at, span) {
  const spanBuf = Buffer.from(span, 'utf8');
  const served = Buffer.concat([original.subarray(0, at), spanBuf, original.subarray(at)]);
  const removed = Buffer.concat([served.subarray(0, at), served.subarray(at + spanBuf.length)]);
  if (!removed.equals(original) || !served.subarray(at, at + spanBuf.length).equals(spanBuf)) {
    throw new Error('injection invariant failed: served minus span != original');
  }
  return served;
}

const isEngineScript = (code) => code.includes('const H = window.HUB') || /^\s*\(function \(/.test(code);

const EXTRACT_SRC = `(function () {
  var H = globalThis.HUB;
  if (!H || typeof H !== "object") return "null";
  function s(v) { return typeof v === "string" ? v : null; }
  var hero = H.hero && typeof H.hero === "object" ? H.hero : {};
  return JSON.stringify({ id: s(H.id), title: s(H.title), code: s(H.code), cert: s(H.cert),
    heroTitle: s(hero.title), modules: Array.isArray(H.modules) ? H.modules.length : null });
})()`;

/**
 * Run the data scripts (everything before the engine script) in a fresh context
 * with `var window = globalThis`, then read window.HUB. Returns null when there is
 * no HUB object. Throws on script errors or when the 3 s budget runs out.
 *
 * Not a security sandbox (the input is the repo's own hub files), but hardened: the
 * context object has a null prototype, so no host-realm object is reachable from hub
 * code. With a plain `{}`, `this.constructor.constructor` would be the HOST's Function,
 * which ignores `codeGeneration` and hands out `process` (a test pins this down).
 */
export function extractHubMetadata(scripts, label) {
  const ctx = vm.createContext(Object.create(null), {
    name: `hub ${label}`,
    codeGeneration: { strings: false, wasm: false },
    microtaskMode: 'afterEvaluate',
  });
  const deadline = Date.now() + VM_TIMEOUT_MS;
  const budget = () => {
    const left = deadline - Date.now();
    if (left <= 0) throw new Error(`metadata scripts exceeded ${VM_TIMEOUT_MS} ms`);
    return left;
  };
  vm.runInContext('var window = globalThis;', ctx);
  let n = 0;
  for (const s of scripts) {
    if (!isJsScript(s.attrs)) continue;
    if (isEngineScript(s.code)) break;
    n++;
    vm.runInContext(s.code, ctx, { timeout: budget(), filename: `${label}#inline-script-${n}` });
  }
  return JSON.parse(vm.runInContext(EXTRACT_SRC, ctx, { timeout: budget() }));
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e) => {
    if (e[0] === '#') {
      const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : all;
    }
    return ENTITIES[e.toLowerCase()] ?? all;
  });
}
const clean = (s) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : null) || null;

export function readTitle(html) {
  const m = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html);
  return m ? clean(decodeEntities(m[1])) : null;
}

const ACCENT_DECL = /(?:^|[;{\s])--accent\s*:\s*([^;}]*)/g;
const accentValue = (v) => v.replace(/!\s*important\s*$/i, '').trim() || null;

/**
 * The hub's light-theme accent: the last `--accent` set by a top-level `:root { … }` rule,
 * which is what the cascade applies without a dark preference. Hubs restate the accent
 * later in the file (the DSA hubs end with a "subject accent" `:root` rule), so the first
 * declaration is not enough; `:root:not(…)`, `:root[data-theme…]` and anything inside
 * @media are dark-theme variants and are skipped. Falls back to the first `--accent`
 * declaration anywhere when no plain `:root` rule sets one.
 * @param {string[]} styles text of each <style> element, in document order (scanHtml().styles)
 */
export function readAccent(styles) {
  let fromRoot = null;
  let first = null;
  for (const raw of styles) {
    const css = raw.replace(/\/\*[\s\S]*?\*\//g, ' ');
    if (first === null) {
      const [m] = css.matchAll(ACCENT_DECL); // matchAll clones the regex: no shared lastIndex
      if (m) first = accentValue(m[1]);
    }
    for (const rule of topLevelRules(css)) {
      if (rule.prelude !== ':root') continue;
      for (const m of rule.body.matchAll(ACCENT_DECL)) fromRoot = accentValue(m[1]) ?? fromRoot;
    }
  }
  return fromRoot ?? first;
}

/** Top-level `prelude { body }` blocks of a stylesheet (comments already removed). */
function topLevelRules(css) {
  const rules = [];
  let depth = 0;
  let quote = null;
  let start = 0; // where the current prelude (depth 0) or body (depth 1) began
  let prelude = '';
  for (let k = 0; k < css.length; k++) {
    const c = css[k];
    if (quote) {
      if (c === '\\') k++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === '{') {
      if (depth === 0) {
        prelude = css.slice(start, k).trim();
        start = k + 1;
      }
      depth++;
    } else if (c === '}' && depth > 0) {
      depth--;
      if (depth === 0) {
        rules.push({ prelude, body: css.slice(start, k) });
        start = k + 1;
      }
    } else if (c === ';' && depth === 0) {
      start = k + 1; // a statement such as @import or @charset
    }
  }
  return rules;
}

/** Plain-text blurb: drop simple Markdown emphasis so cards don't show asterisks. */
function plainBlurb(s) {
  return clean(s?.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1').replace(/`([^`]+)`/g, '$1'));
}

/** Per-hub storage keys referenced by the engine, `.v2` (LKEY) first. */
export function storageKeysFor(engineText, id) {
  const suffixes = [];
  for (const m of engineText.matchAll(/"studyhub\." \+ H\.id \+ "\.([A-Za-z0-9_-]+)"/g)) {
    if (!suffixes.includes(m[1])) suffixes.push(m[1]);
  }
  suffixes.sort((a, b) => (a === 'v2' ? -1 : b === 'v2' ? 1 : 0));
  if (!suffixes.includes('v2')) suffixes.unshift('v2');
  return suffixes.map((x) => `studyhub.${id}.${x}`);
}

/** URL slug from the file name: lowercase, spaces to "-", trailing -hub / -study-hub removed. */
export function deriveSlug(relPath) {
  const stem = path.posix.basename(relPath).replace(/\.html?$/i, '');
  return stem
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-(?:study-)?hub$/, '');
}

const titleCase = (name) =>
  name.split('-').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

/** Run every lint rule over the text; returns findings with allow-list status. */
/** True for addresses on domains reserved for documentation and tests (RFC 2606, RFC 6761). */
export function isReservedEmailDomain(address) {
  const domain = address.slice(address.lastIndexOf('@') + 1).toLowerCase();
  return /(^|\.)example\.(com|org|net)$/.test(domain) || /\.(example|test|invalid|localhost)$/.test(domain);
}

export function lintText(text, source, lintAllow) {
  const lineStarts = [0];
  for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) lineStarts.push(i + 1);
  const lineOf = (idx) => {
    let lo = 0, hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= idx) lo = mid; else hi = mid - 1;
    }
    return lo + 1;
  };
  const findings = [];
  const usedAllow = new Set();
  for (const { rule, re, secret } of LINT_RULES) {
    for (const m of text.matchAll(re)) {
      const raw = m[0];
      // RFC 2606 / 6761 reserved names can never be real mailboxes (ana@example.com in a lesson).
      if (rule === 'email' && isReservedEmailDomain(raw)) continue;
      const digest = sha256Hex(Buffer.from(raw, 'utf8'));
      const allowIdx = lintAllow.findIndex((a) =>
        (a.source === source || a.source === '*') && a.rule === rule &&
        (a.match === raw || a.matchSha256 === digest));
      if (allowIdx >= 0) usedAllow.add(allowIdx);
      findings.push({
        rule,
        line: lineOf(m.index),
        match: secret ? `${raw.slice(0, 6)}… (${raw.length} chars, redacted)` : raw,
        matchSha256: digest,
        allowed: allowIdx >= 0,
        ...(allowIdx >= 0 ? { reason: lintAllow[allowIdx].reason } : {}),
      });
    }
  }
  return { findings, usedAllow };
}

// ───────────────────────────── pipeline ─────────────────────────────

/**
 * Inspect one hub file and derive its catalog entry. Never throws for problems
 * in the hub itself: they are returned in `errors` (skip) or `warnings`.
 */
export function inspectHub(srcRoot, rel, config) {
  const errors = [];
  const warnings = [];
  const report = { source: rel, status: 'skipped', errors, warnings };
  const abs = path.join(srcRoot, ...rel.split('/'));
  const original = fs.readFileSync(abs);
  if (original.length > MAX_HUB_BYTES) {
    errors.push(`file is ${original.length} bytes, over the ${MAX_HUB_BYTES}-byte limit`);
    return { report };
  }
  const html = original.toString('utf8');
  // Real script elements only (a <script> inside an HTML comment never runs).
  const scan = scanHtml(original);
  const scripts = scan.scripts.filter((s) => !hasSrc(s.attrs));
  const jsText = scripts.filter((s) => isJsScript(s.attrs)).map((s) => s.code).join('\n');
  const override = config.overrides[rel] ?? {};
  const legacyCfg = config.legacy[rel];

  // Engine classification.
  let engine;
  if (legacyCfg) engine = 'legacy';
  else if (V2_PROBES.every((p) => jsText.includes(p))) engine = 'v2';
  else {
    engine = 'static';
    warnings.push('engine not recognised: served as a static, local-only hub (no sync)');
  }

  // Metadata.
  let meta = null;
  if (engine !== 'legacy') {
    try {
      meta = extractHubMetadata(scripts, rel);
    } catch (e) {
      (engine === 'v2' ? errors : warnings).push(`metadata scripts failed: ${e.message}`);
    }
    if (engine === 'v2') {
      if (!meta) errors.push('window.HUB was not set by the data scripts');
      else {
        if (!meta.id) errors.push('window.HUB.id is missing');
        if (!meta.title) errors.push('window.HUB.title is missing');
        if (meta.modules === null) errors.push('window.HUB.modules is not an array');
      }
    }
  }

  // Overrides cannot change the id of an engine hub: the bridge checks window.HUB.id === data-hub-id.
  if ('id' in override && engine !== 'static') errors.push(`override "id" is only allowed for static hubs (engine is ${engine})`);

  const segs = rel.split('/');
  const [domain, subject] = segs[0] === 'technical' ? [segs[1], segs[2]] : [segs[0], segs[1]];
  const slug = override.slug ?? deriveSlug(rel);
  const lvl = /-l([1-4])-([a-z]+)/.exec(slug);
  let level = lvl ? Number(lvl[1]) : null;
  if (lvl && lvl[2] !== LEVEL_LABELS[level].toLowerCase()) {
    warnings.push(`file name says "l${level}-${lvl[2]}" but L${level} is "${LEVEL_LABELS[level]}"`);
  }
  if ('level' in override) level = override.level;
  const kind = override.kind ?? (level ? 'level' : domain === 'certifications' ? 'cert' : 'level');
  if (kind === 'level' && !level) warnings.push('level hub without -l<1-4>-<label> in its name: level is null');
  if (kind === 'cert' && level) warnings.push('cert hub with a level in its name');

  const id = engine === 'legacy' ? legacyCfg.id : engine === 'v2' ? meta?.id ?? null : override.id ?? meta?.id ?? slug;
  const domainLabel = config.domainLabels[domain] ?? titleCase(domain);
  const subjectLabel = config.subjectLabels[subject] ?? (domain === 'certifications' ? subject.toUpperCase() : titleCase(subject));
  const fallbackCode = level ? `${subject.toUpperCase()} · L${level}` : subject.toUpperCase();
  const title = override.title ?? clean(meta?.title) ?? readTitle(html) ?? path.posix.basename(rel).replace(/\.html?$/i, '');

  let accent = override.accent ?? readAccent(scan.styles);
  if (accent !== null && !/^#[0-9a-fA-F]{3,8}$/.test(accent)) {
    warnings.push(`--accent "${accent}" is not a hex colour; accent set to null`);
    accent = null;
  }

  let modules = null;
  if (engine === 'legacy') {
    modules = (jsText.match(/\bM\.push\(\s*\{/g) ?? []).length;
    if (modules === 0) warnings.push('legacy hub: no M.push({ module entries found');
  } else if (meta && typeof meta.modules === 'number') {
    modules = meta.modules;
  }

  const legacyKeys = engine === 'legacy' ? [...legacyCfg.keys] : [];
  const entry = {
    id,
    slug,
    title,
    code: override.code ?? clean(meta?.code) ?? fallbackCode,
    kind,
    level,
    levelLabel: level ? LEVEL_LABELS[level] : null,
    domain,
    domainLabel,
    subject,
    subjectLabel,
    cert: override.cert !== undefined ? override.cert : clean(meta?.cert),
    blurb: override.blurb !== undefined ? override.blurb : plainBlurb(meta?.heroTitle),
    modules,
    accent,
    engine,
    storageKeys: engine === 'v2' && id ? storageKeysFor(jsText, id) : [],
    legacyKeys,
    downloadName: path.posix.basename(rel),
    bytes: original.length,
    brBytes: null, // filled after compression
    sha256: sha256Hex(original),
  };
  Object.assign(report, { id, slug, engine });

  // Per-hub validation.
  if (!id || !ID_RE.test(id)) errors.push(`id ${JSON.stringify(id)} does not match ${ID_RE}`);
  if (!SLUG_RE.test(slug)) errors.push(`slug ${JSON.stringify(slug)} does not match ${SLUG_RE}`);
  if (config.reservedSlugs.has(slug)) errors.push(`slug "${slug}" is reserved`);
  for (const k of legacyKeys) if (!STORAGE_KEY_RE.test(k)) errors.push(`legacy key "${k}" is not allowed`);
  if (entry.blurb === null) warnings.push('no blurb (window.HUB.hero.title or an override)');

  const { findings, usedAllow } = lintText(html, rel, config.lintAllow);
  report.lint = findings.slice(0, MAX_FINDINGS_PER_HUB);
  if (findings.length > MAX_FINDINGS_PER_HUB) report.lintTruncated = findings.length;
  const blocking = findings.filter((f) => !f.allowed);
  if (blocking.length) {
    const sample = blocking.slice(0, 5).map((f) => `${f.rule} "${f.match}" (line ${f.line})`).join('; ');
    errors.push(`publish lint: ${blocking.length} finding(s): ${sample}`);
  }

  return { report, entry, original, html, scan, scripts, usedAllow };
}

/** Cross-hub validation: unique ids and slugs, and no id that is another hub's slug. */
function validateUnique(items) {
  const bySlug = new Map();
  const byId = new Map();
  for (const it of items) {
    const { slug, id } = it.entry;
    if (!bySlug.has(slug)) bySlug.set(slug, []);
    bySlug.get(slug).push(it);
    if (id) {
      if (!byId.has(id)) byId.set(id, []);
      byId.get(id).push(it);
    }
  }
  for (const [slug, list] of bySlug) {
    if (list.length > 1) {
      for (const it of list) it.report.errors.push(`slug "${slug}" is also used by ${list.filter((o) => o !== it).map((o) => o.report.source).join(', ')}`);
    }
  }
  for (const [id, list] of byId) {
    if (list.length > 1) {
      for (const it of list) it.report.errors.push(`id "${id}" is also used by ${list.filter((o) => o !== it).map((o) => o.report.source).join(', ')}`);
    }
    const owner = bySlug.get(id);
    if (owner) {
      for (const it of list) {
        const others = owner.filter((o) => o !== it);
        if (others.length) it.report.errors.push(`id "${id}" equals the slug of ${others.map((o) => o.report.source).join(', ')}`);
      }
    }
  }
}

/** Inject, verify, hash for CSP, compress. Mutates the entry/report; returns files to write. */
async function buildServed(it) {
  const { entry, report, original, scan } = it;
  const point = injectionPointOf(scan);
  let served = original;
  let span = null;
  if (point.at < 0) {
    if (entry.engine !== 'static') {
      report.warnings.push(`no </head> and no <script> to inject before: engine changed from ${entry.engine} to static`);
      entry.engine = 'static';
      entry.storageKeys = [];
      entry.legacyKeys = [];
      report.engine = 'static';
    }
    report.injected = null;
  } else {
    if (point.anchor === 'script') report.warnings.push('no </head>: bridge injected before the first <script');
    span = injectionSpan(entry);
    served = injectAt(original, point.at, span);
    report.injected = { anchor: point.anchor, offset: point.at, bytes: Buffer.byteLength(span) };
    const before = it.scripts.filter((x) => x.start < point.at).length;
    if (before) report.warnings.push(`${before} inline script(s) run before the bridge`);
  }

  const servedScripts = extractInlineScripts(served.toString('utf8'));
  const originalScripts = extractInlineScripts(it.html);
  const hashes = servedScripts.map((s) => cspHash(s.code));
  const origHashes = originalScripts.map((s) => cspHash(s.code));
  if (hashes.join(' ') !== origHashes.join(' ')) throw new Error('inline scripts differ between original and served file');
  // The regex list is a superset of what runs (it also sees scripts inside comments);
  // make sure nothing the browser will execute is missing from the policy.
  const missing = it.scripts.filter((x) => isJsScript(x.attrs) && !hashes.includes(cspHash(x.code)));
  if (missing.length) throw new Error(`CSP would block ${missing.length} inline script(s); the script regex and the HTML scan disagree`);

  const brOpts = (buf) => ({
    params: {
      [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
      [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
      [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buf.length,
    },
  });
  // Async zlib runs on the libuv thread pool, so the four compressions run in parallel.
  const [servedBr, servedGz, origBr, origGz] = await Promise.all([
    brotli(served, brOpts(served)),
    gzip(served, { level: 9 }),
    brotli(original, brOpts(original)),
    gzip(original, { level: 9 }),
  ]);
  entry.brBytes = origBr.length; // size of a compressed download/open, as in the contract example
  it.internal = {
    source: report.source,
    csp: buildCsp(hashes),
    servedSha256: sha256Hex(served),
    servedBytes: served.length,
  };
  report.inlineScripts = hashes.length;
  report.status = 'published';
  const dir = `hubs/${entry.slug}`;
  return [
    [`${dir}/index.html`, served], [`${dir}/index.html.br`, servedBr], [`${dir}/index.html.gz`, servedGz],
    [`${dir}/original.html`, original], [`${dir}/original.html.br`, origBr], [`${dir}/original.html.gz`, origGz],
  ];
}

const PUBLIC_FIELDS = [
  'id', 'slug', 'title', 'code', 'kind', 'level', 'levelLabel', 'domain', 'domainLabel', 'subject', 'subjectLabel',
  'cert', 'blurb', 'modules', 'accent', 'engine', 'storageKeys', 'legacyKeys', 'downloadName', 'bytes', 'brBytes', 'sha256',
];
const pick = (obj, keys) => Object.fromEntries(keys.map((k) => [k, obj[k] ?? null]));

function sortEntries(a, b) {
  const ka = [a.domain, a.subject, a.kind === 'level' ? 0 : 1, a.level ?? 9, a.slug];
  const kb = [b.domain, b.subject, b.kind === 'level' ? 0 : 1, b.level ?? 9, b.slug];
  for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] < kb[i] ? -1 : 1;
  return 0;
}

const MANAGED = ['hubs', 'catalog.json', 'catalog.json.br', 'catalog.json.gz', 'catalog.internal.json', 'build-report.json'];

/** Refuse to clean a directory that we did not create (no build-report.json next to hubs/). */
function assertSafeOut(out, src) {
  const rel = path.relative(out, src);
  const outside = rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel);
  if (!outside) {
    throw new Error(`--out ${out} must not be the source root or one of its parents`);
  }
  const hubsDir = path.join(out, 'hubs');
  if (fs.existsSync(hubsDir) && fs.readdirSync(hubsDir).length && !fs.existsSync(path.join(out, 'build-report.json'))) {
    throw new Error(`${hubsDir} exists but has no build-report.json beside it; refusing to replace a directory this script did not create`);
  }
}

/** Write into a staging directory, then swap the managed entries into place. */
function writeOutputs(out, files) {
  fs.mkdirSync(out, { recursive: true });
  for (const name of fs.readdirSync(out)) { // leftovers from an interrupted run
    if (name.startsWith('.staging-')) fs.rmSync(path.join(out, name), { recursive: true, force: true });
  }
  const staging = fs.mkdtempSync(path.join(out, '.staging-'));
  try {
    for (const [rel, data] of files) {
      const dest = path.join(staging, ...rel.split('/'));
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, data);
    }
    for (const name of MANAGED) fs.rmSync(path.join(out, name), { recursive: true, force: true });
    for (const name of fs.readdirSync(staging)) fs.renameSync(path.join(staging, name), path.join(out, name));
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

/**
 * Run the whole pipeline. Returns {ok, report, catalog, internal}.
 * Throws only for fatal problems (bad config, unsafe --out).
 */
export async function collect({ src, config: configPath, out, strict = false, now = new Date(), log = () => {} }) {
  const srcRoot = path.resolve(src);
  const outDir = path.resolve(out);
  const config = loadConfig(configPath);
  assertSafeOut(outDir, srcRoot);

  const globalErrors = [];
  const globalWarnings = [];
  const rejected = [];
  const reports = [];
  const items = [];
  const usedAllow = new Set();

  // 1. Discover.
  const hits = expandGlobs(srcRoot, config.include);
  for (const { rel, kind } of hits) {
    const bad = rejectedSegment(rel);
    if (bad) {
      rejected.push({ source: rel, reason: `path contains the rejected segment "${bad}"` });
      continue;
    }
    if (kind !== 'file') {
      reports.push({ source: rel, status: 'skipped', errors: [`not a regular file (${kind}); symlinks are never published`], warnings: [] });
      continue;
    }
    // 2–5. Inspect, metadata, engine, derive, per-hub validation.
    let it;
    try {
      it = inspectHub(srcRoot, rel, config);
    } catch (e) {
      it = { report: { source: rel, status: 'skipped', errors: [`cannot inspect: ${e.message}`], warnings: [] } };
    }
    reports.push(it.report);
    if (it.entry) items.push(it);
    if (it.usedAllow) for (const i of it.usedAllow) usedAllow.add(i);
  }
  if (hits.length === 0) globalErrors.push(`no hub files matched ${config.include.join(' or ')} under ${srcRoot}`);

  validateUnique(items);

  const discovered = new Set(hits.map((h) => h.rel));
  for (const key of Object.keys(config.legacy)) {
    if (!discovered.has(key)) globalErrors.push(`legacy entry "${key}" matches no discovered hub`);
  }
  for (const key of Object.keys(config.overrides)) {
    if (!discovered.has(key)) globalWarnings.push(`override "${key}" matches no discovered hub`);
  }
  config.lintAllow.forEach((a, i) => {
    if (!usedAllow.has(i)) globalWarnings.push(`lintAllow[${i}] (${a.rule} in ${a.source}) matched nothing; remove it`);
  });

  // 6–7. Inject, CSP, compress, collect outputs for the hubs that passed.
  const files = [];
  const published = [];
  const passing = items.filter((it) => it.report.errors.length === 0);
  const built = await Promise.all(passing.map(async (it) => {
    try {
      return { it, files: await buildServed(it) };
    } catch (e) {
      it.report.errors.push(e.message);
      return null;
    }
  }));
  for (const b of built) {
    if (!b) continue;
    files.push(...b.files);
    published.push(b.it);
  }
  for (const it of items) if (it.report.errors.length) it.report.status = 'skipped';

  published.sort((a, b) => sortEntries(a.entry, b.entry));
  const generatedAt = now.toISOString();
  const catalog = { version: CATALOG_VERSION, generatedAt, hubs: published.map((it) => pick(it.entry, PUBLIC_FIELDS)) };
  const internal = {
    version: CATALOG_VERSION,
    generatedAt,
    hubs: published.map((it) => ({ ...pick(it.entry, PUBLIC_FIELDS), ...it.internal })),
  };

  const skipped = reports.filter((r) => r.status !== 'published');
  const errorCount = globalErrors.length + skipped.length;
  const report = {
    version: CATALOG_VERSION,
    generatedAt,
    strict,
    ok: errorCount === 0,
    counts: { discovered: hits.length, published: published.length, skipped: skipped.length, rejected: rejected.length },
    errors: globalErrors,
    warnings: globalWarnings,
    rejected,
    hubs: reports.sort((a, b) => (a.source < b.source ? -1 : 1)),
  };

  const catalogBuf = Buffer.from(JSON.stringify(catalog));
  const [catBr, catGz] = await Promise.all([
    brotli(catalogBuf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT } }),
    gzip(catalogBuf, { level: 9 }),
  ]);
  files.push(
    ['catalog.json', catalogBuf], ['catalog.json.br', catBr], ['catalog.json.gz', catGz],
    ['catalog.internal.json', Buffer.from(JSON.stringify(internal, null, 2) + '\n')],
    ['build-report.json', Buffer.from(JSON.stringify(report, null, 2) + '\n')],
  );
  writeOutputs(outDir, files);

  log(summaryText(report, catalog));
  return { ok: report.ok, report, catalog, internal };
}

function summaryText(report, catalog) {
  const lines = [];
  const c = report.counts;
  lines.push(`collect-hubs: ${c.published} published, ${c.skipped} skipped, ${c.rejected} rejected (of ${c.discovered} discovered)`);
  for (const h of catalog.hubs) {
    lines.push(`  ${h.slug.padEnd(22)} ${h.engine.padEnd(7)} id=${h.id.padEnd(8)} modules=${String(h.modules).padEnd(4)} br=${h.brBytes}`);
  }
  for (const r of report.hubs) {
    for (const e of r.errors) lines.push(`  ERROR ${r.source}: ${e}`);
    for (const w of r.warnings) lines.push(`  warn  ${r.source}: ${w}`);
  }
  for (const r of report.rejected) lines.push(`  warn  ${r.source}: rejected, ${r.reason}`);
  for (const e of report.errors) lines.push(`  ERROR ${e}`);
  for (const w of report.warnings) lines.push(`  warn  ${w}`);
  return lines.join('\n');
}

// ───────────────────────────── CLI ─────────────────────────────

const USAGE = 'usage: collect-hubs.mjs --src <repoRoot> --config <hubs.config.json> --out <dir> [--strict]';

export function parseArgs(argv) {
  const opts = { src: '.', config: path.join(SCRIPT_DIR, '..', 'hubs.config.json'), out: path.join(SCRIPT_DIR, '..', 'build'), strict: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) throw new Error(`${a} needs a value\n${USAGE}`);
      return v;
    };
    if (a === '--src') opts.src = val();
    else if (a === '--config') opts.config = val();
    else if (a === '--out') opts.out = val();
    else if (a === '--strict') opts.strict = true;
    else if (a === '-h' || a === '--help') opts.help = true;
    else throw new Error(`unknown argument "${a}"\n${USAGE}`);
  }
  return opts;
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    return 2;
  }
  if (opts.help) {
    console.log(USAGE);
    return 0;
  }
  const epoch = process.env.SOURCE_DATE_EPOCH;
  const now = epoch && /^\d+$/.test(epoch) ? new Date(Number(epoch) * 1000) : new Date();
  try {
    const { ok } = await collect({ ...opts, now, log: (s) => console.log(s) });
    if (!ok && opts.strict) {
      console.error('collect-hubs: --strict: failing because of the errors above (see build-report.json)');
      return 1;
    }
    return 0;
  } catch (e) {
    console.error(`collect-hubs: ${e.message}`);
    return 2;
  }
}

const invokedPath = process.argv[1] ? fs.realpathSync(path.resolve(process.argv[1])) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().then((code) => { process.exitCode = code; });
}
