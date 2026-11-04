import { useEffect, useState } from 'react';
import { BusyLine, FormMessage, TextField } from '../../components/forms';
import { formatBytes } from '../../lib/account';
import {
  backupEstimate,
  backupLog,
  backupUrl,
  CONFIRM,
  createBackup,
  formatIn,
  generatePassphrase,
  MIN_PASSPHRASE,
  startDownload,
} from '../../lib/admin-api';
import { fmtNumber, LoadError, useActionError, useLoad } from './shared';
import { IST } from './OverviewTab';

/** How long after a download starts the log is read again (a small backup is done by then). */
export const LOG_REFRESH_MS = 5000;

/** Backup: the estimate, an optional passphrase, read-only maintenance, typed confirmation, the log. */
export function BackupTab() {
  const estimate = useLoad(backupEstimate);
  const log = useLoad(backupLog);
  const onError = useActionError();
  const [encrypt, setEncrypt] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [readOnly, setReadOnly] = useState(true);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [started, setStarted] = useState(0);
  const reloadLog = log.reload;

  useEffect(() => {
    if (!started) return;
    const timer = setTimeout(reloadLog, LOG_REFRESH_MS);
    return () => clearTimeout(timer);
  }, [started, reloadLog]);

  const fits = estimate.state.status === 'ready' ? estimate.state.data.fits : true;
  const passphraseOk = !encrypt || passphrase.length >= MIN_PASSPHRASE;
  const canStart = !busy && fits && passphraseOk && confirm.trim() === CONFIRM.backup;

  const toggleEncrypt = (on: boolean) => {
    setEncrypt(on);
    setPassphrase(on ? generatePassphrase() : '');
  };

  const start = async () => {
    setBusy(true);
    setNote(null);
    try {
      const ticket = await createBackup({
        passphrase: encrypt ? passphrase : null,
        requireReadOnly: readOnly,
        confirm: confirm.trim(),
      });
      startDownload(backupUrl(ticket.ticket), ticket.filename);
      // The passphrase is shown once: it leaves the page now and is never stored anywhere.
      setEncrypt(false);
      setPassphrase('');
      setConfirm('');
      setStarted((n) => n + 1);
      setNote({
        tone: 'success',
        text: `Downloading ${ticket.filename}. Keep this tab open until the download finishes; the log below updates when it is done.`,
      });
    } catch (error) {
      const text = onError(error, 'Couldn’t start the backup.');
      if (text) setNote({ tone: 'error', text });
      estimate.reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-tab">
      <section className="panel" aria-labelledby="bk-estimate">
        <h2 id="bk-estimate">Estimate</h2>
        {estimate.state.status === 'loading' && <BusyLine>Counting…</BusyLine>}
        {estimate.state.status === 'error' && <LoadError message={estimate.state.message} onRetry={estimate.reload} />}
        {estimate.state.status === 'ready' && (
          <>
            <dl className="facts">
              <div>
                <dt>Users</dt>
                <dd>{fmtNumber(estimate.state.data.users)}</dd>
              </div>
              <div>
                <dt>Progress documents</dt>
                <dd>{fmtNumber(estimate.state.data.docs)}</dd>
              </div>
              <div>
                <dt>Deleted-account markers</dt>
                <dd>{fmtNumber(estimate.state.data.tombstones)}</dd>
              </div>
              <div>
                <dt>Reads needed</dt>
                <dd>
                  about {fmtNumber(estimate.state.data.estReads)} of {fmtNumber(estimate.state.data.readsLeftToday)} left today
                </dd>
              </div>
            </dl>
            {!estimate.state.data.fits && (
              <FormMessage tone="error">
                Not enough reads are left today (20% stay in reserve). Try again after the quota reset.
              </FormMessage>
            )}
          </>
        )}
      </section>

      <section className="panel" aria-labelledby="bk-new">
        <h2 id="bk-new">New backup</h2>
        <form
          className="form admin-form"
          aria-labelledby="bk-new"
          onSubmit={(event) => {
            event.preventDefault();
            if (canStart) void start();
          }}
        >
          <div className="checkbox">
            <input id="bk-encrypt" type="checkbox" checked={encrypt} onChange={(event) => toggleEncrypt(event.target.checked)} />
            <label htmlFor="bk-encrypt">Encrypt with a passphrase</label>
          </div>
          {encrypt && (
            <>
              <TextField
                label="Passphrase"
                name="passphrase"
                autoComplete="off"
                spellCheck={false}
                className="mono"
                minLength={MIN_PASSPHRASE}
                value={passphrase}
                onChange={(event) => setPassphrase(event.target.value)}
                hint={`At least ${MIN_PASSPHRASE} characters. A random one is filled in; you can type your own.`}
              />
              <FormMessage tone="error">
                Write this passphrase down now. It is shown only here, is never stored, and can’t be recovered: without
                it the backup can’t be restored.
              </FormMessage>
              <p className="actions">
                <button type="button" className="btn btn--small" onClick={() => setPassphrase(generatePassphrase())}>
                  Generate another
                </button>
              </p>
            </>
          )}
          <div className="checkbox">
            <input id="bk-readonly" type="checkbox" checked={readOnly} onChange={(event) => setReadOnly(event.target.checked)} />
            <label htmlFor="bk-readonly">Use read-only maintenance during backup</label>
          </div>
          <p className="field__hint">
            Sync pauses while the backup runs (hubs keep saving in the browser), so the file is a consistent snapshot.
            The previous mode comes back afterwards.
          </p>
          <TextField
            label={`Type ${CONFIRM.backup} to confirm`}
            name="confirm"
            autoComplete="off"
            spellCheck={false}
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
          <button type="submit" className="btn btn--primary" disabled={!canStart}>
            {busy ? 'Starting…' : 'Create backup and download'}
          </button>
        </form>
        {note && <FormMessage tone={note.tone}>{note.text}</FormMessage>}
      </section>

      <section className="panel" aria-labelledby="bk-log">
        <h2 id="bk-log">Backup log</h2>
        {log.state.status === 'loading' && <BusyLine>Loading…</BusyLine>}
        {log.state.status === 'error' && <LoadError message={log.state.message} onRetry={log.reload} />}
        {log.state.status === 'ready' && log.state.data.length === 0 && <p className="muted">No backups yet.</p>}
        {log.state.status === 'ready' && log.state.data.length > 0 && (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Size</th>
                  <th scope="col">Records</th>
                  <th scope="col">Encrypted</th>
                  <th scope="col">Consistent</th>
                  <th scope="col">SHA-256</th>
                </tr>
              </thead>
              <tbody>
                {log.state.data.map((entry) => (
                  <tr key={`${entry.at}-${entry.fileSha256}`}>
                    <td>{formatIn(entry.at, IST)}</td>
                    <td>{formatBytes(entry.bytes)}</td>
                    <td>
                      {fmtNumber(entry.counts.user ?? 0)} users, {fmtNumber(entry.counts.progress ?? 0)} progress
                    </td>
                    <td>{entry.encrypted ? 'yes' : 'no'}</td>
                    <td>{entry.consistent ? 'yes' : 'no'}</td>
                    <td>
                      <code className="admin-hash" title={entry.fileSha256}>
                        {entry.fileSha256}
                      </code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="actions">
          <button type="button" className="btn btn--small" onClick={log.reload}>
            Refresh log
          </button>
        </p>
      </section>
    </div>
  );
}
