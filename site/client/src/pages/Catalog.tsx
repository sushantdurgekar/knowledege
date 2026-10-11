import { useId, useMemo, type CSSProperties } from 'react';
import { useSearchParams } from 'react-router';
import { FilterBar } from '../components/FilterBar';
import { HubCard } from '../components/HubCard';
import { useCatalog } from '../hooks/useCatalog';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useStorageVersion } from '../hooks/useStorageVersion';
import {
  countByFilter,
  filterHubs,
  groupHubs,
  isFilter,
  pluralize,
  type DomainGroup,
  type Filter,
  type HubEntry,
  type SubjectGroup,
} from '../lib/catalog';
import { readLocalProgress, type LocalProgress } from '../lib/local-progress';

type ProgressMap = ReadonlyMap<string, LocalProgress | null>;

/** `/`: every published hub, grouped by domain and subject, with search and level chips. */
export function Catalog() {
  useDocumentTitle();
  const { state, retry } = useCatalog();

  return (
    <>
      <section className="hero" aria-labelledby="catalog-title">
        <h1 id="catalog-title">Find a hub and start studying</h1>
        <p className="lede">
          Self-paced Study Hubs for certifications and core tech skills. Open one to start: your progress is saved in
          this browser.
        </p>
      </section>

      {state.status === 'loading' && <LoadingState />}
      {state.status === 'error' && <ErrorState message={state.message} onRetry={retry} />}
      {state.status === 'ready' &&
        (state.hubs.length === 0 ? (
          <div className="notice">
            <h2>No hubs yet</h2>
            <p>Nothing has been published. Check back soon.</p>
          </div>
        ) : (
          <CatalogResults hubs={state.hubs} />
        ))}
    </>
  );
}

/** Filter state lives in the URL (`?filter=l1&q=graphs`), so Back and shared links keep it. */
function useCatalogParams() {
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const rawFilter = params.get('filter');
  const filter: Filter = isFilter(rawFilter) ? rawFilter : 'all';

  const update = (change: { q?: string; filter?: Filter }) =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (change.q !== undefined) {
          if (change.q) next.set('q', change.q);
          else next.delete('q');
        }
        if (change.filter !== undefined) {
          if (change.filter !== 'all') next.set('filter', change.filter);
          else next.delete('filter');
        }
        return next;
      },
      { replace: true },
    );

  return { query, filter, update };
}

function CatalogResults({ hubs }: { hubs: HubEntry[] }) {
  const { query, filter, update } = useCatalogParams();
  const storageVersion = useStorageVersion();

  const counts = useMemo(() => countByFilter(hubs, query), [hubs, query]);
  const visible = useMemo(() => filterHubs(hubs, filter, query), [hubs, filter, query]);
  const groups = useMemo(() => groupHubs(visible), [visible]);
  // storageVersion isn't read inside: it is the trigger to re-read local progress (see useStorageVersion).
  const progress = useMemo<ProgressMap>(
    () => new Map(hubs.map((hub) => [hub.slug, readLocalProgress(hub)])),
    [hubs, storageVersion],
  );

  const narrowed = filter !== 'all' || query.trim() !== '';
  const summary = narrowed
    ? `Showing ${visible.length} of ${pluralize(hubs.length, 'hub')}`
    : pluralize(hubs.length, 'hub');

  return (
    <>
      <div className="toolbar">
        <FilterBar
          query={query}
          filter={filter}
          counts={counts}
          onQueryChange={(q) => update({ q })}
          onFilterChange={(next) => update({ filter: next })}
        />
        <p className="results-summary" role="status">
          {summary}
        </p>
      </div>

      {visible.length === 0 ? (
        <div className="notice">
          <h2>No hubs match</h2>
          <p>
            {query.trim() ? <>Nothing matches “{query.trim()}”</> : <>Nothing here yet</>}
            {filter !== 'all' && <> with this filter</>}. Try another search, or show every hub.
          </p>
          <button type="button" className="btn" onClick={() => update({ q: '', filter: 'all' })}>
            Show all hubs
          </button>
        </div>
      ) : (
        groups.map((domain) => <DomainSection key={domain.label} domain={domain} progress={progress} />)
      )}
    </>
  );
}

function DomainSection({ domain, progress }: { domain: DomainGroup; progress: ProgressMap }) {
  const headingId = useId();
  return (
    <section className="domain" aria-labelledby={headingId}>
      <h2 id={headingId} className="domain__title">
        {domain.label}
      </h2>
      <div className="subjects">
        {domain.subjects.map((subject) => (
          <SubjectSection key={subject.label} subject={subject} progress={progress} />
        ))}
      </div>
    </section>
  );
}

function SubjectSection({ subject, progress }: { subject: SubjectGroup; progress: ProgressMap }) {
  const headingId = useId();
  // A certification is usually its own subject ("AI-103" > "AI-103 Study Hub"). The card already
  // shows that code, so the heading stays for screen readers but is hidden visually.
  const redundant = subject.hubs.every((hub) => hub.code === subject.label);
  // --n lets a subject with several hubs claim a wider share of the row (see .subject in app.css).
  const style = { '--n': subject.hubs.length } as CSSProperties;
  return (
    <section className="subject" style={style} aria-labelledby={headingId}>
      <h3 id={headingId} className={redundant ? 'sr-only' : 'subject__title'}>
        {subject.label}
      </h3>
      <ul className="hub-grid">
        {subject.hubs.map((hub) => (
          <li key={hub.slug}>
            <HubCard hub={hub} progress={progress.get(hub.slug) ?? null} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function LoadingState() {
  return (
    <div className="loading" aria-busy="true">
      <p role="status" className="results-summary">
        Loading hubs…
      </p>
      <div className="hub-grid" aria-hidden="true">
        {[0, 1, 2].map((n) => (
          <div key={n} className="skeleton-card" />
        ))}
      </div>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="notice notice--error" role="alert">
      <h2>Couldn’t load the hubs</h2>
      <p>{message} Check your connection and try again.</p>
      <button type="button" className="btn btn--primary" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}
