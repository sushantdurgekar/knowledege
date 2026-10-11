import { FILTERS, pluralize, type Filter } from '../lib/catalog';

const CHIPS: Record<Filter, { label: string; hint?: string }> = {
  all: { label: 'All' },
  l1: { label: 'L1', hint: 'Foundation' },
  l2: { label: 'L2', hint: 'Proficient' },
  l3: { label: 'L3', hint: 'Specialist' },
  l4: { label: 'L4', hint: 'Expert' },
  cert: { label: 'Cert', hint: 'certifications' },
};

interface FilterBarProps {
  query: string;
  filter: Filter;
  /** Hubs each chip would show for the current search. */
  counts: Record<Filter, number>;
  onQueryChange: (query: string) => void;
  onFilterChange: (filter: Filter) => void;
}

/** Search box plus single-choice filter chips (toggle buttons with aria-pressed). */
export function FilterBar({ query, filter, counts, onQueryChange, onFilterChange }: FilterBarProps) {
  return (
    <div className="filter-bar">
      <form role="search" className="search" onSubmit={(event) => event.preventDefault()}>
        <label htmlFor="hub-search" className="sr-only">
          Search hubs
        </label>
        <svg className="search__icon" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false">
          <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="m13 13 4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          id="hub-search"
          className="search__input"
          type="search"
          placeholder="Search by title, code or certification"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </form>

      <div className="chips" role="group" aria-label="Filter by level">
        {FILTERS.map((value) => {
          const { label, hint } = CHIPS[value];
          // Spoken as "L1 Foundation, 1 hub": starts with the visible label (voice control) and
          // expands the abbreviation.
          const name = `${hint ? `${label} ${hint}` : label}, ${pluralize(counts[value], 'hub')}`;
          return (
            <button
              key={value}
              type="button"
              className="chip"
              aria-pressed={filter === value}
              aria-label={name}
              onClick={() => onFilterChange(value)}
            >
              {label}
              <span className="chip__count">{counts[value]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
