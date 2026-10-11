/** Small helpers shared by the bridge modules. Nothing here touches the network. */

/** An Error carrying the `code` the hubs switch on, plus optional extra fields (e.g. `text`). */
export type CodedError = Error & { code: string } & Record<string, unknown>;

export function codedError(code: string, message?: string, extra?: Record<string, unknown>): CodedError {
  return Object.assign(new Error(message || code), extra, { code }) as CodedError;
}

export function noop(): void {}

/** Escape text for use inside HTML text or a double-quoted attribute. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Bridge diagnostics. Only used for genuine bugs, so a healthy hub page logs nothing. */
export function warn(...args: unknown[]): void {
  try {
    console.warn("[studyhubs]", ...args);
  } catch {
    /* console unavailable */
  }
}

/** Run `fn` once the DOM is parsed (immediately if it already is). Returns a canceller. */
export function onDomReady(doc: Document, fn: () => void): () => void {
  if (doc.readyState !== "loading") {
    fn();
    return noop;
  }
  const handler = (): void => fn();
  doc.addEventListener("DOMContentLoaded", handler, { once: true });
  return () => doc.removeEventListener("DOMContentLoaded", handler);
}

/** `window.localStorage`, or null where access throws (blocked site data, sandboxed frames). */
export function safeLocalStorage(win: Window): Storage | null {
  try {
    return win.localStorage || null;
  } catch {
    return null;
  }
}

/** Where to mount the bridge's shadow hosts: <body>, or <html> if a page somehow has no body. */
export function mountPoint(doc: Document): HTMLElement {
  return doc.body || doc.documentElement;
}
