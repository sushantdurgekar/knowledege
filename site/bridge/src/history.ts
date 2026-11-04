/**
 * Browser Back / Forward inside a hub.
 *
 * Hubs switch sections (Start, Learn, Practice, ...) and Learn modules in place, without
 * touching history, so Back on a phone used to leave the hub from anywhere in it. Every hub
 * marks its state the same way, which is all this needs (the hub code itself is closed over):
 *   section: `nav.tabs button[data-v][aria-selected="true"]`
 *   module:  `#rail button[data-m][aria-current="true"]` while the section is "learn"
 * and every hub opens `#<section>` or `#<module id>` at boot. So each change of section or
 * module becomes a history entry with that hash, and Back / Forward clicks the hub's own tab
 * or module button to get there. Back from the first entry leaves the hub as before.
 */
import { noop } from "./util";

const KEY = "shHub";

interface Spot {
  v: string;
  m: string;
}

const same = (a: Spot | null, b: Spot | null): boolean => !!a && !!b && a.v === b.v && a.m === b.m;
const hashOf = (s: Spot): string => "#" + encodeURIComponent(s.m || s.v);

export function readSpot(doc: Document): Spot | null {
  const tab = doc.querySelector<HTMLElement>('nav.tabs button[data-v][aria-selected="true"]');
  const v = tab?.dataset.v;
  if (!v) return null;
  const mod = v === "learn" ? doc.querySelector<HTMLElement>('#rail button[data-m][aria-current="true"]') : null;
  return { v, m: mod?.dataset.m ?? "" };
}

function tabButton(doc: Document, v: string): HTMLElement | null {
  return doc.querySelector<HTMLElement>(`nav.tabs button[data-v="${CSS.escape(v)}"]`);
}

/** Move the hub to `spot` with its own controls. Returns false when the hub has no such place. */
export function goTo(doc: Document, spot: Spot): boolean {
  const tab = tabButton(doc, spot.v);
  if (!tab) return false;
  const now = readSpot(doc);
  if (now?.v !== spot.v) tab.click();
  if (!spot.m) return true;
  if (readSpot(doc)?.m === spot.m) return true;
  const sel = `#rail button[data-m="${CSS.escape(spot.m)}"]`;
  let button = doc.querySelector<HTMLElement>(sel);
  if (!button) {
    const search = doc.querySelector<HTMLInputElement>("#railSearch"); // a filtered rail hides it
    if (search && search.value) {
      search.value = "";
      search.dispatchEvent(new Event("input", { bubbles: true }));
      button = doc.querySelector<HTMLElement>(sel);
    }
  }
  if (button) {
    button.click();
    return true;
  }
  const select = doc.querySelector<HTMLSelectElement>("#railSel");
  if (select && Array.from(select.options).some((o) => o.value === spot.m)) {
    select.value = spot.m;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }
  return false;
}

/** A spot from a URL hash: a section name, or a module id (opened under "learn"). */
function spotFromHash(doc: Document, hash: string): Spot | null {
  let h = "";
  try {
    h = decodeURIComponent(hash.replace(/^#/, ""));
  } catch {
    return null;
  }
  if (!h) return null;
  if (tabButton(doc, h)) return { v: h, m: "" };
  return tabButton(doc, "learn") ? { v: "learn", m: h } : null;
}

export function installHubHistory(win: Window, doc: Document): () => void {
  if (!doc.querySelector("nav.tabs button[data-v]") || typeof win.history?.pushState !== "function") return noop;
  // A hub that ignored the link's #module at boot (the older AI-901 hub) is taken there now.
  const linked = spotFromHash(doc, win.location.hash);
  if (linked && !same(linked, readSpot(doc))) goTo(doc, linked);
  let current = readSpot(doc);
  let applying = false;
  let queued = false;

  const stamp = (spot: Spot, push: boolean): void => {
    const state = { ...(win.history.state as object | null), [KEY]: spot };
    try {
      if (push) win.history.pushState(state, "", hashOf(spot));
      else win.history.replaceState(state, "", hashOf(spot));
    } catch {
      /* sandboxed or rate-limited history: keep the page working */
    }
  };
  if (current) stamp(current, false);

  const check = (): void => {
    queued = false;
    if (applying) return;
    const spot = readSpot(doc);
    if (!spot || same(spot, current)) return;
    // Opening Learn shows the last module: one entry for "learn + module", not two.
    const replace = !!current && current.v === "learn" && spot.v === "learn" && !current.m;
    current = spot;
    stamp(spot, !replace);
  };
  const observer = new MutationObserver(() => {
    if (!queued) {
      queued = true;
      queueMicrotask(check);
    }
  });
  observer.observe(doc.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["aria-selected", "aria-current"],
  });

  const onPop = (event: PopStateEvent): void => {
    const saved = (event.state as Record<string, unknown> | null)?.[KEY] as Spot | undefined;
    const spot = saved && typeof saved.v === "string" ? saved : spotFromHash(doc, win.location.hash);
    if (!spot || same(spot, readSpot(doc))) return;
    applying = true;
    try {
      goTo(doc, spot);
    } finally {
      current = readSpot(doc);
      applying = false;
      if (current && !same(current, spot)) stamp(current, false); // the hub refused: keep the URL honest
    }
  };
  win.addEventListener("popstate", onPop);

  return () => {
    observer.disconnect();
    win.removeEventListener("popstate", onPop);
  };
}
