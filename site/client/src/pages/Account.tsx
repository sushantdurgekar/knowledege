import { localHubParts, readOwner, wipeKeys, writeOwner } from '@bridge-shared';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Dialog } from '../components/Dialog';
import { BusyLine, FormMessage, TextField } from '../components/forms';
import { useMe } from '../context/me';
import { useCatalog } from '../hooks/useCatalog';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useStorageVersion } from '../hooks/useStorageVersion';
import {
  DELETE_PHRASE,
  deleteAccount,
  downloadExport,
  fetchMyProgress,
  formatBytes,
  isReauth,
  localUsage,
  removeLocalCopy,
  totalStorageBytes,
  type MyProgress,
  type ServerHub,
} from '../lib/account';
import { isApiProblem, type MeUser } from '../lib/api';
import { broadcast } from '../lib/broadcast';
import { hubHref, type HubEntry } from '../lib/catalog';
import { allLegacyKeys, downloadUnsynced, syncHubs, type SyncHub } from '../lib/hubs';
import { localStore, readLocalProgress } from '../lib/local-progress';
import { reauthPath, withNext } from '../lib/next';
import { reconcileUp, type ReconcileReport } from '../lib/reconcile';

export function providerLabel(provider: string | null): string {
  if (provider === 'google.com') return 'Google';
  if (provider === 'password') return 'Email and password';
  return provider || 'Unknown';
}

const DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** "12 Oct 2026" for an ISO string or epoch ms, or null when it is not a date. */
export function formatDate(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === '' || value === 0) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : DATE.format(date);
}

/** The message for an API failure on this page (the server's own words when it sent any). */
function problemText(error: unknown, fallback: string): string {
  if (!isApiProblem(error)) return fallback;
  if (error.status === 0) return 'Couldn’t reach Study Hubs. Check your connection and try again.';
  if (error.code === 'rate_limited') return 'Too many requests. Try again in a while.';
  if (error.code === 'maintenance') return 'Study Hubs is under maintenance. Try again later.';
  return error.message && error.message !== error.code ? error.message : fallback;
}

/** `/account` (M2): profile, server and local progress, browser storage, export and delete. */
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

type ServerState = { status: 'loading' } | { status: 'error'; message: string } | ({ status: 'ready' } & MyProgress);

/** One hub in the progress list: what the server holds next to what this browser holds. */
interface Row {
  key: string;
  title: string;
  href: string | null;
  local: { done: number; total: number } | null;
  unsynced: number;
  server: ServerHub | null;
}

function serverUpdated(hub: ServerHub): number {
  return Math.max(0, ...Object.values(hub.parts).map((part) => part?.upd ?? 0));
}

