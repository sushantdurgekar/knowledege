#!/usr/bin/env node
// Builds the bridge into ../server/public/_sh/ (contract §1, §6):
//   bridge.js (+ .br, .gz)  src/index.ts → one classic IIFE, ES2019, minified
//   fflate.js (+ .br, .gz)  fflate's gzipSync as window.__shFflate = {gzipSync}, with its MIT notice
// Only these six files are written; nothing else in public/ is touched. Fails (exit 1) on a
// build error or when bridge.js.gz is over the 14 KB budget.
import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, constants as zlib, gzipSync } from "node:zlib";
import { OUT_DIR, checkSizes } from "./size.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(await readFile(path.join(here, "package.json"), "utf8"));

const common = {
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2019",
  minify: true,
  charset: "ascii", // escape non-ASCII so the files decode the same under any charset
  sourcemap: false,
  write: false,
  logLevel: "warning",
};

async function bundle(options) {
  const result = await build({ ...common, ...options });
  return result.outputFiles[0].text;
}

async function fflateBanner() {
  const dir = path.join(here, "node_modules", "fflate");
  const { version } = JSON.parse(await readFile(path.join(dir, "package.json"), "utf8"));
  const license = (await readFile(path.join(dir, "LICENSE"), "utf8")).trim().replace(/\*\//g, "* /");
  return `/*! fflate v${version} (gzipSync only) | https://github.com/101arrowz/fflate\n${license}\n*/`;
}

/** Write `name`, `name.br` (brotli q11) and `name.gz` (gzip -9). */
async function emit(name, code) {
  const buf = Buffer.from(code, "utf8");
  const br = brotliCompressSync(buf, {
    params: {
      [zlib.BROTLI_PARAM_QUALITY]: 11,
      [zlib.BROTLI_PARAM_MODE]: zlib.BROTLI_MODE_TEXT,
      [zlib.BROTLI_PARAM_SIZE_HINT]: buf.length,
    },
  });
  const gz = gzipSync(buf, { level: 9 });
  const file = path.join(OUT_DIR, name);
  await Promise.all([writeFile(file, buf), writeFile(`${file}.br`, br), writeFile(`${file}.gz`, gz)]);
}

try {
  const [bridge, fflate] = await Promise.all([
    bundle({
      entryPoints: [path.join(here, "src/index.ts")],
      legalComments: "none",
      banner: { js: `/*! Study Hubs bridge v${pkg.version} */` },
      define: { __SH_VERSION__: JSON.stringify(pkg.version), __SH_AUTOSTART__: "true" },
    }),
    bundle({
      entryPoints: [path.join(here, "src/vendor/fflate.ts")],
      legalComments: "eof",
      banner: { js: await fflateBanner() },
    }),
  ]);
  await mkdir(OUT_DIR, { recursive: true });
  await Promise.all([emit("bridge.js", bridge), emit("fflate.js", fflate)]);
  console.log(`build: wrote bridge.js and fflate.js (+ .br/.gz) to ${path.relative(process.cwd(), OUT_DIR) || "."}`);
} catch (err) {
  console.error("build: failed", err && err.message ? err.message : err);
  process.exit(1);
}

if (!(await checkSizes())) process.exit(1);
