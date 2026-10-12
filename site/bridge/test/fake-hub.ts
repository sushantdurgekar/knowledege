/**
 * A faithful port of the modern hub engines' storage and sync code (DSA L1 lines 554–641,
 * identical in AB-620 / AI-500 / AI-103; hub-runtime-contract §2–§4): loadLocal/saveLocal,
 * touch() with its 1.2 s debounce, flush() with busy/again, applyRemote, pullRemote, initSync
 * with the visibilitychange pull, and the #syncPill states. Tests drive it like a learner would.
 */
type Part = "main" | "mocks" | "cards";
const live: Array<() => void> = [];

/** Stop every fake hub's timers and listeners (call in afterEach). */
export function disposeHubs(): void {
  while (live.length) live.pop()!();
  delete (window as any).HUB;
}
const PARTS: Part[] = ["main", "mocks", "cards"];

export interface FakeHub {
  id: string;
  S: Record<string, any>;
  MOCKS: unknown[];
  CARDS: Record<string, unknown>;
  U: Record<Part, number>;
  SYNC: { db: any; base: string | null; state: string };
  toasts: string[];
  pill(): { text: string; cls: string };
  /** The learner did something: mutate state, then touch(part) as the engine does. */
  touch(part: Part, mutate?: () => void): void;
  initSync(): Promise<void>;
  pullRemote(): Promise<boolean>;
  saveLocal(): void;
}

export function createFakeHub(id: string): FakeHub {
  (window as any).HUB = { id };
  const LKEY = "studyhub." + id + ".v2";
  const defState = () => ({ v: 2, done: {}, plan: {}, quiz: {}, mis: {}, last: null as string | null });
  document.body.insertAdjacentHTML("beforeend", '<span id="syncPill" class="pill"></span>');
  const $pill = () => document.getElementById("syncPill")!;

  const hub: FakeHub = {
    id,
    S: defState(),
    MOCKS: [],
    CARDS: {},
    U: { main: 0, mocks: 0, cards: 0 },
    SYNC: { db: null, base: null, state: "local" },
    toasts: [],
    pill: () => ({ text: $pill().textContent || "", cls: $pill().className }),
    touch,
    initSync,
    pullRemote,
    saveLocal,
  };
  const timers: Record<string, ReturnType<typeof setTimeout>> = {};
  const busy: Record<string, boolean> = {};
  const again: Record<string, boolean> = {};

  function loadLocal(): void {
    try {
      const raw = localStorage.getItem(LKEY);
      if (!raw) return;
      const o = JSON.parse(raw);
      if (o && o.S) {
        hub.S = Object.assign(defState(), o.S);
        hub.MOCKS = Array.isArray(o.MOCKS) ? o.MOCKS : [];
        hub.CARDS = o.CARDS || {};
        hub.U = Object.assign(hub.U, o.U || {});
      }
    } catch {
      /* in memory */
    }
  }
  function saveLocal(): void {
    try {
      localStorage.setItem(LKEY, JSON.stringify({ S: hub.S, MOCKS: hub.MOCKS, CARDS: hub.CARDS, U: hub.U }));
    } catch {
      /* swallowed like the hub */
    }
  }
  function setSync(st: string): void {
    hub.SYNC.state = st;
    const map: Record<string, [string, string]> = {
      local: ["Saved in this browser", ""],
      cloud: ["Synced to your account", "ok"],
      error: ["Sync paused, saved in this browser", "mid"],
      loading: ["Connecting…", "info"],
    };
    const m = map[st] || map.local;
    $pill().className = "pill " + m[1];
    $pill().innerHTML = `<span class="dot"></span>${m[0]}`;
  }
  function payload(part: Part) {
    if (part === "main") return { hub: id, upd: hub.U.main, S: hub.S };
    if (part === "mocks") return { hub: id, upd: hub.U.mocks, list: hub.MOCKS.slice(-25) };
    return { hub: id, upd: hub.U.cards, map: hub.CARDS };
  }
  function touch(part: Part, mutate?: () => void): void {
    if (mutate) mutate();
    hub.U[part] = Date.now();
    saveLocal();
    if (hub.SYNC.db) {
      clearTimeout(timers[part]);
      timers[part] = setTimeout(() => void flush(part), 1200);
    }
  }
  async function flush(part: Part): Promise<void> {
    if (!hub.SYNC.db) return;
    if (busy[part]) {
      again[part] = true;
      return;
    }
    busy[part] = true;
    try {
      await hub.SYNC.db.doc(hub.SYNC.base + "/" + part).set(JSON.parse(JSON.stringify(payload(part))));
      setSync("cloud");
    } catch (e: any) {
      const c = e && e.code;
      if (["invalid_argument", "not_granted", "revoked", "capability_disabled", "capability_removed"].includes(c)) {
        hub.SYNC.db = null;
        setSync("local");
      } else if (c === "quota_exceeded") {
        setSync("error");
        hub.toasts.push("Account storage is full; progress stays in this browser.");
      } else setSync("error");
    } finally {
      busy[part] = false;
      if (again[part]) {
        again[part] = false;
        void flush(part);
      }
    }
  }
  function applyRemote(part: Part, data: any): boolean {
    if (!data || typeof data !== "object") return false;
    if ((data.upd || 0) <= (hub.U[part] || 0)) return false;
    if (part === "main" && data.S) hub.S = Object.assign(defState(), data.S);
    else if (part === "mocks" && Array.isArray(data.list)) hub.MOCKS = data.list;
    else if (part === "cards" && data.map) hub.CARDS = data.map;
    else return false;
    hub.U[part] = data.upd;
    return true;
  }
  async function pullRemote(): Promise<boolean> {
    if (!hub.SYNC.db) return false;
    let changed = false;
    for (const part of PARTS) {
      try {
        const snap = await hub.SYNC.db.doc(hub.SYNC.base + "/" + part).get();
        if (snap.exists) {
          if (applyRemote(part, snap.data())) changed = true;
          else if ((hub.U[part] || 0) > ((snap.data() || {}).upd || 0)) void flush(part);
        } else if (hub.U[part]) void flush(part);
      } catch {
        setSync("error");
        return changed;
      }
    }
    saveLocal();
    return changed;
  }
  async function initSync(): Promise<void> {
    const claude = (window as any).claude;
    if (!claude || typeof claude.use !== "function") return setSync("local");
    setSync("loading");
    let db = null;
    let user = null;
    try {
      [db, user] = await Promise.all([claude.use("db"), claude.use("user")]);
    } catch {
      /* local */
    }
    if (!db) return setSync("local");
    let owner = false;
    let uid = null;
    try {
      owner = user ? await user.isOwner() : false;
      uid = user ? await user.id() : null;
    } catch {
      /* local */
    }
    const base = owner ? "progress" : uid ? "data/users/" + uid : null;
    if (!base) return setSync("local");
    hub.SYNC.db = db;
    hub.SYNC.base = base;
    await pullRemote();
    if (hub.SYNC.db && hub.SYNC.state !== "error") setSync("cloud");
    document.addEventListener("visibilitychange", onVisible);
  }
  async function onVisible(): Promise<void> {
    if (document.visibilityState === "visible" && hub.SYNC.db) await pullRemote();
  }
  live.push(() => {
    document.removeEventListener("visibilitychange", onVisible);
    for (const t of Object.values(timers)) clearTimeout(t);
    hub.SYNC.db = null;
  });

  loadLocal();
  setSync("local");
  return hub;
}
