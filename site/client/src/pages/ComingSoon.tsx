import { Link } from 'react-router';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

/** Placeholder for pages of a later milestone (M1: `/admin/*`, which M2 builds). */
export function ComingSoon({ page }: { page: string }) {
  useDocumentTitle(page);

  return (
    <section className="page" aria-labelledby="page-title">
      <p className="eyebrow">{page}</p>
      <h1 id="page-title">Coming soon</h1>
      <p className="lede">This part of Study Hubs isn’t ready yet. Every hub already works, with or without an account.</p>
      <p className="actions">
        <Link className="btn btn--primary" to="/">
          Browse all hubs
        </Link>
      </p>
    </section>
  );
}
