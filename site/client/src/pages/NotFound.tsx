import { Link, useLocation } from 'react-router';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

/** Any unknown shell path. The server already answered it with status 404. */
export function NotFound() {
  useDocumentTitle('Page not found');
  const { pathname } = useLocation();

  return (
    <section className="page" aria-labelledby="page-title">
      <p className="eyebrow">Error 404</p>
      <h1 id="page-title">Page not found</h1>
      <p className="lede">
        There’s nothing at <code className="path">{pathname}</code>. The link may be old, or the address may have a
        typo.
      </p>
      <p className="actions">
        <Link className="btn btn--primary" to="/">
          Browse all hubs
        </Link>
      </p>
    </section>
  );
}
