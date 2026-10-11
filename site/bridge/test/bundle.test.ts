/**
 * Smoke test of the BUILT bundle (../server/public/_sh/bridge.js) in a fresh jsdom page laid
 * out like a real hub: bridge injected before </head>, the engine's inline script at the end
 * of <body>. Skipped until `npm run build` has produced the file.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

// Plain paths: under the jsdom environment the global URL is jsdom's, which node:fs rejects.
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../server/public/_sh");
const out = (name: string): string => path.join(OUT, name);
const bridgeFile = out("bridge.js");
const built = existsSync(bridgeFile);

type ProbeWindow = Window &
  typeof globalThis & {
  __probe: Record<string, unknown>;
  __requests: string[];
  __shFflate?: { gzipSync(d: Uint8Array): Uint8Array };
};

/** A hub-shaped page; `bridgeTag` is what the collector injects (inline here, same attributes). */
function hubPage(bridge: string, attrs: string): string {
  return (
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    `<script ${attrs}>${bridge}</script></head><body><div id="app"></div>` +
    "<script>" +
    "(async function(){var p=window.__probe={};" +
    'p.claude=typeof (window.claude&&window.claude.use);p.readyState=document.readyState;' +
    'var r=await Promise.all([window.claude.use("db"),window.claude.use("user")]);p.db=r[0];p.user=r[1];' +
    'var AI=await window.claude.use("sample");document.body.classList.toggle("has-ai",!!AI);' +
    'try{await AI("x",{})}catch(e){p.code=e.code;p.text=e.text}' +
    'try{await window.claude.use("nope")}catch(e){p.unknown=e.code}' +
    'localStorage.setItem("studyhub.ai103.v2",JSON.stringify({S:{},U:{main:Date.now(),mocks:0,cards:0}}));' +
    "p.done=true})();" +
    "</script></body></html>"
  );
}

describe.skipIf(!built)("built bridge.js", () => {
  it("boots from document.currentScript, answers the hub and stays offline", async () => {
    const bridge = readFileSync(bridgeFile, "utf8");
    const dom = new JSDOM(hubPage(bridge, 'data-hub-id="ai103" data-slug="ai-103" data-engine="v2"'), {
      url: "https://study-hubs.test/h/ai-103",
      runScripts: "dangerously",
      beforeParse(window: Window) {
        const w = window as ProbeWindow;
        w.__requests = [];
        const record = (what: string) => () => {
          w.__requests.push(what);
        };
        Object.assign(w, { fetch: record("fetch") });
        w.XMLHttpRequest.prototype.open = record("xhr");
        Object.defineProperty(w.navigator, "sendBeacon", { value: record("beacon") });
      },
    });
    const w = dom.window as unknown as ProbeWindow;
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(w.__probe).toMatchObject({
      claude: "function",
      readyState: "loading", // use() is called while the page is still parsing, as in real hubs
      db: null,
      user: null,
      code: "cancelled",
      text: expect.stringContaining("(https://study-hubs.test/h/ai-103/download)"),
      unknown: "not_declared",
      done: true,
    });
    expect(w.document.body.classList.contains("has-ai")).toBe(true);
    expect(w.document.querySelector("studyhubs-chrome")).not.toBeNull();
    expect(w.document.querySelector("studyhubs-ai-dialog")).not.toBeNull();
    const stats = (w as unknown as { __studyhubsBridge: { stats(): Record<string, unknown> } }).__studyhubsBridge.stats();
    expect(stats).toMatchObject({ version: "0.1.0", hubId: "ai103", chrome: { mounted: true, notices: ["nudge"] } });
    expect(w.__requests).toEqual([]);
    dom.window.close();
  });

  it("ships precompressed copies that match the source", () => {
    const raw = readFileSync(bridgeFile);
    expect(gunzipSync(readFileSync(out("bridge.js.gz"))).equals(raw)).toBe(true);
    expect(existsSync(out("bridge.js.br"))).toBe(true);
    expect(raw.toString("utf8").startsWith("/*! Study Hubs bridge v")).toBe(true);
    expect(/[^\x00-\x7f]/.test(raw.toString("latin1"))).toBe(false); // ASCII-only output
  });

  it("fflate.js exposes window.__shFflate.gzipSync and carries the MIT notice", () => {
    const code = readFileSync(out("fflate.js"), "utf8");
    expect(code).toContain("MIT License");
    expect(code).toContain("Permission is hereby granted");
    const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", { runScripts: "dangerously" });
    const script = dom.window.document.createElement("script");
    script.textContent = code;
    dom.window.document.head.appendChild(script);
    const w = dom.window as unknown as ProbeWindow;
    expect(typeof w.__shFflate?.gzipSync).toBe("function");
    const input = new TextEncoder().encode('{"hubs":{"ai103":{"main":{"upd":1}}}}'.repeat(50));
    const gz = w.__shFflate!.gzipSync(input);
    expect(gunzipSync(Buffer.from(gz)).equals(Buffer.from(input))).toBe(true);
    dom.window.close();
  });
});
