import { useEffect, useState } from 'react';
import { Dialog } from '../../components/Dialog';
import { BusyLine, FormMessage, TextField } from '../../components/forms';
import {
  cancelJob,
  CONFIRM,
  createJob,
  formatIn,
  getMaintenance,
  getSettings,
  listJobs,
  MAX_MESSAGE,
  MODE_LABEL,
  MODES,
  putMaintenance,
  type Job,
  type MaintenanceState,
  type Mode,
} from '../../lib/admin-api';
import { isApiProblem } from '../../lib/api';
import { LoadError, StateChip, useActionError, useLoad } from './shared';

const MODE_HELP: Record<Mode, string> = {
  off: 'Everything works normally.',
  read_only: 'Sync pauses: hubs keep saving in the browser and catch up afterwards. Pages and downloads still work.',
  full: 'Every account API answers 503 maintenance, sign-in included. Hubs still work offline.',
};

/** Maintenance & schedule: the current mode, setting it, scheduling a window, the jobs list. */
export function MaintenanceTab() {
  const maintenance = useLoad(getMaintenance);
  const settings = useLoad(getSettings);
  const jobs = useLoad(listJobs);
  const tz = settings.state.status === 'ready' ? settings.state.data.tz : 'Asia/Kolkata';

  return (
    <div className="admin-tab">
      <section className="panel" aria-labelledby="mt-mode">
        <h2 id="mt-mode">Maintenance mode</h2>
        {maintenance.state.status === 'loading' && <BusyLine>Loading…</BusyLine>}
        {maintenance.state.status === 'error' && <LoadError message={maintenance.state.message} onRetry={maintenance.reload} />}
        {maintenance.state.status === 'ready' && (
          <ModeForm current={maintenance.state.data} tz={tz} onSaved={maintenance.set} onConflict={maintenance.reload} />
        )}
      </section>

      <section className="panel" aria-labelledby="mt-schedule">
        <h2 id="mt-schedule">Schedule a window</h2>
        <ScheduleForm
          tz={tz}
          onCreated={() => {
            jobs.reload();
            maintenance.reload();
          }}
        />
      </section>

      <section className="panel" aria-labelledby="mt-jobs">
        <h2 id="mt-jobs">Scheduled jobs</h2>
        {jobs.state.status === 'loading' && <BusyLine>Loading…</BusyLine>}
        {jobs.state.status === 'error' && <LoadError message={jobs.state.message} onRetry={jobs.reload} />}
        {jobs.state.status === 'ready' && (
          <JobsList
            jobs={jobs.state.data}
            tz={tz}
            onChanged={() => {
              jobs.reload();
              maintenance.reload();
            }}
          />
        )}
        <p className="actions">
          <button
            type="button"
            className="btn btn--small"
            onClick={() => {
              jobs.reload();
              maintenance.reload();
            }}
          >
            Refresh
          </button>
        </p>
      </section>
    </div>
  );
}