function AccountDetails({ user }: { user: MeUser }) {
  const navigate = useNavigate();
  const { setSignedOut } = useMe();
  const { state: catalog, retry } = useCatalog();
  const storageVersion = useStorageVersion();
  const [localVersion, setLocalVersion] = useState(0);
  const [server, setServer] = useState<ServerState>({ status: 'loading' });
  const [serverAttempt, setServerAttempt] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncReport, setSyncReport] = useState<ReconcileReport | null>(null);
  const [discarded, setDiscarded] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportNote, setExportNote] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [removing, setRemoving] = useState<SyncHub | null>(null);
  const [removedNote, setRemovedNote] = useState<string | null>(null);
  void storageVersion; // re-render when another tab changes storage
  void localVersion;

  useEffect(() => {
    const controller = new AbortController();
    setServer({ status: 'loading' });
    fetchMyProgress(controller.signal).then(
      (progress) => {
        if (!controller.signal.aborted) setServer({ status: 'ready', ...progress });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setServer({ status: 'error', message: problemText(error, 'Something went wrong.') });
      },
    );
    return () => controller.abort();
  }, [serverAttempt]);

  const storage = localStore();
  const owner = storage ? readOwner(storage) : null;
  const mismatch = !!owner && owner !== user.publicId;
  const hubs: SyncHub[] = catalog.status === 'ready' ? syncHubs(catalog.hubs) : [];
  const serverHubs = server.status === 'ready' ? server.hubs : [];

  const rows: Row[] = [];
  if (catalog.status === 'ready') {
    for (const hub of catalog.hubs) {
      const ref = hubs.find((h) => h.id === hub.id);
      const local = storage && ref ? readLocalProgress(hub, storage) : null;
      const remote = serverHubs.find((s) => s.hub === hub.id) ?? null;
      if (!local && !remote) continue;
      const unsynced = storage && ref && local ? Object.keys(localHubParts(storage, ref)).length : 0;
      rows.push({ key: hub.id, title: hub.title, href: hubHref(hub), local, unsynced, server: remote });
    }
  }
  for (const remote of serverHubs) {
    if (rows.some((row) => row.key === remote.hub)) continue;
    const known: HubEntry | undefined = catalog.status === 'ready' ? catalog.hubs.find((h) => h.id === remote.hub) : undefined;
    rows.push({
      key: remote.hub,
      title: remote.title ?? known?.title ?? remote.hub,
      href: remote.slug ? hubHref({ slug: remote.slug }) : null,
      local: null,
      unsynced: 0,
      server: remote,
    });
  }
  const unsyncedTotal = rows.reduce((sum, row) => sum + row.unsynced, 0);
  const usage = storage ? localUsage(storage, hubs) : [];
  const totalBytes = storage ? totalStorageBytes(storage) : 0;

  const syncNow = async () => {
    if (!storage || mismatch) return;
    setSyncing(true);
    setSyncReport(null);
    const report = await reconcileUp({ storage, hubs });
    if (!readOwner(storage)) writeOwner(storage, user.publicId); // this account now holds it
    setSyncing(false);
    setSyncReport(report);
    setLocalVersion((n) => n + 1);
    setServerAttempt((n) => n + 1);
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

  const exportData = async () => {
    setExporting(true);
    setExportNote(null);
    try {
      const name = await downloadExport();
      setExportNote({ tone: 'success', text: `Downloaded ${name}.` });
    } catch (error) {
      setExportNote({ tone: 'error', text: problemText(error, 'Couldn’t download your data. Try again.') });
    } finally {
      setExporting(false);
    }
  };

  const removeCopy = (hub: SyncHub) => {
    if (storage) removeLocalCopy(storage, hub);
    setRemoving(null);
    setRemovedNote(`The local copy of ${hub.title} was removed. It comes back from your account when you open the hub.`);
    setLocalVersion((n) => n + 1);
  };

  const onDeleted = () => {
    // The server removed everything and cleared the cookies: wipe this browser's hub data too,
    // tell open hub tabs (they stop syncing, wipe and reload), and leave as an anonymous visitor.
    if (storage) wipeKeys(storage, allLegacyKeys(hubs));
    broadcast({ type: 'logout' });
    setSignedOut();
    navigate('/', { replace: true });
  };

  /** Remove-local-copy is offered only when the account already holds every part of the hub. */
  const removable = (hub: SyncHub, unsynced: number): boolean =>
    !mismatch && owner === user.publicId && unsynced === 0 && serverHubs.some((s) => s.hub === hub.id);

  const joined = server.status === 'ready' ? formatDate(server.joined) : null;

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
          {joined && (
            <div>
              <dt>Joined</dt>
              <dd>{joined}</dd>
            </div>
          )}
        </dl>
        <p className="actions">
          <button type="button" className="btn" onClick={() => navigate('/signout')}>
            Sign out
          </button>
          {user.admin && (
            <Link className="btn" to="/admin">
              Admin
            </Link>
          )}
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

      <section className="panel" aria-labelledby="progress-title">
        <h2 id="progress-title">Your progress</h2>
        <p className="muted small">What your account holds next to what this browser holds.</p>
        {(catalog.status === 'loading' || server.status === 'loading') && <BusyLine>Loading progress…</BusyLine>}
        {catalog.status === 'error' && (
          <FormMessage tone="error">
            <p>Couldn’t load the hubs. {catalog.message}</p>
            <button type="button" className="btn btn--small" onClick={retry}>
              Try again
            </button>
          </FormMessage>
        )}
        {server.status === 'error' && (
          <FormMessage tone="error">
            <p>Couldn’t load your account’s progress. {server.message}</p>
            <button type="button" className="btn btn--small" onClick={() => setServerAttempt((n) => n + 1)}>
              Try again
            </button>
          </FormMessage>
        )}
        {catalog.status === 'ready' && server.status !== 'loading' && rows.length === 0 && (
          <p className="muted">No hub progress yet.</p>
        )}
        {rows.length > 0 && (
          <ul className="progress-list">
            {rows.map((row) => (
              <li key={row.key} className="progress-list__row">
                {row.href ? (
                  <a href={row.href} className="progress-list__title">
                    {row.title}
                  </a>
                ) : (
                  <span className="progress-list__title">{row.title}</span>
                )}
                <span className="progress-list__cols">
                  <span className="muted small">
                    Account:{' '}
                    {row.server
                      ? `${row.server.done} done${serverUpdated(row.server) ? `, ${formatDate(serverUpdated(row.server))}` : ''}`
                      : server.status === 'ready'
                        ? 'nothing yet'
                        : '…'}
                  </span>
                  <span className="muted small">
                    This browser:{' '}
                    {row.local ? (row.local.total > 0 ? `${row.local.done} / ${row.local.total} modules` : `${row.local.done} done`) : 'nothing'}
                  </span>
                </span>
                <SyncChip mismatch={mismatch} row={row} />
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

      <section className="panel" aria-labelledby="storage-title">
        <h2 id="storage-title">Browser storage</h2>
        {!storage ? (
          <p className="muted">This browser blocks site storage, so nothing is saved here.</p>
        ) : (
          <>
            <p className="muted small">This site uses {formatBytes(totalBytes)} of this browser’s storage.</p>
            {usage.length === 0 ? (
              <p className="muted">No hub data in this browser.</p>
            ) : (
              <ul className="progress-list">
                {usage.map(({ hub, bytes, unsynced }) => (
                  <li key={hub.id} className="progress-list__row">
                    <span className="progress-list__title">{hub.title}</span>
                    <span className="muted small">{formatBytes(bytes)}</span>
                    {removable(hub, unsynced) ? (
                      <button
                        type="button"
                        className="btn btn--small"
                        aria-label={`Remove local copy of ${hub.title}`}
                        onClick={() => setRemoving(hub)}
                      >
                        Remove local copy
                      </button>
                    ) : (
                      <span className="muted small">{mismatch ? 'Another account’s' : 'Keep: not fully synced'}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {removedNote && <FormMessage tone="success">{removedNote}</FormMessage>}
          </>
        )}
      </section>

      <section className="panel" aria-labelledby="data-title">
        <h2 id="data-title">Your data</h2>
        <p className="muted">
          Download everything your account holds as a JSON file, or delete your account and all of its progress.
        </p>
        <p className="actions">
          <button type="button" className="btn" disabled={exporting} onClick={() => void exportData()}>
            {exporting ? 'Preparing…' : 'Download my data'}
          </button>
          <button type="button" className="btn btn--danger" onClick={() => setDeleteOpen(true)}>
            Delete my account
          </button>
        </p>
        {exportNote && <FormMessage tone={exportNote.tone}>{exportNote.text}</FormMessage>}
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

      {removing && (
        <Dialog
          title={`Remove the local copy of ${removing.title}?`}
          onCancel={() => setRemoving(null)}
          actions={
            <>
              <button type="button" className="btn btn--danger" onClick={() => removeCopy(removing)}>
                Remove
              </button>
              <button type="button" className="btn btn--quiet" onClick={() => setRemoving(null)}>
                Cancel
              </button>
            </>
          }
        >
          <p>
            Your progress stays in your account and comes back the next time you open this hub while signed in. A mock
            exam you haven’t finished is lost.
          </p>
        </Dialog>
      )}

      {deleteOpen && (
        <DeleteAccountDialog
          onCancel={() => setDeleteOpen(false)}
          onReauth={() => navigate(reauthPath('/account'))}
          onDeleted={onDeleted}
        />
      )}
    </section>
  );
}

/** "Delete my account": type DELETE, then `DELETE /api/me`. */
export function DeleteAccountDialog({
  onCancel,
  onReauth,
  onDeleted,
}: {
  onCancel: () => void;
  onReauth: () => void;
  onDeleted: () => void;
}) {
  const [phrase, setPhrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteAccount(phrase.trim());
    } catch (problem) {
      setBusy(false);
      if (isReauth(problem)) onReauth();
      else setError(problemText(problem, 'Couldn’t delete your account. Nothing was changed; try again.'));
      return;
    }
    onDeleted();
  };

  return (
    <Dialog
      title="Delete your account?"
      onCancel={busy ? undefined : onCancel}
      actions={
        <>
          <button type="button" className="btn btn--quiet" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--danger"
            disabled={busy || phrase.trim() !== DELETE_PHRASE}
            onClick={() => void submit()}
          >
            {busy ? 'Deleting…' : 'Delete my account'}
          </button>
        </>
      }
    >
      <p>
        This deletes your account and all progress stored in it, and removes the hub progress saved in this browser. It
        can’t be undone. Download your data first if you want to keep a copy.
      </p>
      <TextField
        label={`Type ${DELETE_PHRASE} to confirm`}
        name="confirm"
        autoComplete="off"
        spellCheck={false}
        value={phrase}
        onChange={(event) => setPhrase(event.target.value)}
      />
      {error && <FormMessage tone="error">{error}</FormMessage>}
    </Dialog>
  );
}

function SyncChip({ mismatch, row }: { mismatch: boolean; row: Row }) {
  if (mismatch && row.local) return <span className="chip-status chip-status--warn">Another account’s</span>;
  if (row.unsynced > 0) return <span className="chip-status chip-status--trap">Not synced yet</span>;
  if (!row.local) return <span className="chip-status chip-status--info">On your account</span>;
  return <span className="chip-status chip-status--good">Synced</span>;
}
