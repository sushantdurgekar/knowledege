import { Link } from 'react-router';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

/** The site owner's GitHub profile: the only contact channel (build-contracts §21: no email address). */
export const OWNER_GITHUB = 'https://github.com/sushantdurgekar';

/** `/privacy`: what is stored, why, for how long, and how to export or delete it (M2). */
export function Privacy() {
  useDocumentTitle('Privacy');

  return (
    <article className="page prose" aria-labelledby="page-title">
      <p className="eyebrow">Privacy</p>
      <h1 id="page-title">What this site stores</h1>
      <p className="lede">
        Short version: without an account, your study progress never leaves your browser. With an account, it is also
        saved to your account so it syncs across devices. You can download it or delete it at any time.
      </p>

      <h2>In your browser</h2>
      <ul>
        <li>
          Each hub saves your progress (modules done, answers, flashcards, mock exams) in this browser’s local
          storage for this site, so the hubs work offline and without an account.
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
        <li>
          Your account page shows how much storage each hub uses here, and can remove the local copy of a hub that is
          fully synced.
        </li>
        <li>There are no advertising or analytics cookies, and no tracking scripts.</li>
      </ul>

      <h2>With an account</h2>
      <ul>
        <li>
          We store your email address, display name, profile picture link, sign-in method, whether your email is
          verified, when you joined and when you last signed in, so you can sign in and see your account.
        </li>
        <li>
          We store your progress for each hub you use (the same records the hub keeps in your browser), compressed, so
          it follows you to other devices. Only our server can read it.
        </li>
        <li>
          Your data is used only to run this site. It is never sold, shared for advertising or used to profile you.
        </li>
      </ul>

      <h2>Who processes it</h2>
      <ul>
        <li>
          Google, as our processor: Firebase Authentication handles sign-in (with Google or with an email and password;
          we never see your password), and Google Cloud Firestore stores your account and progress.
        </li>
        <li>
          Our hosting provider runs the server. Like any website, it receives basic request details (such as your IP
          address, browser type and the page requested) to deliver pages and keep the service secure.
        </li>
        <li>Fonts are loaded from Google Fonts, so Google receives a request from your browser when a page loads.</li>
      </ul>

      <h2>How long we keep it</h2>
      <ul>
        <li>Your account and progress are kept until you delete your account.</li>
        <li>
          The site owner takes occasional backups so the site can recover from a failure. A deleted account can stay in
          an older backup until that backup is replaced; restoring a backup never brings a deleted account back, because
          we keep a one-way fingerprint of deleted accounts (not your email or your progress) for that purpose.
        </li>
        <li>Server request logs are kept only briefly, for security and troubleshooting.</li>
      </ul>

      <h2>Export and deletion</h2>
      <ul>
        <li>
          <strong>Download my data</strong> on your <Link to="/account">account page</Link> gives you everything your
          account holds, as one JSON file.
        </li>
        <li>
          <strong>Delete my account</strong> on the same page deletes your progress, your account record and your
          sign-in at once, signs you out and removes the hub progress from that browser. It can’t be undone.
        </li>
      </ul>

      <h2>Contact</h2>
      <p>
        Questions or requests about your data: contact the site owner through{' '}
        <a href={OWNER_GITHUB} rel="noopener noreferrer">
          their GitHub profile
        </a>
        .
      </p>

      <p className="muted small">Last updated 13 October 2026.</p>
      <p className="actions">
        <Link className="btn" to="/">
          Browse all hubs
        </Link>
      </p>
    </article>
  );
}
