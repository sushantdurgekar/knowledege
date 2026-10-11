import { describe, expect, it } from "vitest";
import {
  SYNCED_MOCKS,
  buildPart,
  countDone,
  dirtyParts,
  hasMainProgress,
  isHubKey,
  keysToWipe,
  legacyHasProgress,
  legacySidecarKey,
  mockRunKey,
  nudgeKey,
  parseHubRecord,
  parseSynced,
  progressKey,
  storageKeysFor,
  summarizeHub,
  summarizeLegacy,
  syncedKey,
} from "../src/local-progress";

const rec = (U: Partial<Record<"main" | "mocks" | "cards", unknown>>, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ S: { v: 2, done: { m1: true, m2: false, m3: 1 } }, MOCKS: [], CARDS: {}, U, ...extra });

describe("key names", () => {
  it("match the hub and bridge conventions", () => {
    expect(progressKey("ai103")).toBe("studyhub.ai103.v2");
    expect(mockRunKey("dsa-l1")).toBe("studyhub.dsa-l1.mockrun");
    expect(storageKeysFor("ai103")).toEqual(["studyhub.ai103.v2", "studyhub.ai103.mockrun"]);
    expect(syncedKey("ai103")).toBe("studyhubs.synced.ai103");
    expect(legacySidecarKey("ai901hub.v1")).toBe("studyhubs.legacy.ai901hub.v1.upd");
    expect(nudgeKey("ai103")).toBe("studyhubs.ui.nudge.ai103");
  });

  it("isHubKey covers hub prefixes and legacy keys, not bridge keys", () => {
    expect(isHubKey("studyhub.ai103.v2")).toBe(true);
    expect(isHubKey("studyhub.codeLang")).toBe(true);
    expect(isHubKey("ai901hub.v1")).toBe(true);
    expect(isHubKey("custom.legacy", ["custom.legacy"])).toBe(true);
    expect(isHubKey("studyhubs.owner")).toBe(false);
    expect(isHubKey("studyhubs.ui.nudge.ai103")).toBe(false);
    expect(isHubKey("theme")).toBe(false);
  });
});

describe("records and summaries", () => {
  it("parses like the hub's loadLocal (S required, stamps sanitised)", () => {
    expect(parseHubRecord(null)).toBeNull();
    expect(parseHubRecord("not json")).toBeNull();
    expect(parseHubRecord(JSON.stringify({ U: { main: 1 } }))).toBeNull();
    const r = parseHubRecord(rec({ main: 5, mocks: -1, cards: "7" }, { MOCKS: "x", CARDS: [1] }))!;
    expect(r.U).toEqual({ main: 5, mocks: 0, cards: 0 });
    expect(r.MOCKS).toEqual([]);
    expect(r.CARDS).toEqual({});
  });

  it("counts done modules and clamps to the catalog total", () => {
    expect(countDone({ a: true, b: false, c: 1 })).toBe(2);
    expect(countDone(null)).toBe(0);
    expect(summarizeHub(rec({ main: 10, mocks: 30, cards: 20 }), 8)).toEqual({ done: 2, total: 8, updated: 30 });
    expect(summarizeHub(rec({ main: 10 }), 1)).toEqual({ done: 1, total: 1, updated: 10 });
    expect(summarizeHub(rec({}))).toEqual({ done: 2, total: null, updated: 0 });
    expect(summarizeHub(undefined)).toBeNull();
  });

  it("summarises the legacy record", () => {
    const raw = JSON.stringify({ done: { m1: true, m2: true }, plan: {}, mistakes: [], mockHist: [] });
    expect(summarizeLegacy(raw, 17, "1700000000000")).toEqual({ done: 2, total: 17, updated: 1700000000000 });
    expect(summarizeLegacy(raw)).toEqual({ done: 2, total: null, updated: 0 });
    expect(summarizeLegacy("[]")).toBeNull();
  });

  it("detects first progress", () => {
    expect(hasMainProgress(rec({ main: 0 }))).toBe(false);
    expect(hasMainProgress(rec({ main: 1 }))).toBe(true);
    expect(hasMainProgress(null)).toBe(false);
    expect(legacyHasProgress(JSON.stringify({ done: {}, plan: {}, mistakes: [], mockHist: [] }))).toBe(false);
    expect(legacyHasProgress(JSON.stringify({ plan: { p1: true } }))).toBe(true);
    expect(legacyHasProgress(JSON.stringify({ mistakes: [{}] }))).toBe(true);
    expect(legacyHasProgress("garbage")).toBe(false);
  });
});

describe("payloads (M1 outbox)", () => {
  const mocks = Array.from({ length: 40 }, (_, i) => ({ i }));
  const r = parseHubRecord(rec({ main: 3, mocks: 4, cards: 0 }, { MOCKS: mocks, CARDS: { c1: [1, 2] } }))!;

  it("rebuilds the hub's payload(part), including MOCKS.slice(-25)", () => {
    expect(buildPart(r, "main", "ai103")).toEqual({ hub: "ai103", upd: 3, S: r.S });
    const m = buildPart(r, "mocks", "ai103") as { list: unknown[]; upd: number };
    expect(m.upd).toBe(4);
    expect(m.list).toHaveLength(SYNCED_MOCKS);
    expect(m.list[0]).toEqual({ i: 15 });
    expect(buildPart(r, "cards", "ai103")).toBeNull(); // never changed
  });

  it("finds dirty parts against acknowledged stamps", () => {
    expect(dirtyParts(r, parseSynced(null))).toEqual(["main", "mocks"]);
    expect(dirtyParts(r, parseSynced(JSON.stringify({ main: 3, mocks: 2 })))).toEqual(["mocks"]);
  });

  it("lists logout keys, keeping studyhubs.ui.*", () => {
    const keys = [
      "studyhub.ai103.v2",
      "studyhub.codeLang",
      "ai901hub.v1",
      "studyhubs.owner",
      "studyhubs.synced.ai103",
      "studyhubs.legacy.ai901hub.v1.upd",
      "studyhubs.ui.nudge.ai103",
      "unrelated",
    ];
    expect(keysToWipe(keys, ["ai901hub.v1"])).toEqual(keys.slice(0, 6));
  });
});
