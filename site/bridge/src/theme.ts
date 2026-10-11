/**
 * Shared styling for the bridge's closed shadow roots (AI modal and chrome).
 *
 * The hubs define their palette as custom properties on :root (--surface, --fg, --accent, ...)
 * and switch them with `data-theme` on <html> or `prefers-color-scheme`. Custom properties
 * inherit into shadow trees and survive `all: initial`, so `var(--surface, <fallback>)` follows
 * the hub's own switch exactly, including each hub's accent colour. The fallbacks copy the hub
 * tokens (spec §4.11) and follow the same two switches, using the `data-theme` attribute the
 * bridge mirrors onto each shadow host.
 *
 * Fonts reuse the hub's already-loaded families and weights (400/700), and nothing here
 * references a URL, so the bridge UI never triggers a network request.
 */

const LIGHT =
  "--sh-bg:var(--surface,#fff);--sh-fg:var(--fg,#121b26);--sh-muted:var(--muted,#526072);" +
  "--sh-line:var(--line,#d0d8e2);--sh-soft:var(--surface-2,#e8ecf2);--sh-accent:var(--accent,#2343c4);" +
  "--sh-accent-ink:var(--accent-ink,#fff);--sh-warn:var(--trap,#965200);--sh-shadow:0 6px 24px rgba(0,0,0,.18);";
const DARK =
  "--sh-bg:var(--surface,#141b24);--sh-fg:var(--fg,#e3eaf2);--sh-muted:var(--muted,#93a2b2);" +
  "--sh-line:var(--line,#2a3644);--sh-soft:var(--surface-2,#1b2531);--sh-accent:var(--accent,#8fa4ff);" +
  "--sh-accent-ink:var(--accent-ink,#0c1117);--sh-warn:var(--trap,#f2b24c);--sh-shadow:0 6px 24px rgba(0,0,0,.5);";
const FONTS =
  '--sh-font:var(--f-body,system-ui,-apple-system,"Segoe UI",sans-serif);' +
  "--sh-display:var(--f-display,var(--sh-font));";

export const THEME_CSS =
  `:host{${LIGHT}${FONTS}}` +
  `@media (prefers-color-scheme:dark){:host(:not([data-theme=light])){${DARK}}}` +
  `:host([data-theme=dark]){${DARK}}`;

/** Mirror `<html data-theme>` onto `host` now and on every change. Returns a stopper. */
export function followTheme(host: Element, doc: Document): () => void {
  const root = doc.documentElement;
  const sync = (): void => {
    const theme = root.getAttribute("data-theme");
    if (theme) host.setAttribute("data-theme", theme);
    else host.removeAttribute("data-theme");
  };
  sync();
  if (typeof MutationObserver !== "function") return () => undefined;
  const observer = new MutationObserver(sync);
  observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}
