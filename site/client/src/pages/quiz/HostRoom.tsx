import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { BusyLine, FormMessage } from '../../components/forms';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import {
  apiMessage,
  hostAction,
  hostSecret,
  setHostSecret,
  TYPE_LABELS,
  useCountdown,
  useRoomPoll,
  type RoomView,
} from '../../lib/quiz';
import { Leaderboard, LETTERS, Solution } from './Answering';

/** `/quiz/host/:pin`: the host's control screen, meant for a projector. */
export function HostRoom() {
  const { pin = '' } = useParams();
  const key = hostSecret(pin);
  if (!key) {
    return (
      <section className="page" aria-labelledby="page-title">
        <h1 id="page-title">Not the host of room {pin}</h1>
        <p className="lede">Open the room from the host page in the browser that created it.</p>
        <Link className="btn btn--primary" to="/quiz/host">
          Host page
        </Link>
      </section>
    );
  }
  return <Hosting pin={pin} hostKey={key} />;
}

function downloadCsv(view: RoomView) {
  const rows = [['rank', 'name', 'score', 'correct']].concat(
    (view.leaderboard ?? []).map((r) => [String(r.rank), r.name, String(r.score), String(r.correct)]),
  );
  const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `quiz-${view.pin}-results.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Hosting({ pin, hostKey }: { pin: string; hostKey: string }) {
  useDocumentTitle(`Hosting ${pin}`);
  const navigate = useNavigate();
  const { view, fatal, offline, push } = useRoomPoll(`/api/quiz/rooms/${encodeURIComponent(pin)}/host`, {
    'X-Quiz-Host': hostKey,
  });
  const seconds = useCountdown(view);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const act = async (action: string, playerId?: string) => {
    setBusy(true);
    setError(null);
    try {
      const result = await hostAction(pin, hostKey, action, playerId);
      if ('closed' in result) {
        setHostSecret(pin, null);
        navigate('/quiz/host');
      } else push(result);
    } catch (e) {
      setError(apiMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (fatal) {
    return (
      <section className="page" aria-labelledby="page-title">
        <h1 id="page-title">Room {pin} is gone</h1>
        <p className="lede">{fatal} (rooms end when the server restarts or after 6 idle hours).</p>
        <Link className="btn btn--primary" to="/quiz/host">
          Host another quiz
        </Link>
      </section>
    );
  }
  if (!view) return <BusyLine>Opening room {pin}…</BusyLine>;
  const q = view.question;
  const joinUrl = `${window.location.origin}/quiz?pin=${pin}`;
  const last = view.index >= view.total - 1;

  return (
    <section className="page page--wide quiz-host" aria-labelledby="page-title">
      <header className="quiz-bar">
        <span className="quiz-bar__title" id="page-title">
          {view.title}
        </span>
        <span className="quiz-bar__me">
          PIN <strong className="quiz-bar__pin">{pin}</strong> · {view.playerCount} players
        </span>
      </header>
      {offline && <FormMessage tone="info">Reconnecting…</FormMessage>}
      {error && <FormMessage tone="error">{error}</FormMessage>}

      {view.phase === 'lobby' && (
        <div className="quiz-lobby">
          <p className="muted">Join at</p>
          <p className="quiz-joinurl">
            <a href={joinUrl}>{window.location.host}/quiz</a>
          </p>
          <p className="muted">with PIN</p>
          <p className="quiz-pin">{pin}</p>
          <p className="actions">
            <button type="button" className="btn btn--primary" disabled={busy || view.playerCount === 0} onClick={() => act('start')}>
              Start ({view.total} questions)
            </button>
            <button type="button" className="btn btn--quiet" onClick={() => navigator.clipboard?.writeText(joinUrl)}>
              Copy join link
            </button>
          </p>
          <ul className="quiz-chips" aria-label="Players">
            {(view.players ?? []).map((p) => (
              <li key={p.id} className="quiz-chip">
                {p.name}
                <button type="button" className="quiz-chip__x" aria-label={`Remove ${p.name}`} onClick={() => act('kick', p.id)}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {view.phase === 'question' && q && (
        <div className="quiz-q">
          <div className="quiz-q__meta">
            <span>
              Question {q.index + 1} of {view.total} · {TYPE_LABELS[q.type]} · {q.points} pts
            </span>
            <span className={`quiz-timer${seconds <= 5 ? ' is-low' : ''}`}>{seconds}s</span>
          </div>
          <h2 className="quiz-q__text quiz-q__text--big">{q.text}</h2>
          {q.options && (
            <div className="quiz-options quiz-options--static">
              {q.options.map((o, i) => (
                <div key={i} className={`quiz-option quiz-option--${i % 8}`}>
                  <span className="quiz-option__letter">{LETTERS[i]}</span>
                  {o}
                </div>
              ))}
            </div>
          )}
          {q.type === 'match' && (
            <div className="quiz-match-show">
              <ol>
                {(q.left ?? []).map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ol>
              <ul>
                {(q.right ?? []).map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="quiz-answered">
            <strong>{view.answeredCount ?? 0}</strong> of {view.playerCount} answered
          </p>
          <p className="actions">
            <button type="button" className="btn btn--primary" disabled={busy} onClick={() => act('reveal')}>
              Close and show answer
            </button>
          </p>
        </div>
      )}

      {view.phase === 'reveal' && q && (
        <div className="quiz-reveal">
          <div className="quiz-q">
            <p className="quiz-q__meta">
              Question {q.index + 1} of {view.total} · {q.stats?.correct ?? 0} of {q.stats?.answered ?? 0} correct
            </p>
            <h2 className="quiz-q__text">{q.text}</h2>
            <Solution q={q} />
            {q.explain && <p className="quiz-explain">{q.explain}</p>}
          </div>
          <div>
            <h2>Leaderboard</h2>
            <Leaderboard rows={(view.leaderboard ?? []).slice(0, 10)} />
            <p className="actions">
              <button type="button" className="btn btn--primary" disabled={busy} onClick={() => act('next')}>
                {last ? 'Show final results' : 'Next question'}
              </button>
              {!last && (
                <button type="button" className="btn btn--quiet" disabled={busy} onClick={() => act('end')}>
                  End quiz now
                </button>
              )}
            </p>
          </div>
        </div>
      )}

      {view.phase === 'finished' && (
        <div className="quiz-final">
          <h2>Final results</h2>
          <ol className="quiz-podium">
            {(view.leaderboard ?? []).slice(0, 3).map((r) => (
              <li key={r.id} className={`quiz-podium__step quiz-podium__step--${r.rank}`}>
                <span className="quiz-podium__name">{r.name}</span>
                <span className="quiz-podium__score">{r.score.toLocaleString()}</span>
                <span className="quiz-podium__rank">{r.rank}</span>
              </li>
            ))}
          </ol>
          <Leaderboard rows={view.leaderboard ?? []} />
          <p className="actions">
            <button type="button" className="btn" onClick={() => downloadCsv(view)}>
              Download results (CSV)
            </button>
            <button type="button" className="btn btn--danger" disabled={busy} onClick={() => act('close')}>
              Close room
            </button>
          </p>
        </div>
      )}

      {view.phase !== 'finished' && view.phase !== 'lobby' && (
        <p className="muted small">
          <button type="button" className="btn btn--small btn--quiet" disabled={busy} onClick={() => act('end')}>
            End quiz
          </button>
        </p>
      )}
    </section>
  );
}
