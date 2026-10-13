// Restore (build-contracts.md §25): a wizard over the restore API (§24).
//   1. pick a .backup file (its header is read in the browser: the first 64 KiB)
//   2. upload it in 4 MiB chunks with SHA-256, resumable after a reload
//   3. validate it on the server (passphrase if encrypted) and show the plan
//   4. choose the mode (merge | replace) and the time (now | tonight | after the quota reset)
//   5. type the confirmation phrase
//   6. watch the job; cancel it while it is still scheduled
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Dialog } from '../../components/Dialog';
import { BusyLine, FormMessage, TextField } from '../../components/forms';
import { formatBytes } from '../../lib/account';
import { cancelJob, CONFIRM, formatIn, getStats, listJobs } from '../../lib/admin-api';
import { isApiProblem } from '../../lib/api';
import {
  ACTIVE_JOB_STATES,
  type BackupHeader,
  confirmPhrase,
  createRestoreJob,
  createUpload,
  deleteUpload,
  fileKey,
  getRestoreJob,
  getUpload,
  listUploads,
  loadSaved,
  POLL,
  readHeader,
  receivedBytes,
  type RestoreJob,
  type RestoreMode,
  type RunAt,
  type Saved,
  saveSaved,
  type Upload,
  uploadMissing,
  validateUpload,
  type ValidationReport,
} from '../../lib/restore';
import { IST, PACIFIC } from './OverviewTab';
import { fmtNumber, LoadError, StateChip, useActionError, useLoad } from './shared';

const STEPS = ['Pick a file', 'Upload', 'Validate', 'Choose', 'Confirm', 'Watch the job'];
const RESUME_AFTER_RESET_MS = 5 * 60_000;

interface Context {
  upload: Upload | null;
  job: RestoreJob | null;
  adminTz: string;
  quotaResetsAt: string | null;
}

async function loadContext(signal: AbortSignal): Promise<Context> {
  const [uploads, jobs, stats] = await Promise.all([listUploads(signal), listJobs(signal), getStats(signal)]);
  const saved = loadSaved();
  const restores = jobs.filter((job) => job.kind === 'restore') as unknown as RestoreJob[];
  const job =
    restores.find((j) => ACTIVE_JOB_STATES.includes(j.state)) ?? restores.find((j) => j.id === saved.jobId) ?? null;
  return {
    upload: uploads[0] ?? null,
    job,
    adminTz: stats.adminTz || stats.quotaDay?.tz || IST,
    quotaResetsAt: stats.quotaDay?.resetsAt ?? null,
  };
}

export function RestoreTab() {
  const { state, reload } = useLoad(loadContext);
  return (
    <div className="admin-tab">
      <section className="panel" aria-labelledby="rs-title">
        <h2 id="rs-title">Restore from a backup</h2>
        <p className="muted small">
          The site goes into full maintenance while a restore runs (hubs keep saving in the browser). Upload, validate and
          run the restore in one sitting where the server’s disk is temporary (Render free).
        </p>
        {state.status === 'loading' && <BusyLine>Loading…</BusyLine>}
        {state.status === 'error' && <LoadError message={state.message} onRetry={reload} />}
        {state.status === 'ready' && <Wizard context={state.data} onRestart={reload} />}
      </section>
    </div>
  );
}

