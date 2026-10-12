import { Link } from 'react-router';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

/** `/privacy`: what is stored and why (M1: accounts and sync). M2 adds export and delete. */
export function Privacy() {
  useDocumentTitle('Privacy');

  return (
    <article className="page prose" aria-labelledby="page-title">
      <p className="eyebrow">Privacy</p>
      <h1 id="page-title">What this site stores</h1>
      <p className="lede">
        Short version: without an account, your study progress never leaves your browser. With an account, it is also
        saved to your account so it syncs across devices.
      </p>

      <h2>In your browser</h2>
      <ul>
        <li>
          Each hub saves your progress (modules done, answers, flashcards, mock exams) in this browser’s local
          storage for this site.
        </li>
        <li>
          The site also keeps a few small items there: notices you have dismissed, which account this browser’s
          progress belongs to, and what has already been synced.
        </li>
        <li>
          When you sign in, two cookies are set: an HttpOnly session cookie that keeps you signed in for up to 14 days,
          and a small readable cookie that tells the hub pages you are signed in. Signing out removes both, and removes
          the hub progress from this browser after saving it to your account.
        </li>
        <li>There are no advertising or analytics cookies, and no tracking scripts.</li>
      </ul>

      <h2>With an account</h2>
      <ul>
        <li>
          Sign-in uses Google’s Firebase Authentication, with Google or with an email and password. Firebase handles
          your password; we never see it.
        </li>
        <li>
          We store your email address, display name, profile picture link, sign-in method, whether your email is
          verified and when you last signed in.
        </li>
        <li>
          We store your progress for each hub you use (the same records the hub keeps in your browser), compressed, in
          Google Cloud Firestore. Only our server can read it.
        </li>
        <li>
          Downloading your data and deleting your account from the account page arrive in the next update.
        </li>
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

      <p className="muted small">Last updated 12 October 2026.</p>
      <p className="actions">
        <Link className="btn" to="/">
          Browse all hubs
        </Link>
      </p>
    </article>
  );
}
