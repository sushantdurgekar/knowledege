/** The open-book mark from favicon.svg, drawn in the theme accent. Decorative. */
export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" width="28" height="28" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="7" fill="var(--accent)" />
      <path
        d="M8 10.5c2.8-1.2 5.5-1 8 .8 2.5-1.8 5.2-2 8-.8v12c-2.8-1.2-5.5-1-8 .8-2.5-1.8-5.2-2-8-.8z"
        fill="var(--accent-ink)"
      />
      <path d="M16 11.3v12" stroke="var(--accent)" strokeWidth="1.5" />
    </svg>
  );
}