function Wizard({ context, onRestart }: { context: Context; onRestart: () => void }) {
  const onError = useActionError();
  const [saved, setSaved] = useState<Saved>(loadSaved);
  const [upload, setUpload] = useState<Upload | null>(context.upload);
  const [job, setJob] = useState<RestoreJob | null>(context.job);
  const [file, setFile] = useState<File | null>(null);
  const [header, setHeader] = useState<BackupHeader | null>(null);
  const [uploading, setUploading] = useState(false);
  const [note, setNote] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);
  // A reload ("Start a new restore") brings the server's view: the upload and job it has now.
  useEffect(() => {
    setUpload(context.upload);
    setJob(context.job);
  }, [context]);

  const remember = (next: Saved) => {
    setSaved(next);
    saveSaved(next);
  };
  // The header: read from the picked file, else remembered for this upload, else the server's (after validation).
  const knownHeader =
    header ?? (upload && saved.uploadId === upload.uploadId ? saved.header : undefined) ?? upload?.header ?? null;

  const step = job ? 6 : !upload ? 1 : upload.state === 'uploading' ? 2 : upload.state === 'validated' ? 4 : 3;

  const pick = async (picked: File | null) => {
    setNote(null);
    setFile(null);
    setHeader(null);
    if (!picked) return;
    if (upload && fileKey(picked) !== fileKey(upload)) {
      setNote({ tone: 'error', text: `That isn’t ${upload.name}. Pick the same file to resume, or discard this upload.` });
      return;
    }
    try {
      setHeader(await readHeader(picked));
      setFile(picked);
    } catch (error) {
      setNote({ tone: 'error', text: error instanceof Error ? error.message : 'Couldn’t read this file.' });
    }
  };

  const startUpload = async (source: File) => {
    const controller = new AbortController();
    abort.current?.abort();
    abort.current = controller;
    setUploading(true);
    setNote(null);
    try {
      let current = upload && fileKey(upload) === fileKey(source) ? upload : await createUpload(source);
      remember({ key: fileKey(source), uploadId: current.uploadId, header: header ?? knownHeader ?? undefined });
      setUpload(current);
      current = await uploadMissing(source, current, {
        signal: controller.signal,
        onProgress: (next) => {
          if (!controller.signal.aborted) setUpload(next);
        },
      });
      if (!controller.signal.aborted) setUpload(current);
    } catch (error) {
      if (controller.signal.aborted) return;
      const text = onError(error, 'The upload stopped.');
      if (text) setNote({ tone: 'error', text: `${text} Pick the file again to resume where it stopped.` });
    } finally {
      if (abort.current === controller) {
        abort.current = null;
        setUploading(false);
      }
    }
  };

  const pause = () => {
    abort.current?.abort();
    abort.current = null;
    setUploading(false);
    setNote({ tone: 'info', text: 'Upload paused. The chunks sent so far are kept on the server.' });
  };

  const discard = async () => {
    if (!upload) return;
    abort.current?.abort();
    setNote(null);
    try {
      await deleteUpload(upload.uploadId);
    } catch (error) {
      if (!(isApiProblem(error) && error.status === 404)) {
        const text = onError(error, 'Couldn’t discard the upload.');
        if (text) setNote({ tone: 'error', text });
        return;
      }
    }
    remember({});
    setUpload(null);
    setFile(null);
    setHeader(null);
    setUploading(false);
  };

  const restart = () => {
    remember({});
    setJob(null);
    setUpload(null);
    setFile(null);
    setHeader(null);
    onRestart();
  };

  return (
    <>
      <ol className="restore-steps" aria-label="Steps">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const current = n === step || (step === 4 && n === 5);
          return (
            <li key={label} aria-current={current ? 'step' : undefined} data-done={n < step ? 'true' : undefined}>
              {label}
            </li>
          );
        })}
      </ol>

      {step === 1 && (
        <PickStep file={file} header={header} busy={uploading} onPick={pick} onUpload={() => file && void startUpload(file)} />
      )}
      {step === 2 && upload && (
        <UploadStep
          upload={upload}
          file={file}
          uploading={uploading}
          onPick={pick}
          onResume={() => file && void startUpload(file)}
          onPause={pause}
          onDiscard={discard}
        />
      )}
      {step === 3 && upload && (
        <ValidateStep upload={upload} header={knownHeader} onChange={setUpload} onDiscard={discard} />
      )}
      {step === 4 && upload?.report && (
        <ChooseStep
          upload={upload}
          report={upload.report}
          adminTz={context.adminTz}
          quotaResetsAt={context.quotaResetsAt}
          onDiscard={discard}
          onStarted={(created) => {
            remember({ ...saved, jobId: created.id });
            setJob(created);
          }}
        />
      )}
      {step === 6 && job && <JobStep job={job} adminTz={context.adminTz} onChange={setJob} onRestart={restart} />}
      {note && <FormMessage tone={note.tone}>{note.text}</FormMessage>}
    </>
  );
}

// --- 1. pick ------------------------------------------------------------------------------------

function FileInput({ label, onPick, disabled }: { label: string; onPick: (file: File | null) => void; disabled?: boolean }) {
  return (
    <div className="field">
      <label htmlFor="rs-file">{label}</label>
      <input
        id="rs-file"
        type="file"
        accept=".backup"
        disabled={disabled}
        onChange={(event) => void onPick(event.target.files?.[0] ?? null)}
      />
    </div>
  );
}

