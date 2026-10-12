import { localHubParts, readOwner, wipeKeys, writeOwner } from '@bridge-shared';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Dialog } from '../components/Dialog';
import { BusyLine, FormMessage } from '../components/forms';
import { useMe } from '../context/me';
import { useCatalog } from '../hooks/useCatalog';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useStorageVersion } from '../hooks/useStorageVersion';
import type { MeUser } from '../lib/api';
import { broadcast } from '../lib/broadcast';
import { hubHref, type HubEntry } from '../lib/catalog';
import { allLegacyKeys, downloadUnsynced, syncHubs, type SyncHub } from '../lib/hubs';
import { localStore, readLocalProgress } from '../lib/local-progress';
import { withNext } from '../lib/next';
import { reconcileUp, type ReconcileReport } from '../lib/reconcile';

export function providerLabel(provider: string | null): string {
  if (provider === 'google.com') return 'Google';
  if (provider === 'password') return 'Email and password';
  return provider || 'Unknown';
}

/** `/account` (M1): profile, this browser's progress and its sync state, mismatch resolution, sign out. */
export function Account() {
  useDocumentTitle('Your account');
  const { me, refresh } = useMe();

  if (me.status === 'loading') {
    return (
      <section className="page" aria-labelledby="page-title">
        <h1 id="page-title">Your account</h1>
        <BusyLine>Loading…</BusyLine>
      </section>
    );
  }
  if (me.status === 'error') {
    return (
      <section className="page" aria-labelledby="page-title">
        <h1 id="page-title">Your account</h1>
        <FormMessage tone="error">
          <p>Couldn’t load your account. Check your connection and try again.</p>
          <button type="button" className="btn btn--small" onClick={refresh}>
            Try again
          </button>
        </FormMessage>
      </section>
    );
  }
  if (me.status === 'anonymous') {
    return (
      <section className="page" aria-labelledby="page-title">
        <p className="eyebrow">Account</p>
        <h1 id="page-title">You’re not signed in</h1>
        <p className="lede">Sign in to see your account and keep your progress in sync across devices.</p>
        <p className="actions">
          <Link className="btn btn--primary" to={withNext('/signin', '/account')}>
            Sign in
          </Link>
          <Link className="btn" to="/">
            Browse all hubs
          </Link>
        </p>
      </section>
    );
  }
  return <AccountDetails user={me.user} />;
}

interface Row {
  hub: HubEntry;
  done: number;
  total: number;
  unsynced: number;
}

