#!/usr/bin/env node
// Size report and budget check for the built bridge (contract §6: bridge.js ≤ 14 KB gzipped).
// `npm run size` checks the files already in ../server/public/_sh/; build.mjs calls checkSizes() too.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const OUT_DIR = path.resolve(here, "../server/public/_sh");
/** Gzipped budget for bridge.js, in bytes (14 KiB). */
export const BRIDGE_GZ_BUDGET = 14 * 1024;

async function sizeOf(file) {
  try {
    return (await readFile(file)).length;
  } catch {
    return null;
  }
}

/** Print raw / gz / br sizes; returns false (after printing why) when a file is missing or over budget. */
export async function checkSizes(outDir = OUT_DIR) {
  let ok = true;
  const rows = [];
  for (const name of ["bridge.js", "fflate.js"]) {
    const base = path.join(outDir, name);
    const [raw, gz, br] = await Promise.all([sizeOf(base), sizeOf(`${base}.gz`), sizeOf(`${base}.br`)]);
    if (raw == null || gz == null || br == null) {
      console.error(`size: ${name} (+ .gz/.br) not found in ${outDir}; run \`npm run build\` first`);
      ok = false;
      continue;
    }
    rows.push(`${name.padEnd(10)} ${String(raw).padStart(7)} B raw  ${String(gz).padStart(6)} B gz  ${String(br).padStart(6)} B br`);
    if (name === "bridge.js" && gz > BRIDGE_GZ_BUDGET) {
      console.error(`size: bridge.js.gz is ${gz} B, over the ${BRIDGE_GZ_BUDGET} B (14 KB) budget`);
      ok = false;
    }
  }
  for (const row of rows) console.log(row);
  if (ok) console.log(`size: bridge.js.gz within the ${BRIDGE_GZ_BUDGET} B budget`);
  return ok;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  if (!(await checkSizes())) process.exit(1);
}