function PickStep(props: {
  file: File | null;
  header: BackupHeader | null;
  busy: boolean;
  onPick: (file: File | null) => void;
  onUpload: () => void;
}) {
  const { file, header, busy, onPick, onUpload } = props;
  return (
    <div className="admin-form">
      <FileInput label="Backup file (.backup)" onPick={onPick} disabled={busy} />
      {file && header && (
        <>
          <HeaderFacts header={header} size={file.size} />
          <p className="actions">
            <button type="button" className="btn btn--primary" disabled={busy} onClick={onUpload}>
              {busy ? 'Starting…' : `Upload ${file.name}`}
            </button>
          </p>
        </>
      )}
    </div>
  );
}

function HeaderFacts({ header, size }: { header: BackupHeader; size?: number }) {
  const source = [header.source.store, header.source.project, header.source.origin].filter(Boolean).join(' · ');
  const est = header.estimated;
  return (
    <dl className="facts" aria-label="Backup header">
      <div>
        <dt>Source</dt>
        <dd>{source || '—'}</dd>
      </div>
      <div>
        <dt>Created</dt>
        <dd>{formatIn(header.createdAt, IST)}</dd>
      </div>
      <div>
        <dt>Encrypted</dt>
        <dd>{header.encrypted ? 'yes (passphrase needed)' : 'no'}</dd>
      </div>
      <div>
        <dt>Estimated</dt>
        <dd>
          {fmtNumber(est.user)} users, {fmtNumber(est.progress)} progress documents
          {header.consistent ? '' : ' (taken without read-only maintenance)'}
        </dd>
      </div>
      {size !== undefined && (
        <div>
          <dt>Size</dt>
          <dd>{formatBytes(size)}</dd>
        </div>
      )}
    </dl>
  );
}

// --- 2. upload ----------------------------------------------------------------------------------

function ProgressBar({ label, done, total, text }: { label: string; done: number; total: number; text: ReactNode }) {
  const pct = total > 0 ? Math.min(100, (done / total) * 100) : 0;
  return (
    <div className="admin-meter">
      <div className="admin-meter__head">
        <span className="admin-meter__label">{label}</span>
        <span className="admin-meter__value">{text}</span>
      </div>
      <div
        className="admin-progress"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={Math.min(done, total)}
        aria-valuetext={`${Math.floor(pct)}%`}
      >
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function UploadStep(props: {
  upload: Upload;
  file: File | null;
  uploading: boolean;
  onPick: (file: File | null) => void;
  onResume: () => void;
  onPause: () => void;
  onDiscard: () => void;
}) {
  const { upload, file, uploading, onPick, onResume, onPause, onDiscard } = props;
  const sent = receivedBytes(upload);
  return (
    <div className="admin-form">
      <ProgressBar
        label={`Uploading ${upload.name}`}
        done={sent}
        total={upload.size}
        text={`${formatBytes(sent)} of ${formatBytes(upload.size)} (${upload.received.length}/${upload.chunks} chunks)`}
      />
      {!uploading && !file && (
        <FileInput label={`Pick ${upload.name} again to resume`} onPick={onPick} />
      )}
      <p className="actions">
        {uploading ? (
          <button type="button" className="btn btn--small" onClick={onPause}>
            Pause
          </button>
        ) : (
          file && (
            <button type="button" className="btn btn--primary" onClick={onResume}>
              Resume upload
            </button>
          )
        )}
        <button type="button" className="btn btn--quiet btn--small" onClick={() => void onDiscard()}>
          Discard upload
        </button>
      </p>
    </div>
  );
}

// --- 3. validate --------------------------------------------------------------------------------

function ValidateStep(props: {
  upload: Upload;
  header: BackupHeader | null;
  onChange: (upload: Upload) => void;
  onDiscard: () => void;
}) {
  const { upload, header, onChange, onDiscard } = props;
  const onError = useActionError();
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const validating = upload.state === 'validating';
  const encrypted = header?.encrypted ?? null;

  useEffect(() => {
    if (!validating) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      getUpload(upload.uploadId, controller.signal).then(
        (next) => !controller.signal.aborted && (next.state === 'validating' ? setTick((n) => n + 1) : onChange(next)),
        () => !controller.signal.aborted && setTick((n) => n + 1),
      );
    }, POLL.validateMs);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [validating, upload.uploadId, tick, onChange]);

  const validate = async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await validateUpload(upload.uploadId, passphrase || null);
      setPassphrase(''); // the server dropped it after use; so does the page
      onChange(next);
    } catch (problem) {
      const text = onError(problem, 'Couldn’t start the validation.');
      if (text) setError(text);
    } finally {
      setBusy(false);
    }
  };

  if (validating) {
    return <BusyLine>Validating {upload.name}: checking every record and comparing it with this site…</BusyLine>;
  }
  return (
    <form
      className="form admin-form"
      aria-label="Validate"
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy && (encrypted !== true || passphrase)) void validate();
      }}
    >
      <p>
        <strong>{upload.name}</strong> is uploaded ({formatBytes(upload.size)}).
      </p>
      {header && <HeaderFacts header={header} />}
      {upload.state === 'invalid' && (
        <FormMessage tone="error">
          <p>The backup is not valid: {upload.error ?? 'unknown error'}. Nothing was written.</p>
        </FormMessage>
      )}
      {encrypted !== false && (
        <TextField
          label={encrypted ? 'Passphrase' : 'Passphrase (only if the file is encrypted)'}
          name="passphrase"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={passphrase}
          onChange={(event) => setPassphrase(event.target.value)}
          hint="Sent once for this validation; it is never stored."
        />
      )}
      <p className="actions">
        <button type="submit" className="btn btn--primary" disabled={busy || (encrypted === true && !passphrase)}>
          {busy ? 'Starting…' : upload.state === 'invalid' ? 'Validate again' : 'Validate'}
        </button>
        <button type="button" className="btn btn--quiet btn--small" onClick={() => void onDiscard()}>
          Discard upload
        </button>
      </p>
      {error && <FormMessage tone="error">{error}</FormMessage>}
    </form>
  );
}

