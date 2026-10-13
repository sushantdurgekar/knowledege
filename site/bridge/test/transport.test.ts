/** Transport: request shape, timeouts, and the server → hub error-code table (spec §4.5). */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { codeForResponse, createTransport, knownParam, loadFflate } from "../src/transport";
import { fakeServer, type FakeServer } from "./fake-server";

let server: FakeServer;

beforeEach(() => {
  server = fakeServer();
});

afterEach(() => {
  vi.useRealTimers();
  document.head.innerHTML = "";
});

describe("error mapping (build-contracts §13)", () => {
  it.each([
    [401, "unauthenticated", "revoked"],
    [409, "account_changed", "revoked"],
    [403, "csrf", "not_granted"],
    [403, "email_unverified", "not_granted"],
    [400, "invalid", "invalid_argument"],
    [404, "not_found", "invalid_argument"],
    [422, "invalid", "invalid_argument"],
    [422, "clock_skew", "unavailable"],
    [413, "too_large", "quota_exceeded"],
    [429, "rate_limited", "unavailable"],
    [429, "sync_paused", "unavailable"],
    [503, "maintenance", "unavailable"],
    [503, "unavailable", "unavailable"],
    [500, undefined, "unavailable"],
    [0, undefined, "unavailable"],
  ])("%i %s → %s", (status, code, expected) => {
    expect(codeForResponse(status, code)).toBe(expected);
  });
});

describe("requests", () => {
  it("carry X-StudyHubs: 1 and same-origin credentials; gzip bytes get Content-Encoding", async () => {
    const t = createTransport();
    await t.request("GET", "/me");
    await t.request("POST", "/sync", { body: '{"hubs":{}}', keepalive: true });
    const { gzipSync } = await import("node:zlib");
    await t.request("POST", "/sync", { body: new Uint8Array(gzipSync('{"hubs":{}}')) });
    expect(server.calls.map((c) => [c.method, c.path, c.headers["x-studyhubs"], c.credentials, c.keepalive, c.gzip])).toEqual([
      ["GET", "/api/me", "1", "same-origin", false, false],
      ["POST", "/api/sync", "1", "same-origin", true, false],
      ["POST", "/api/sync", "1", "same-origin", false, true],
    ]);
    expect(server.calls[1].headers["content-type"]).toBe("application/json");
    expect(t.count()).toBe(3);
  });

  it("the page's account goes out as X-StudyHubs-Account when given", async () => {
    const t = createTransport();
    await t.request("POST", "/sync", { body: "{}", account: "pub_A" });
    await t.request("GET", "/me");
    expect(server.calls.map((c) => c.headers["x-studyhubs-account"])).toEqual(["pub_A", undefined]);
  });

  it("never rejects: network errors are status 0, timeouts are flagged", async () => {
    vi.useFakeTimers();
    const t = createTransport();
    server.fail("me", { status: 0, network: true });
    await expect(t.request("GET", "/me")).resolves.toEqual({ status: 0, body: null, retryAt: 0, timedOut: false });
    server.hold("me");
    const p = t.request("GET", "/me", { timeoutMs: 5000 });
    await vi.advanceTimersByTimeAsync(5000);
    await expect(p).resolves.toMatchObject({ status: 0, timedOut: true });
  });

  it("parses error bodies and Retry-After", async () => {
    const t = createTransport(() => 1000);
    server.fail("sync", { status: 429, body: { code: "rate_limited" }, headers: { "Retry-After": "9" } });
    await expect(t.request("POST", "/sync", { body: "{}" })).resolves.toEqual({
      status: 429,
      body: { code: "rate_limited" },
      retryAt: 10_000,
    });
  });

  it("knownParam lists every part", () => {
    expect(knownParam({ main: 5, cards: 7 }, ["main", "mocks", "cards"])).toBe("main:5,mocks:0,cards:7");
    expect(knownParam({}, ["legacy"])).toBe("legacy:0");
  });

  it("loadFflate adds /_sh/fflate.js once", () => {
    loadFflate(document);
    loadFflate(document);
    const scripts = document.querySelectorAll('script[src="/_sh/fflate.js"]');
    expect(scripts).toHaveLength(1);
    expect((scripts[0] as HTMLScriptElement).async).toBe(true);
  });
});
