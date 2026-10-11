import { Link } from 'react-router';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

/** `/privacy`: a short, honest placeholder for M0. It is rewritten before accounts launch (M1/M2). */
export function Privacy() {
  useDocumentTitle('Privacy');

  return (
    <article className="page prose" aria-labelledby="page-title">
      <p className="eyebrow">Privacy</p>
      <h1 id="page-title">What this site stores</h1>
      <p className="lede">
        Short version: today there are no accounts, and your study progress never leaves your browser.
      </p>

      <h2>In your browser</h2>
      <ul>
        <li>
          Each hub saves your progress (modules done, answers, flashcards, mock exams) in this browser’s local
          storage for this site. It stays on this device and is not sent to us.
        </li>
        <li>The site also keeps a few small display preferences there, such as notices you have dismissed.</li>
        <li>
          Clearing this site’s data in your browser settings deletes that progress. A downloaded hub file does not
          include it.
        </li>
        <li>There are no advertising or analytics cookies, and no tracking scripts.</li>
      </ul>

      <h2>On the server</h2>
      <ul>
        <li>
          Like any website, our server and hosting provider receive basic request details (such as your IP address,
          browser type and the page requested) to deliver pages and keep the service secure.
        </li>
        <li>
          Fonts are loaded from Google Fonts, so Google receives a request from your browser when a page loads.
        </li>
      </ul>

      <h2>Accounts, later</h2>
      <p>
        Signing in (with Google or email) is coming so you can sync progress across devices. Before it launches, this
        page will explain exactly what is stored with your account, why, and how to export or delete it.
      </p>

      <p className="muted small">Last updated 11 October 2026.</p>
      <p className="actions">
        <Link className="btn" to="/">
          Browse all hubs
        </Link>
      </p>
    </article>
  );
}