// --- 4-5. choose and confirm --------------------------------------------------------------------

function PlanReport({ report }: { report: ValidationReport }) {
  const { plan, counts, target } = report;
  const skipped = plan.skipped;
  return (
    <>
      <dl className="facts" aria-label="Validation report">
        <div>
          <dt>Records</dt>
          <dd>
            {fmtNumber(report.records)}: {fmtNumber(counts.user ?? 0)} users, {fmtNumber(counts.progress ?? 0)} progress parts,{' '}
            {fmtNumber(counts.tombstone ?? 0)} deleted-account markers
          </dd>
        </div>
        <div>
          <dt>This site now</dt>
          <dd>
            {target.store}: {fmtNumber(target.users)} users, {fmtNumber(target.progress)} progress documents
          </dd>
        </div>
      </dl>
      <div className="admin-table-wrap">
        <table className="admin-table" aria-label="Plan">
          <tbody>
            {plan.compared && plan.users && plan.progress ? (
              <>
                <tr>
                  <th scope="row">Users</th>
                  <td>
                    {fmtNumber(plan.users.new)} new, {fmtNumber(plan.users.existing)} already here
                  </td>
                </tr>
                <tr>
                  <th scope="row">Progress parts</th>
                  <td>
                    {fmtNumber(plan.progress.newer)} newer in the backup (written), {fmtNumber(plan.progress.older)} older (this
                    site’s copy kept), {fmtNumber(plan.progress.identical)} identical
                  </td>
                </tr>
              </>
            ) : (
              <tr>
                <th scope="row">Compared</th>
                <td>Not compared with this site (it would use too many of today’s reads); estimated from the counts.</td>
              </tr>
            )}
            <tr>
              <th scope="row">Skipped</th>
              <td>
                deleted accounts: {fmtNumber(skipped.tombstonedInBackup.user + skipped.tombstonedInTarget.user)} users,{' '}
                {fmtNumber(skipped.tombstonedInBackup.progress + skipped.tombstonedInTarget.progress)} progress parts
              </td>
            </tr>
            {plan.estWrites !== undefined && (
              <tr>
                <th scope="row">Firestore writes</th>
                <td>
                  about {fmtNumber(plan.estWrites)} ({fmtNumber(plan.daysNeeded)} day{plan.daysNeeded === 1 ? '' : 's'} of quota)
                  {plan.fitsToday ? ', fits today' : ', more than is left today: the job pauses and resumes after each reset'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ChooseStep(props: {
  upload: Upload;
  report: ValidationReport;
  adminTz: string;
  quotaResetsAt: string | null;
  onDiscard: () => void;
  onStarted: (job: RestoreJob) => void;
}) {
  const { upload, report, adminTz, quotaResetsAt, onDiscard, onStarted } = props;
  const onError = useActionError();
  const firestore = report.target.store === 'firestore';
  const canReplace = report.modes.includes('replace') && !firestore;
  const [mode, setMode] = useState<RestoreMode>('merge');
  const [runAt, setRunAt] = useState<RunAt>('now');
  const [exitAfter, setExitAfter] = useState(true);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const phrase = confirmPhrase(mode, report.target.users);
  const resume = quotaResetsAt ? new Date(Date.parse(quotaResetsAt) + RESUME_AFTER_RESET_MS).toISOString() : null;

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      onStarted(
        await createRestoreJob({
          uploadId: upload.uploadId,
          mode,
          runAt,
          tz: adminTz,
          exitMaintenanceOnSuccess: exitAfter,
          confirm: confirm.trim(),
        }),
      );
    } catch (problem) {
      const text = onError(problem, 'Couldn’t start the restore.');
      if (text) setError(text);
    } finally {
      setBusy(false);
    }
  };

  const radio = (name: string, value: string, checked: boolean, onPick: () => void, label: ReactNode, hint?: ReactNode) => (
    <div className="checkbox">
      <input id={`rs-${name}-${value}`} type="radio" name={name} checked={checked} onChange={onPick} />
      <label htmlFor={`rs-${name}-${value}`}>
        {label}
        {hint && <span className="field__hint"> {hint}</span>}
      </label>
    </div>
  );

  return (
    <form
      className="form admin-form"
      aria-label="Choose and confirm"
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy && confirm.trim() === phrase) void start();
      }}
    >
      <p>
        <strong>{upload.name}</strong> is valid.
      </p>
      <PlanReport report={report} />
      <fieldset className="admin-radios">
        <legend>Mode</legend>
        {radio('mode', 'merge', mode === 'merge', () => setMode('merge'), 'Merge', '(newest wins; nothing is deleted)')}
        {canReplace &&
          radio(
            'mode',
            'replace',
            mode === 'replace',
            () => setMode('replace'),
            'Replace',
            '(Postgres only: every user and all progress on this site are replaced by the backup)',
          )}
      </fieldset>
      <fieldset className="admin-radios">
        <legend>When</legend>
        {radio('when', 'now', runAt === 'now', () => setRunAt('now'), 'Now')}
        {radio('when', 'tonight', runAt === 'tonight', () => setRunAt('tonight'), 'Tonight 00:00', `(${adminTz})`)}
        {firestore &&
          radio(
            'when',
            'after_quota_reset',
            runAt === 'after_quota_reset',
            () => setRunAt('after_quota_reset'),
            'After the next Firestore quota reset',
            resume ? `(${formatIn(resume, PACIFIC)}, ${formatIn(resume, adminTz)})` : undefined,
          )}
      </fieldset>
      <div className="checkbox">
        <input id="rs-exit" type="checkbox" checked={exitAfter} onChange={(event) => setExitAfter(event.target.checked)} />
        <label htmlFor="rs-exit">Leave maintenance when the restore succeeds</label>
      </div>
      {mode === 'replace' && (
        <FormMessage tone="error">
          Replace deletes the {fmtNumber(report.target.users)} users and their progress on this site and keeps only what the
          backup holds.
        </FormMessage>
      )}
      <TextField
        label={`Type ${phrase} to confirm`}
        name="confirm"
        autoComplete="off"
        spellCheck={false}
        value={confirm}
        onChange={(event) => setConfirm(event.target.value)}
      />
      <p className="actions">
        <button
          type="submit"
          className={mode === 'replace' ? 'btn btn--danger' : 'btn btn--primary'}
          disabled={busy || confirm.trim() !== phrase}
        >
          {busy ? 'Starting…' : 'Start restore'}
        </button>
        <button type="button" className="btn btn--quiet btn--small" onClick={() => void onDiscard()}>
          Discard upload
        </button>
      </p>
      {error && <FormMessage tone="error">{error}</FormMessage>}
    </form>
  );
}

