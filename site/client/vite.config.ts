/// <reference types="vitest/config" />
// Vite config for the Study Hubs React shell.
//
// The build writes straight into the FastAPI server's public dir (build-contracts.md §1-2).
// That dir also holds the bridge output in `_sh/`, so it must never be emptied wholesale:
// `emptyOutDir` stays false and `cleanShellOutput` removes only what this build owns.
// `precompress` then writes .br/.gz siblings, which the server's static handler picks up
// automatically (br > gzip > identity).
import { readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { brotliCompress, constants as zlib, gzip } from 'node:zlib';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

// FastAPI backend for the dev-server proxy; override with STUDY_HUBS_BACKEND=http://host:port.
const BACKEND = process.env.STUDY_HUBS_BACKEND ?? 'http://127.0.0.1:10000';
const OUT_DIR = '../server/public';
const HERE = path.dirname(fileURLToPath(import.meta.url));
// The bridge's pure storage helpers, shared verbatim with the shell (build-contracts.md §13):
// key names, payload builders, synced stamps, owner tag, wipe. Never copy them into src/.
const BRIDGE_SHARED = path.resolve(HERE, '../bridge/src/local-progress.ts');

/** Firebase (app + auth and their helpers) goes into one lazy chunk, `assets/firebase-<hash>.js`. */
function firebaseChunk(id: string): string | undefined {
  return /[\\/]node_modules[\\/](?:firebase|@firebase|idb|tslib)[\\/]/.test(id) ? 'firebase' : undefined;
}

/** Before each build, delete the previous shell build (index.html, assets/) but keep _sh/. */
function cleanShellOutput(): Plugin {
  let outDir = '';
  let assetsDir = 'assets';
  return {
    name: 'study-hubs:clean-shell-output',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
      assetsDir = config.build.assetsDir;
    },
    async buildStart() {
      const owned = [assetsDir, 'index.html', 'index.html.br', 'index.html.gz'];
      await Promise.all(owned.map((name) => rm(path.join(outDir, name), { recursive: true, force: true })));
    },
  };
}

const gzipAsync = promisify(gzip);
const brotliAsync = promisify(brotliCompress);
const COMPRESSIBLE = /\.(?:html|js|mjs|css|svg|txt|json|map)$/;
const MIN_BYTES = 1024; // smaller files are not worth a sibling

/** After the bundle is written, add .br and .gz next to every compressible file this build produced. */
function precompress(): Plugin {
  let outDir = '';
  let publicDir = '';
  let assetsDir = 'assets';
  return {
    name: 'study-hubs:precompress',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
      publicDir = config.publicDir;
      assetsDir = config.build.assetsDir;
    },
    async closeBundle() {
      // Only touch files this build owns: index.html, assets/**, and copies of client/public/*.
      const publicFiles = publicDir ? await readdir(publicDir).catch(() => [] as string[]) : [];
      const assetFiles = await readdir(path.join(outDir, assetsDir), { recursive: true }).catch(() => [] as string[]);
      const targets = [
        'index.html',
        ...publicFiles,
        ...assetFiles.map((name) => path.join(assetsDir, name)),
      ].filter((name) => COMPRESSIBLE.test(name));

      await Promise.all(
        targets.map(async (name) => {
          const file = path.join(outDir, name);
          const info = await stat(file).catch(() => null);
          if (!info?.isFile()) return;
          if (info.size < MIN_BYTES) {
            // Never leave a stale sibling from an older, larger version of the file.
            await Promise.all([rm(`${file}.br`, { force: true }), rm(`${file}.gz`, { force: true })]);
            return;
          }
          const body = await readFile(file);
          const [br, gz] = await Promise.all([
            brotliAsync(body, {
              params: {
                [zlib.BROTLI_PARAM_QUALITY]: zlib.BROTLI_MAX_QUALITY,
                [zlib.BROTLI_PARAM_SIZE_HINT]: body.length,
              },
            }),
            gzipAsync(body, { level: 9 }),
          ]);
          await Promise.all([writeFile(`${file}.br`, br), writeFile(`${file}.gz`, gz)]);
        }),
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), cleanShellOutput(), precompress()],
  resolve: {
    alias: { '@bridge-shared': BRIDGE_SHARED },
  },
  build: {
    outDir: OUT_DIR,
    emptyOutDir: false, // public/_sh (bridge) lives here too
    rollupOptions: {
      output: { manualChunks: firebaseChunk },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    // The dev server may serve the client and the one shared bridge module, nothing else above it.
    fs: { allow: [HERE, BRIDGE_SHARED] },
    proxy: {
      '/api': BACKEND,
      '^/h(?:/|$)': BACKEND, // hub pages and downloads (regex so /help-like paths stay local)
      '/_sh': BACKEND,
      '/catalog.json': BACKEND,
    },
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.{ts,tsx}'],
    restoreMocks: true,
    unstubGlobals: true,
  },
});
