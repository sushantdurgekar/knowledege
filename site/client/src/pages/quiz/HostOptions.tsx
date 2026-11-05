import { useState } from 'react';
import { Dialog } from '../../components/Dialog';
import type { Mode, RoomOptions } from '../../lib/quiz';

const toLocal = (ms: number) => {
  const d = new Date(ms - new Date().getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
};

/** Room options before a room opens: live or self-paced, teams, flashcards, a schedule. */
export function HostOptions({
  title,
  initialMode,
  onStart,
  onCancel,
  busy,
}: {
  title: string;
  initialMode: Mode;
  onStart: (options: RoomOptions) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [teams, setTeams] = useState(0);
  const [study, setStudy] = useState(false);
  const [scheduled, setScheduled] = useState(false);
  const [streakBonus, setStreakBonus] = useState(true);
  const [autoplay, setAutoplay] = useState(0);
  const [shuffle, setShuffle] = useState(false);
  const [friendlyNames, setFriendlyNames] = useState(false);
  const [reactions, setReactions] = useState(true);
  const [opens, setOpens] = useState(() => toLocal(Date.now()));
  const [closes, setCloses] = useState(() => toLocal(Date.now() + 7 * 86_400_000));
  const opensAt = new Date(opens).getTime();
  const closesAt = new Date(closes).getTime();
  const badWindow = scheduled && mode === 'self' && !(closesAt > Math.max(opensAt, Date.now()));

  return (
    <Dialog
      title={`Start “${title}”`}
      onCancel={onCancel}
      actions={
        <>
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy || badWindow}
            onClick={() =>
              onStart({
                mode,
                teams,
                study: mode === 'self' && study,
                opensAt: mode === 'self' && scheduled ? opensAt : null,
                closesAt: mode === 'self' && scheduled ? closesAt : null,
                streakBonus,
                autoplay: mode === 'live' ? autoplay : 0,
                shuffle,
                friendlyNames,
                reactions,
              })
            }
          >
            {mode === 'live' ? 'Open the room' : scheduled ? 'Schedule the challenge' : 'Open the challenge'}
          </button>
          <button type="button" className="btn btn--quiet" onClick={onCancel}>
            Cancel
          </button>
        </>
      }
    >
      <fieldset className="host-options__group">
        <legend>How will people play?</legend>
        <label className="host-options__choice">
          <input type="radio" name="mode" checked={mode === 'live'} onChange={() => setMode('live')} />
          <span>
            <strong>Live</strong>
            <span className="muted small">You run it question by question (meetings, classes, Teams).</span>
          </span>
        </label>
        <label className="host-options__choice">
          <input type="radio" name="mode" checked={mode === 'self'} onChange={() => setMode('self')} />
          <span>
            <strong>Self-paced challenge</strong>
            <span className="muted small">Everyone plays at their own pace; you watch the dashboard.</span>
          </span>
        </label>
      </fieldset>
      <div className="field">
        <label htmlFor="host-teams">Teams</label>
        <select id="host-teams" value={teams} onChange={(e) => setTeams(Number(e.target.value))}>
          <option value={0}>Off: everyone plays for themselves</option>
          {[2, 3, 4, 5, 6].map((n) => (
            <option key={n} value={n}>
              {n} teams (players are balanced automatically)
            </option>
          ))}
        </select>
      </div>
      {mode === 'self' && (
        <>
          <label className="studio__check">
            <input type="checkbox" checked={study} onChange={(e) => setStudy(e.target.checked)} /> Let players study flashcards first
          </label>
          <label className="studio__check">
            <input type="checkbox" checked={scheduled} onChange={(e) => setScheduled(e.target.checked)} /> Schedule it (opens and
            closes by itself, up to 14 days)
          </label>
          {scheduled && (
            <div className="host-options__dates">
              <div className="field">
                <label htmlFor="host-opens">Opens</label>
                <input id="host-opens" type="datetime-local" value={opens} onChange={(e) => setOpens(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="host-closes">Closes</label>
                <input id="host-closes" type="datetime-local" value={closes} onChange={(e) => setCloses(e.target.value)} />
              </div>
              {badWindow && <p className="form-message form-message--error">The closing time must be after the opening time.</p>}
            </div>
          )}
        </>
      )}
      <details className="host-options__more">
        <summary>Game options</summary>
        {mode === 'live' && (
          <div className="field">
            <label htmlFor="host-autoplay">Auto-play</label>
            <select id="host-autoplay" value={autoplay} onChange={(e) => setAutoplay(Number(e.target.value))}>
              <option value={0}>Off: you move on with Next</option>
              {[5, 8, 12, 20].map((n) => (
                <option key={n} value={n}>
                  Results for {n} s, then the next item opens by itself
                </option>
              ))}
            </select>
            {autoplay > 0 && <span className="field__hint">Slides stay up for 12 s. You can still skip, pause with “End quiz now” or jump.</span>}
          </div>
        )}
        <label className="studio__check">
          <input type="checkbox" checked={streakBonus} onChange={(e) => setStreakBonus(e.target.checked)} /> Streak bonus (+100
          points per right answer in a row, up to +500)
        </label>
        <label className="studio__check">
          <input type="checkbox" checked={shuffle} onChange={(e) => setShuffle(e.target.checked)} /> Shuffle the answer order
        </label>
        <label className="studio__check">
          <input type="checkbox" checked={friendlyNames} onChange={(e) => setFriendlyNames(e.target.checked)} /> Friendly names only
          (players pick a generated name like “Curious Otter”)
        </label>
        <label className="studio__check">
          <input type="checkbox" checked={reactions} onChange={(e) => setReactions(e.target.checked)} /> Emoji reactions on the shared
          screen
        </label>
      </details>
    </Dialog>
  );
}