// --- 6. watch -----------------------------------------------------------------------------------

function JobStep(props: { job: RestoreJob; adminTz: string; onChange: (job: RestoreJob) => void; onRestart: () => void }) {
  const { job, adminTz, onChange, onRestart } = props;
  const onError = useActionError();
  const [tick, setTick] = useState(0);
  const [cancelling, setCancelling] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumped around a cancel: a poll answered before the cancel landed must not bring `scheduled` back.
  const generation = useRef(0);
  const active = ACTIVE_JOB_STATES.includes(job.state);
  const progress = job.progress ?? { done: 0, total: job.total ?? 0 };
  const report = job.report;

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    const started = generation.current; // when this poll was scheduled, not when its timer fires
    const stale = () => controller.signal.aborted || started !== generation.current;
    const timer = setTimeout(() => {
      getRestoreJob(job.id, controller.signal).then(
        (next) => {
          if (stale()) return;
          onChange(next);
          setTick((n) => n + 1);
        },
        () => !stale() && setTick((n) => n + 1),
      );
    }, POLL.jobMs);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [active, job.id, tick, onChange]);

  const doCancel = async () => {
    setBusy(true);
    setError(null);
    generation.current++;
    try {
      const cancelled = (await cancelJob(job.id, confirm.trim())) as unknown as RestoreJob;
      generation.current++;
      onChange(cancelled);
      setCancelling(false);
      setConfirm('');
    } catch (problem) {
      setTick((n) => n + 1); // polls resume
      const text = onError(problem, 'Couldn’t cancel the restore.');
      if (text) setError(text);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-form" aria-label="Restore job" role="group">
      <p>
        <StateChip state={job.state} /> {job.mode === 'replace' ? 'Replace' : 'Merge'} from <strong>{job.fileName ?? job.uploadId}</strong>
        , {job.state === 'scheduled' ? 'starts' : 'started'} {formatIn(job.runAt, job.tz || adminTz)}
      </p>
      <ProgressBar
        label="Records applied"
        done={progress.done}
        total={progress.total}
        text={`${fmtNumber(progress.done)} of ${fmtNumber(progress.total)}`}
      />
      {job.state === 'paused_quota' && (
        <FormMessage tone="info">
          Paused: today’s Firestore quota is used up. It resumes {formatIn(job.resumeAt, adminTz)}.
        </FormMessage>
      )}
      {job.state === 'succeeded' && (
        <FormMessage tone="success">
          Restored and verified.{' '}
          {job.exitMaintenanceOnSuccess === false ? 'The site stays in full maintenance.' : 'The previous maintenance mode is back.'}
        </FormMessage>
      )}
      {(job.state === 'needs_attention' || job.state === 'failed') && (
        <FormMessage tone="error">
          <p>
            The restore {job.state === 'failed' ? 'failed' : 'needs attention'}: {job.error ?? 'see the report'}.{' '}
            {job.state === 'needs_attention' ? 'The site stays in full maintenance until you set the mode yourself.' : ''}
          </p>
        </FormMessage>
      )}
      {report && (
        <dl className="facts" aria-label="Job report">
          <div>
            <dt>Written</dt>
            <dd>
              {fmtNumber(report.written.user ?? 0)} users, {fmtNumber(report.written.progress ?? 0)} progress parts
            </dd>
          </div>
          <div>
            <dt>Kept (newer here)</dt>
            <dd>{fmtNumber(report.kept.progress ?? 0)} progress parts</dd>
          </div>
          <div>
            <dt>Skipped</dt>
            <dd>
              {fmtNumber(report.skipped.user ?? 0)} users, {fmtNumber(report.skipped.progress ?? 0)} progress parts
            </dd>
          </div>
          <div>
            <dt>Verified</dt>
            <dd>
              counts {report.countsOk ? 'match' : 'do not match'}; {fmtNumber(report.sample.checked)} sampled parts,{' '}
              {fmtNumber(report.sample.mismatched)} mismatched
            </dd>
          </div>
        </dl>
      )}
      <p className="actions">
        {job.state === 'scheduled' && (
          <button type="button" className="btn btn--small" onClick={() => setCancelling(true)}>
            Cancel restore
          </button>
        )}
        {!active && (
          <button type="button" className="btn btn--small" onClick={onRestart}>
            Start a new restore
          </button>
        )}
      </p>
      {cancelling && (
        <Dialog
          title="Cancel this restore?"
          onCancel={busy ? undefined : () => setCancelling(false)}
          actions={
            <>
              <button type="button" className="btn btn--quiet" disabled={busy} onClick={() => setCancelling(false)}>
                Keep it
              </button>
              <button
                type="button"
                className="btn btn--danger"
                disabled={busy || confirm.trim() !== CONFIRM.cancel}
                onClick={() => void doCancel()}
              >
                {busy ? 'Cancelling…' : 'Cancel restore'}
              </button>
            </>
          }
        >
          <p>It has not started yet. Cancelling also deletes the uploaded backup from the server; upload it again to restore later.</p>
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
    </div>
  );
}
