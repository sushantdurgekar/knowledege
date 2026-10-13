import { useState } from 'react';
import { Link } from 'react-router';
import { BusyLine, FormMessage } from '../../components/forms';
import { formatBytes } from '../../lib/account';
import { formatIn, getStats, MODE_LABEL, recount, type Stats } from '../../lib/admin-api';
import { fmtNumber, LoadError, Meter, useActionError, useLoad } from './shared';

export const IST = 'Asia/Kolkata';
export const PACIFIC = 'America/Los_Angeles';

/** Overview: today's meters, the next quota reset (IST and Pacific), users and the last backup. */
export function OverviewTab() {
  const { state, reload, set } = useLoad(getStats);
  const onError = useActionError();
  const [recounting, setRecounting] = useState(false);
  const [note, setNote] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  if (state.status === 'loading') return <BusyLine>Loading the numbers…</BusyLine>;
  if (state.status === 'error') return <LoadError message={state.message} onRetry={reload} />;
  const stats = state.data;
  const fs = stats.firestore;
  const tz = stats.quotaDay.tz || stats.adminTz || IST;

  const doRecount = async () => {
    setRecounting(true);
    setNote(null);
    try {
      const { storage } = await recount();
      set({ ...stats, firestore: { ...fs, storage: { ...fs.storage, ...storage } } });
      setNote({ tone: 'success', text: 'Storage recounted.' });
    } catch (error) {
      const text = onError(error, 'Couldn’t recount the storage.');
      if (text) setNote({ tone: 'error', text });
    } finally {
      setRecounting(false);
    }
  };

  return (
    <div className="admin-tab">
      {(stats.missedJobs ?? []).length > 0 && (
        <FormMessage tone="error">
          <p>
            {stats.missedJobs!.length === 1 ? 'A scheduled maintenance window was missed' : 'Scheduled maintenance windows were missed'}{' '}
            (the server was not running at its start time):{' '}
            {stats.missedJobs!.map((job) => `${MODE_LABEL[job.mode] ?? job.mode} at ${formatIn(job.startAt, job.tz || tz)}`).join('; ')}.{' '}
            <Link to="/admin/maintenance">See the schedule</Link>
          </p>
        </FormMessage>
      )}
      {stats.maintenance.mode !== 'off' && (
        <FormMessage tone="info">
          Maintenance is on: <strong>{MODE_LABEL[stats.maintenance.mode] ?? stats.maintenance.mode}</strong>
          {stats.maintenance.forced ? ' (forced by MAINTENANCE_FORCE)' : ''}.
        </FormMessage>
      )}

      <section className="panel" aria-labelledby="ov-today">
        <h2 id="ov-today">Firestore today</h2>
        <p className="muted small">
          Quota day {stats.quotaDay.day}. Next reset: {formatIn(stats.quotaDay.resetsAt, IST)} ·{' '}
          {formatIn(stats.quotaDay.resetsAt, PACIFIC)}.
        </p>
        <div className="admin-meters">
          <Meter
            label="Writes"
            used={fs.writes.used}
            limit={fs.writes.limit}
            text={`${fmtNumber(fs.writes.used)} / ${fmtNumber(fs.writes.limit)} (sync budget ${fmtNumber(fs.writes.budget)}, tier ${fs.writes.tier})`}
          />
          <Meter label="Reads" used={fs.reads.used} limit={fs.reads.limit} text={`${fmtNumber(fs.reads.used)} / ${fmtNumber(fs.reads.limit)}`} />
          <Meter
            label="Deletes"
            used={fs.deletes.used}
            limit={fs.deletes.limit}
            text={`${fmtNumber(fs.deletes.used)} / ${fmtNumber(fs.deletes.limit)}`}
          />
        </div>
      </section>

      <section className="panel" aria-labelledby="ov-month">
        <h2 id="ov-month">Storage and this month</h2>
        <div className="admin-meters">
          <Meter
            label="Stored data (estimate)"
            used={fs.storage.estBytes ?? 0}
            limit={fs.storage.limit}
            text={
              fs.storage.estBytes === null
                ? 'not counted yet'
                : `${formatBytes(fs.storage.estBytes)} / ${formatBytes(fs.storage.limit)}${fs.storage.asOf ? `, as of ${formatIn(fs.storage.asOf, tz)}` : ''}`
            }
          />
          <Meter
            label="Firestore egress"
            used={fs.egressMonth.bytes}
            limit={fs.egressMonth.limit}
            text={`${formatBytes(fs.egressMonth.bytes)} / ${formatBytes(fs.egressMonth.limit)}`}
          />
          <Meter
            label="Host egress"
            used={stats.host.egressMonth.bytes}
            limit={stats.host.egressMonth.limit}
            text={`${formatBytes(stats.host.egressMonth.bytes)} / ${formatBytes(stats.host.egressMonth.limit)}`}
          />
          {stats.host.rssBytes !== null && (
            <Meter
              label="Server memory"
              used={stats.host.rssBytes}
              limit={stats.host.ramLimit}
              text={`${formatBytes(stats.host.rssBytes)} / ${formatBytes(stats.host.ramLimit)}`}
            />
          )}
        </div>
        <p className="actions">
          <button type="button" className="btn btn--small" disabled={recounting} onClick={() => void doRecount()}>
            {recounting ? 'Recounting…' : 'Recount storage'}
          </button>
          <span className="muted small">Reads every progress document once; refused above 20% of today’s reads.</span>
        </p>
        {note && <FormMessage tone={note.tone}>{note.text}</FormMessage>}
      </section>

      <section className="panel" aria-labelledby="ov-site">
        <h2 id="ov-site">Site</h2>
        <dl className="facts">
          <div>
            <dt>Users</dt>
            <dd>{fmtNumber(stats.users)}</dd>
          </div>
          <div>
            <dt>Store</dt>
            <dd>{stats.store}</dd>
          </div>
          <div>
            <dt>Sync tier</dt>
            <dd>{String(stats.tier)}</dd>
          </div>
          <div>
            <dt>Maintenance</dt>
            <dd>{MODE_LABEL[stats.maintenance.mode] ?? stats.maintenance.mode}</dd>
          </div>
          <div>
            <dt>Next windows</dt>
            <dd>
              {stats.jobs.length === 0
                ? 'none scheduled'
                : stats.jobs
                    .slice(0, 3)
                    .map((job) => `${MODE_LABEL[job.mode] ?? job.mode} ${formatIn(job.startAt, job.tz || tz)} (${job.state})`)
                    .join('; ')}
            </dd>
          </div>
          <div>
            <dt>Last backup</dt>
            <dd>{stats.lastBackup ? <LastBackup stats={stats} tz={tz} /> : 'none yet'}</dd>
          </div>
        </dl>
        <p className="actions">
          <button type="button" className="btn btn--small" onClick={reload}>
            Refresh
          </button>
        </p>
      </section>
    </div>
  );
}

function LastBackup({ stats, tz }: { stats: Stats; tz: string }) {
  const last = stats.lastBackup!;
  return (
    <>
      {formatIn(last.at, tz)}, {formatBytes(last.bytes)}, {last.encrypted ? 'encrypted' : 'not encrypted'},{' '}
      {last.consistent ? 'consistent' : 'taken while writes were open'}
    </>
  );
}
