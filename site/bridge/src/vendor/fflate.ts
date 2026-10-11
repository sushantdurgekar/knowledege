/**
 * Entry for /_sh/fflate.js: the synchronous gzip M1's unload path needs (CompressionStream is
 * async and cannot be awaited inside pagehide). Built separately by build.mjs, with fflate's
 * MIT notice, and loaded lazily only when a pending sync body grows large.
 */
import { gzipSync } from "fflate";

window.__shFflate = Object.freeze({ gzipSync });