function ModeForm({
  current,
  tz,
  onSaved,
  onConflict,
}: {
  current: MaintenanceState;
  tz: string;
  onSaved: (state: MaintenanceState) => void;
  onConflict: () => void;
}) {
  const onError = useActionError();
  const [mode, setMode] = useState<Mode>((current.stored.mode as Mode) ?? 'off');
  const [message, setMessage] = useState(current.stored.message ?? '');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  // A reload (after a conflict or a scheduled change) shows the server's values again.
  useEffect(() => {
    setMode((current.stored.mode as Mode) ?? 'off');
    setMessage(current.stored.message ?? '');
  }, [current]);

  const needsConfirm = mode === 'full' && current.stored.mode !== 'full';
  const canSave = !busy && (!needsConfirm || confirm.trim() === CONFIRM.full);

  const save = async () => {
    setBusy(true);
    setNote(null);
    try {
      const saved = await putMaintenance({
        mode,
        message: message.trim() || null,
        version: current.version,
        ...(needsConfirm ? { confirm: confirm.trim() } : {}),
      });
      setConfirm('');
      onSaved(saved);
      setNote({ tone: 'success', text: `Maintenance is now ${MODE_LABEL[saved.mode] ?? saved.mode}.` });
    } catch (error) {
      const text = onError(error, 'Couldn’t change the mode.');
      if (text) setNote({ tone: 'error', text });
      if (isApiProblem(error) && error.code === 'conflict') onConflict();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <p>
        Now: <strong data-testid="maintenance-mode">{MODE_LABEL[current.mode] ?? current.mode}</strong>
        {current.message ? ` (“${current.message}”)` : ''}
        {current.until ? `, until ${formatIn(current.until, tz)}` : ''}.
      </p>
      {current.forced && (
        <FormMessage tone="info">
          MAINTENANCE_FORCE is set on the server: it overrides the mode saved here until it is removed.
        </FormMessage>
      )}
      {current.upcoming && (
        <FormMessage tone="info">
          A {MODE_LABEL[current.upcoming.mode] ?? current.upcoming.mode} window starts at {formatIn(current.upcoming.startAt, tz)}.
        </FormMessage>
      )}
      <form
        className="form admin-form"
        aria-labelledby="mt-mode"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSave) void save();
        }}
      >
        <fieldset className="admin-radios">
          <legend>Mode</legend>
          {MODES.map((value) => (
            <div key={value} className="checkbox">
              <input
                id={`mt-mode-${value}`}
                type="radio"
                name="mode"
                value={value}
                checked={mode === value}
                onChange={() => setMode(value)}
              />
              <label htmlFor={`mt-mode-${value}`}>
                <strong>{MODE_LABEL[value]}</strong> <span className="muted small">{MODE_HELP[value]}</span>
              </label>
            </div>
          ))}
        </fieldset>
        <TextField
          label="Message for learners (optional)"
          name="message"
          maxLength={MAX_MESSAGE}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />
        {needsConfirm && (
          <TextField
            label={`Type ${CONFIRM.full} to confirm`}
            name="confirm"
            autoComplete="off"
            spellCheck={false}
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
        )}
        <button type="submit" className="btn btn--primary" disabled={!canSave}>
          {busy ? 'Saving…' : 'Set mode'}
        </button>
      </form>
      {note && <FormMessage tone={note.tone}>{note.text}</FormMessage>}
    </>
  );
}

function ScheduleForm({ tz, onCreated }: { tz: string; onCreated: () => void }) {
  const onError = useActionError();
  const [mode, setMode] = useState<'read_only' | 'full'>('read_only');
  const [when, setWhen] = useState<'tonight' | 'at'>('tonight');
  const [at, setAt] = useState('');
  const [duration, setDuration] = useState('60');
  const [message, setMessage] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  const minutes = Number(duration);
  const validDuration = Number.isInteger(minutes) && minutes >= 1 && minutes <= 1440;
  const canSchedule =
    !busy && validDuration && (when === 'tonight' || at !== '') && (mode !== 'full' || confirm.trim() === CONFIRM.full);

  const schedule = async () => {
    setBusy(true);
    setNote(null);
    try {
      const job = await createJob({
        mode,
        startAt: when === 'tonight' ? 'tonight' : at,
        tz,
        durationMin: minutes,
        message: message.trim() || null,
        ...(mode === 'full' ? { confirm: confirm.trim() } : {}),
      });
      setConfirm('');
      setNote({
        tone: 'success',
        text: `Scheduled: ${MODE_LABEL[job.mode] ?? job.mode} from ${formatIn(job.startAt, job.tz)} for ${job.durationMin} min.`,
      });
      onCreated();
    } catch (error) {
      const text = onError(error, 'Couldn’t schedule the window.');
      if (text) setNote({ tone: 'error', text });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <form
        className="form admin-form"
        aria-labelledby="mt-schedule"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSchedule) void schedule();
        }}
      >
        <div className="field">
          <label htmlFor="sc-mode">Mode</label>
          <select id="sc-mode" value={mode} onChange={(event) => setMode(event.target.value as 'read_only' | 'full')}>
            <option value="read_only">Read-only</option>
            <option value="full">Full</option>
          </select>
        </div>
        <fieldset className="admin-radios">
          <legend>Start (time zone {tz})</legend>
          <div className="checkbox">
            <input id="sc-tonight" type="radio" name="when" checked={when === 'tonight'} onChange={() => setWhen('tonight')} />
            <label htmlFor="sc-tonight">Tonight 00:00</label>
          </div>
          <div className="checkbox">
            <input id="sc-at" type="radio" name="when" checked={when === 'at'} onChange={() => setWhen('at')} />
            <label htmlFor="sc-at">At a date and time</label>
          </div>
        </fieldset>
        {when === 'at' && (
          <TextField
            label={`Start (${tz})`}
            type="datetime-local"
            name="startAt"
            required
            value={at}
            onChange={(event) => setAt(event.target.value)}
          />
        )}
        <TextField
          label="Duration (minutes)"
          type="number"
          name="durationMin"
          min={1}
          max={1440}
          required
          value={duration}
          onChange={(event) => setDuration(event.target.value)}
        />
        <TextField
          label="Message for learners (optional)"
          name="message"
          maxLength={MAX_MESSAGE}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />
        {mode === 'full' && (
          <TextField
            label={`Type ${CONFIRM.full} to confirm`}
            name="confirm"
            autoComplete="off"
            spellCheck={false}
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
        )}
        <button type="submit" className="btn btn--primary" disabled={!canSchedule}>
          {busy ? 'Scheduling…' : 'Schedule window'}
        </button>
      </form>
      {note && <FormMessage tone={note.tone}>{note.text}</FormMessage>}
    </>
  );
}

