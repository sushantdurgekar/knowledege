import { useEffect, useId, useMemo, useState } from 'react';
import { BusyLine, FormMessage, TextField } from '../../components/forms';
import { getSettings, isTimeZone, MAX_NOTICE, putSettings, timeZones, type SiteSettings } from '../../lib/admin-api';
import { isApiProblem } from '../../lib/api';
import { LoadError, useActionError, useLoad } from './shared';

/** Settings: the site's time zone (schedules, "Tonight 00:00") and a notice for learners. */
export function SettingsTab() {
  const settings = useLoad(getSettings);
  return (
    <div className="admin-tab">
      <section className="panel" aria-labelledby="st-title">
        <h2 id="st-title">Settings</h2>
        {settings.state.status === 'loading' && <BusyLine>Loading…</BusyLine>}
        {settings.state.status === 'error' && <LoadError message={settings.state.message} onRetry={settings.reload} />}
        {settings.state.status === 'ready' && (
          <SettingsForm current={settings.state.data} onSaved={settings.set} onConflict={settings.reload} />
        )}
      </section>
    </div>
  );
}

function SettingsForm({
  current,
  onSaved,
  onConflict,
}: {
  current: SiteSettings;
  onSaved: (settings: SiteSettings) => void;
  onConflict: () => void;
}) {
  const onError = useActionError();
  const listId = useId();
  const zones = useMemo(timeZones, []);
  const [tz, setTz] = useState(current.tz);
  const [notice, setNotice] = useState(current.notice ?? '');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  useEffect(() => {
    setTz(current.tz);
    setNotice(current.notice ?? '');
  }, [current]);

  const validTz = isTimeZone(tz.trim());

  const save = async () => {
    setBusy(true);
    setNote(null);
    try {
      const saved = await putSettings({ tz: tz.trim(), notice: notice.trim() || null, version: current.version });
      onSaved(saved);
      setNote({ tone: 'success', text: 'Settings saved.' });
    } catch (error) {
      const text = onError(error, 'Couldn’t save the settings.');
      if (text) setNote({ tone: 'error', text });
      if (isApiProblem(error) && error.code === 'conflict') onConflict();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <form
        className="form admin-form"
        aria-labelledby="st-title"
        onSubmit={(event) => {
          event.preventDefault();
          if (validTz && !busy) void save();
        }}
      >
        <TextField
          label="Time zone"
          name="tz"
          list={listId}
          autoComplete="off"
          spellCheck={false}
          value={tz}
          onChange={(event) => setTz(event.target.value)}
          aria-invalid={!validTz}
          hint="An IANA name such as Asia/Kolkata. Used for scheduled windows (“Tonight 00:00”) and times shown here."
        />
        <datalist id={listId}>
          {zones.map((zone) => (
            <option key={zone} value={zone} />
          ))}
        </datalist>
        <div className="field">
          <label htmlFor="st-notice">Notice for learners (optional)</label>
          <textarea
            id="st-notice"
            name="notice"
            rows={3}
            maxLength={MAX_NOTICE}
            value={notice}
            onChange={(event) => setNotice(event.target.value)}
          />
        </div>
        <button type="submit" className="btn btn--primary" disabled={!validTz || busy}>
          {busy ? 'Saving…' : 'Save settings'}
        </button>
      </form>
      {note && <FormMessage tone={note.tone}>{note.text}</FormMessage>}
    </>
  );
}
