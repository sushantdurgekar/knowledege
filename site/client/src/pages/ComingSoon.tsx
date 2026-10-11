import { Link, useSearchParams } from 'react-router';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

/** `?next=` is honoured only for a hub page path, so the link can never point off-site. */
const HUB_PATH_RE = /^\/h\/[A-Za-z0-9._~-]+$/;

export function safeHubPath(next: string | null): string | null {
  return next !== null && HUB_PATH_RE.test(next) ? next : null;
}

/** M0 placeholder for the account routes (/signin, /signup, /reset, /verify, /signout, /account, /admin/*). */
export function ComingSoon({ page }: { page: string }) {
  useDocumentTitle(page);
  const [params] = useSearchParams();
  const backToHub = safeHubPath(params.get('next'));

  return (
    <section className="page" aria-labelledby="page-title">
      <p className="eyebrow">{page}</p>
      <h1 id="page-title">Accounts are coming soon</h1>
      <p className="lede">
        Every hub already works without an account. Your progress is saved in this browser, so keep using the same
        browser on this device. Signing in to sync progress across devices is on its way.
      </p>
      <p className="actions">
        {backToHub && (
          // A hub is a full page served by the backend, not a route of this app.
          <a className="btn btn--primary" href={backToHub}>
            Back to the hub
          </a>
        )}
        <Link className={backToHub ? 'btn' : 'btn btn--primary'} to="/">
          Browse all hubs
        </Link>
      </p>
    </section>
  );
}
