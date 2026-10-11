/** Build-time constants, replaced by esbuild (build.mjs) and defined by vitest (vitest.config.mjs). */
declare const __SH_VERSION__: string;
/** true in the shipped IIFE (boot on load); false under test, where startBridge() is called by hand. */
declare const __SH_AUTOSTART__: boolean;

interface Window {
  /** The capability shim the hubs look for (`window.claude.use(name)`). */
  claude?: import("./types").ClaudeShim;
  /** Debug / integration surface of the bridge (contract §6). */
  __studyhubsBridge?: import("./types").BridgeApi;
  /** Lazy gzip helper published by /_sh/fflate.js (used by M1's unload path). */
  __shFflate?: { readonly gzipSync: typeof import("fflate").gzipSync };
  /** Set by modern hub engines before they call use(); only read, never written, by the bridge. */
  HUB?: { id?: unknown };
}