function AccountDetails({ user }: { user: MeUser }) {
  const navigate = useNavigate();
  const { state: catalog, retry } = useCatalog();
  const storageVersion = useStorageVersion();
  const [, setLocalVersion] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncReport, setSyncReport] = useState<ReconcileReport | null>(null);
  const [discarded, setDiscarded] = useState(false);
  void storageVersion; // re-render when another tab changes storage

  const storage = localStore();
  const owner = storage ? readOwner(storage) : null;
  const mismatch = !!owner && owner !== user.publicId;
  const hubs: SyncHub[] = catalog.status === 'ready' ? syncHubs(catalog.hubs) : [];

  const rows: Row[] = [];
  if (catalog.status === 'ready' && storage) {
    for (const hub of catalog.hubs) {
      const progress = readLocalProgress(hub, storage);
      const ref = hubs.find((h) => h.id === hub.id);
      if (!progress || !ref) continue;
      rows.push({ hub, ...progress, unsynced: Object.keys(localHubParts(storage, ref)).length });
    }
  }
  const unsyncedTotal = rows.reduce((sum, row) => sum + row.unsynced, 0);

  const syncNow = async () => {
    if (!storage || mismatch) return;
    setSyncing(true);
    setSyncReport(null);
    const report = await reconcileUp({ storage, hubs });
    if (!readOwner(storage)) writeOwner(storage, user.publicId); // this account now holds it
    setSyncing(false);
    setSyncReport(report);
    setLocalVersion((n) => n + 1);
  };

  const discard = () => {
    if (!storage) return;
    wipeKeys(storage, allLegacyKeys(hubs));
    // The owner tag is gone too: open hub tabs that hold the other account's progress stop
    // syncing and reload, and the next hub page this account opens claims the browser.
    broadcast({ type: 'auth-changed' });
    setConfirming(false);
    setDiscarded(true);
    setLocalVersion((n) => n + 1);
  };

  return (
    <section className="page page--wide account" aria-labelledby="page-title">
      <p className="eyebrow">Account</p>
      <h1 id="page-title">Your account</h1>

      <section className="panel" aria-labelledby="profile-title">
        <h2 id="profile-title">Profile</h2>
        <dl className="facts">
          {user.name && (
            <div>
              <dt>Name</dt>
              <dd>{user.name}</dd>
            </div>
          )}
          <div>
            <dt>Email</dt>
            <dd>{user.email ?? '—'}</dd>
          </div>
          <div>
            <dt>Signed in with</dt>
            <dd>{providerLabel(user.provider)}</dd>
          </div>
        </dl>
        <p className="actions">
          <button type="button" className="btn" onClick={() => navigate('/signout')}>
            Sign out
          </button>
        </p>
      </section>

      {mismatch && (
        <section className="panel panel--warn" aria-labelledby="mismatch-title">
          <h2 id="mismatch-title">This browser has progress from another account</h2>
          <p>
            The hub progress saved in this browser belongs to the account that was signed in here before. It isn’t
            added to your account, and hubs keep it in this browser only until you decide.
          </p>
          <p className="actions">
            <button type="button" className="btn btn--danger" onClick={() => setConfirming(true)}>
              Discard this browser’s progress
            </button>
          </p>
        </section>
      )}
      {discarded && <FormMessage tone="success">This browser’s progress was removed. Your account is unchanged.</FormMessage>}

      <section className="panel" aria-labelledby="local-title">
        <h2 id="local-title">Progress in this browser</h2>
        {catalog.status === 'loading' && <BusyLine>Loading hubs…</BusyLine>}
        {catalog.status === 'error' && (
          <FormMessage tone="error">
            <p>Couldn’t load the hubs. {catalog.message}</p>
            <button type="button" className="btn btn--small" onClick={retry}>
              Try again
            </button>
          </FormMessage>
        )}
        {catalog.status === 'ready' && rows.length === 0 && (
          <p className="muted">No hub progress in this browser yet.</p>
        )}
        {rows.length > 0 && (
          <ul className="progress-list">
            {rows.map((row) => (
              <li key={row.hub.slug} className="progress-list__row">
                <a href={hubHref(row.hub)} className="progress-list__title">
                  {row.hub.title}
                </a>
                <span className="muted small">
                  {row.total > 0 ? `${row.done} / ${row.total} modules` : `${row.done} done`}
                </span>
                <SyncChip mismatch={mismatch} unsynced={row.unsynced} />
              </li>
            ))}
          </ul>
        )}
        {!mismatch && unsyncedTotal > 0 && (
          <p className="actions">
            <button type="button" className="btn btn--primary" disabled={syncing} onClick={() => void syncNow()}>
              {syncing ? 'Syncing…' : 'Sync now'}
            </button>
          </p>
        )}
        {syncReport && (
          <FormMessage tone={syncReport.remaining > 0 ? 'error' : 'success'}>
            {syncReport.remaining > 0
              ? 'Some progress couldn’t be saved yet. It stays in this browser and syncs later.'
              : 'Everything in this browser is saved to your account.'}
          </FormMessage>
        )}
      </section>

      <section className="panel" aria-labelledby="data-title">
        <h2 id="data-title">Your data</h2>
        <p className="muted">Exporting your data and deleting your account arrive in the next update.</p>
        <p className="actions">
          <button type="button" className="btn" disabled>
            Export my data
          </button>
          <button type="button" className="btn" disabled>
            Delete account
          </button>
        </p>
      </section>

      {confirming && (
        <Dialog
          title="Discard this browser’s progress?"
          onCancel={() => setConfirming(false)}
          actions={
            <>
              <button type="button" className="btn btn--danger" onClick={discard}>
                Discard
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => storage && downloadUnsynced(storage, hubs.length ? hubs : [])}
              >
                Download unsynced progress (.json)
              </button>
              <button type="button" className="btn btn--quiet" onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </>
          }
        >
          <p>
            This removes all hub progress saved in this browser. Anything already synced to the other account stays in
            that account; anything not synced is lost unless you download it first.
          </p>
        </Dialog>
      )}
    </section>
  );
}

function SyncChip({ mismatch, unsynced }: { mismatch: boolean; unsynced: number }) {
  if (mismatch) return <span className="chip-status chip-status--warn">Another account’s</span>;
  if (unsynced > 0) return <span className="chip-status chip-status--trap">Not synced yet</span>;
  return <span className="chip-status chip-status--good">Synced</span>;
}
