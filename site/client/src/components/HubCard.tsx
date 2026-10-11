import { useId, type CSSProperties } from 'react';
import {
  downloadHref,
  formatBytes,
  hubHref,
  levelBadge,
  pluralize,
  type HubEntry,
} from '../lib/catalog';
import type { LocalProgress } from '../lib/local-progress';

interface HubCardProps {
  hub: HubEntry;
  /** Progress saved in this browser, or null when the hub has none. */
  progress: LocalProgress | null;
}

/**
 * One hub in the catalog. "Open" is a plain link on purpose: hubs are full pages served by the
 * backend (with the bridge injected), not routes of this app, so they need a real navigation.
 */
export function HubCard({ hub, progress }: HubCardProps) {
  const titleId = useId();
  const badge = levelBadge(hub) ?? (hub.kind === 'cert' ? 'Certification' : null);
  // `accent` is already sanitised to #rgb/#rrggbb by parseCatalog; null means "use the theme accent".
  const style = hub.accent ? ({ '--hub-accent': hub.accent } as CSSProperties) : undefined;
  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <article className="hub-card" style={style} aria-labelledby={titleId}>
      <div className="hub-card__head">
        {hub.code && <span className="hub-card__code">{hub.code}</span>}
        {badge && <span className="hub-card__badge">{badge}</span>}
      </div>

      <h4 id={titleId} className="hub-card__title">
        {hub.title}
      </h4>
      {hub.kind === 'cert' && hub.cert && <p className="hub-card__cert">{hub.cert}</p>}
      {hub.blurb && <p className="hub-card__blurb">{hub.blurb}</p>}

      <ul className="hub-card__meta">
        <li>{pluralize(hub.modules, 'module')}</li>
        {hub.brBytes !== null && <li>{formatBytes(hub.brBytes)} download</li>}
      </ul>

      {progress && (
        <div className="hub-card__progress" data-complete={progress.total > 0 && progress.done >= progress.total}>
          <p>
            <span className="sr-only">Progress in this browser: </span>
            {progress.total > 0 ? `${progress.done} / ${progress.total} modules` : pluralize(progress.done, 'module') + ' done'}
          </p>
          <span className="meter" aria-hidden="true">
            <span style={{ width: `${pct}%` }} />
          </span>
        </div>
      )}

      <div className="hub-card__actions">
        {/* aria-label starts with the visible word, so voice control ("click Open") still works. */}
        <a className="btn btn--primary" href={hubHref(hub)} aria-label={`Open ${hub.title}`}>
          Open
        </a>
        <a className="btn" href={downloadHref(hub)} download="" aria-label={`Download ${hub.title} (HTML file)`}>
          Download
        </a>
      </div>
    </article>
  );
}