function JobsList({ jobs, tz, onChanged }: { jobs: Job[]; tz: string; onChanged: () => void }) {
  const onError = useActionError();
  const [cancelling, setCancelling] = useState<Job | null>(null);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (jobs.length === 0) return <p className="muted">No jobs yet.</p>;

  const close = () => {
    setCancelling(null);
    setConfirm('');
    setError(null);
  };

  const doCancel = async (job: Job) => {
    setBusy(true);
    setError(null);
    try {
      await cancelJob(job.id, confirm.trim());
      close();
      onChanged();
    } catch (problem) {
      const text = onError(problem, 'Couldn’t cancel the job.');
      if (text) setError(text);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">Mode</th>
              <th scope="col">Start</th>
              <th scope="col">Length</th>
              <th scope="col">State</th>
              <th scope="col">Message</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id}>
                <td>{MODE_LABEL[job.mode] ?? job.mode}</td>
                <td>{formatIn(job.startAt, job.tz || tz)}</td>
                <td>{job.durationMin} min</td>
                <td>
                  <StateChip state={job.state} />
                </td>
                <td>{job.message ?? '—'}</td>
                <td>
                  {(job.state === 'scheduled' || job.state === 'running') && (
                    <button
                      type="button"
                      className="btn btn--small"
                      aria-label={`Cancel the ${MODE_LABEL[job.mode] ?? job.mode} window at ${formatIn(job.startAt, job.tz || tz)}`}
                      onClick={() => setCancelling(job)}
                    >
                      Cancel
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {cancelling && (
        <Dialog
          title="Cancel this window?"
          onCancel={busy ? undefined : close}
          actions={
            <>
              <button type="button" className="btn btn--quiet" disabled={busy} onClick={close}>
                Keep it
              </button>
              <button
                type="button"
                className="btn btn--danger"
                disabled={busy || confirm.trim() !== CONFIRM.cancel}
                onClick={() => void doCancel(cancelling)}
              >
                {busy ? 'Cancelling…' : 'Cancel window'}
              </button>
            </>
          }
        >
          <p>
            {MODE_LABEL[cancelling.mode] ?? cancelling.mode} from {formatIn(cancelling.startAt, cancelling.tz || tz)} for{' '}
            {cancelling.durationMin} min.{' '}
            {cancelling.state === 'running' ? 'It is running now: the previous mode comes back at once.' : ''}
          </p>
          <TextField
            label={`Type ${CONFIRM.cancel} to confirm`}
            name="confirm"
            autoComplete="off"
            spellCheck={false}
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
          {error && <FormMessage tone="error">{error}</FormMessage>}
        </Dialog>
      )}
    </>
  );
}
