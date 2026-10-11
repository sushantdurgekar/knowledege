import { describe, expect, it } from "vitest";
import { readConfig, readCookie } from "../src/config";

const loc = { origin: "https://study-hubs.test", pathname: "/h/ai-103" };
const script = (data: Record<string, string>) => ({ dataset: data as DOMStringMap });
const HUB = { hubId: "ai103", slug: "ai-103" };

describe("readConfig", () => {
  it("reads the injected data-* attributes and derives every path", () => {
    const cfg = readConfig(script({ hubId: "ai103", slug: "ai-103", engine: "v2" }), "", loc);
    expect(cfg).toEqual({
      hubId: "ai103",
      slug: "ai-103",
      engine: "v2",
      legacyKeys: [],
      lkey: "studyhub.ai103.v2",
      origin: "https://study-hubs.test",
      catalogPath: "/",
      hubPath: "/h/ai-103",
      downloadPath: "/h/ai-103/download",
      downloadUrl: "https://study-hubs.test/h/ai-103/download",
      signInPath: "/signin?next=/h/ai-103",
      hint: null,
    });
  });

  it("parses legacy hubs and their key list (trimmed, de-duplicated)", () => {
    const cfg = readConfig(
      script({ hubId: "ai901", slug: "ai-901", engine: "legacy", legacyKeys: " ai901hub.v1, ,ai901hub.v1,x.y " }),
      "",
      { origin: "https://study-hubs.test", pathname: "/h/ai-901" },
    );
    expect(cfg.engine).toBe("legacy");
    expect(cfg.legacyKeys).toEqual(["ai901hub.v1", "x.y"]);
    expect(cfg.downloadPath).toBe("/h/ai-901/download");
  });

  it("defaults the engine to v2 and accepts static", () => {
    expect(readConfig(script({ hubId: "a", slug: "a" }), "", loc).engine).toBe("v2");
    expect(readConfig(script({ hubId: "a", slug: "a", engine: "weird" }), "", loc).engine).toBe("v2");
    expect(readConfig(script({ hubId: "a", slug: "a", engine: "static" }), "", loc).engine).toBe("static");
  });

  it("falls back to the /h/<slug> path when the attributes are missing", () => {
    const cfg = readConfig(null, "", { origin: "https://x.test", pathname: "/h/dsa-l1-foundation" });
    expect(cfg.slug).toBe("dsa-l1-foundation");
    expect(cfg.hubId).toBe("dsa-l1-foundation");
    expect(readConfig(script({}), "", { origin: "https://x.test", pathname: "/elsewhere" }).slug).toBe("hub");
  });

  it("rejects ids and slugs that are not short ASCII tokens", () => {
    const cfg = readConfig(script({ hubId: '"><img src=x>', slug: "../../etc" }), "", loc);
    expect(cfg.slug).toBe("ai-103"); // from the path
    expect(cfg.hubId).toBe("ai-103");
    expect(cfg.downloadPath).toBe("/h/ai-103/download");
  });

  it("keeps the download link relative on an opaque origin", () => {
    const cfg = readConfig(script({ hubId: "ai103", slug: "ai-103" }), "", { origin: "null", pathname: "/" });
    expect(cfg.downloadUrl).toBe("/h/ai-103/download");
  });

  it("reads the sh_hint cookie as the signed-in hint", () => {
    expect(readConfig(script(HUB), "a=1; sh_hint=pub_123; b=2", loc).hint).toBe("pub_123");
    expect(readConfig(script(HUB), "a=1", loc).hint).toBeNull();
  });
});

describe("readCookie", () => {
  it("finds exact names only and decodes values", () => {
    expect(readCookie("xsh_hint=no; sh_hint=yes", "sh_hint")).toBe("yes");
    expect(readCookie("sh_hint=a%20b", "sh_hint")).toBe("a b");
    expect(readCookie("sh_hint=%E0%A4%A", "sh_hint")).toBe("%E0%A4%A"); // malformed escape kept raw
  });

  it("treats absent or empty cookies as null", () => {
    expect(readCookie("", "sh_hint")).toBeNull();
    expect(readCookie("sh_hint=", "sh_hint")).toBeNull();
    expect(readCookie("garbage; ;=;", "sh_hint")).toBeNull();
  });
});
