import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { BusyLine, FormMessage } from '../../components/forms';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { download } from '../../lib/quiz-doc';
import {
  apiMessage,
  hostAction,
  hostSecret,
  setHostSecret,
  TYPE_LABELS,
  useCountdown,
  useRoomPoll,
  type Insight,
  type RoomView,
} from '../../lib/quiz';
import { Leaderboard, LETTERS, SlideBody, Solution } from './Answering';

/** `/quiz/host/:pin`: the host's control room, meant for a projector. */
export function HostRoom() {
  const { pin = '' } = useParams();
  const key = hostSecret(pin);
  if (!key) {
    return (
      <section className="page" aria-labelledby="page-title">
        <h1 id="page-title">Not the host of room {pin}</h1>
        <p className="lede">Open the room from the quiz studio, in the browser that created it.</p>
        <Link className="btn btn--primary" to="/quiz/host">
          Quiz studio
        </Link>
      </section>
    );
  }
  return <Hosting pin={pin} hostKey={key} />;
}

function resultsCsv(view: RoomView): string {
  const rows = [['rank', 'name', 'score', 'correct']].concat(
    (view.leaderboard ?? []).map((r) => [String(r.rank), r.name, String(r.score), String(r.correct)]),
  );
  return rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\r\n');
}

type Act = (action: string, extra?: { playerId?: string; index?: number; seconds?: number }) => void;

function Hosting({ pin, hostKey }: { pin: string; hostKey: string }) {
  useDocumentTitle(`Hosting ${pin}`);
  const navigate = useNavigate();
  const { view, fatal, offline, push } = useRoomPoll(`/api/quiz/rooms/${encodeURIComponent(pin)}/host`, {
    'X-Quiz-Host': hostKey,
  });
  const seconds = useCountdown(view);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const act: Act = async (action, extra = {}) => {
    setBusy(true);
    setError(null);
    try {
      const result = await hostAction(pin, hostKey, action, extra);
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
          Quiz studio
        </Link>
      </section>
    );
  }
  if (!view) return <BusyLine>Opening room {pin}…</BusyLine>;
  const self = view.mode === 'self';
  const joinUrl = `${window.location.origin}/quiz?pin=${pin}`;

  const endNow = () => {
    if (window.confirm('End the quiz now? Scores so far are final.')) act('end');
  };

  return (
    <section className="page page--wide quiz-host" aria-labelledby="page-title">
      <header className="quiz-bar">
        <span className="quiz-bar__title" id="page-title">
          {view.title} <span className="quiz-tag">{self ? 'Self-paced' : 'Live'}</span>
        </span>
        <span className="quiz-bar__me">
          PIN <strong className="quiz-bar__pin">{pin}</strong> · {view.playerCount} players
          {view.locked ? ' · 🔒 locked' : ''}
        </span>
      </header>
      {offline && <FormMessage tone="info">Reconnecting…</FormMessage>}
      {error && <FormMessage tone="error">{error}</FormMessage>}

      <div className="host-toolbar" role="toolbar" aria-label="Room controls">
        {view.phase !== 'finished' && (
          <>
            <button type="button" className="btn btn--small" disabled={busy} onClick={() => act(view.locked ? 'unlock' : 'lock')}>
              {view.locked ? 'Unlock joining' : 'Lock joining'}
            </button>
            {view.phase !== 'lobby' && (
              <button type="button" className="btn btn--small btn--danger" disabled={busy} onClick={endNow}>
                End quiz now
              </button>
            )}
          </>
        )}
        <button type="button" className="btn btn--small btn--quiet" onClick={() => navigator.clipboard?.writeText(joinUrl)}>
          Copy join link
        </button>
      </div>

      <div className={`host-layout${self ? ' host-layout--self' : ''}`}>
        <div className="host-stage">
          {view.phase === 'lobby' && <Lobby view={view} pin={pin} joinUrl={joinUrl} busy={busy} act={act} />}
          {!self && (view.phase === 'question' || view.phase === 'reveal') && (
            <LiveStage view={view} seconds={seconds} busy={busy} act={act} />
          )}
          {self && view.phase === 'question' && <SelfDashboard view={view} act={act} busy={busy} />}
          {view.phase === 'finished' && <Final view={view} busy={busy} act={act} />}
        </div>
        {!self && view.sheet && <RunSheet view={view} busy={busy} act={act} />}
      </div>
    </section>
  );
}

function Lobby({ view, pin, joinUrl, busy, act }: { view: RoomView; pin: string; joinUrl: string; busy: boolean; act: Act }) {
  return (
    <div className="quiz-lobby">
      <p className="muted">Join at</p>
      <p className="quiz-joinurl">
        <a href={joinUrl}>{window.location.host}/quiz</a>
      </p>
      <p className="muted">with PIN</p>
      <p className="quiz-pin">{pin}</p>
      <p className="actions quiz-center">
        <button type="button" className="btn btn--primary" disabled={busy || view.playerCount === 0} onClick={() => act('start')}>
          {view.mode === 'self' ? 'Open the quiz' : 'Start'} ({view.total} items)
        </button>
      </p>
      {view.playerCount === 0 && <p className="muted small">Waiting for players to join…</p>}
      <ul className="quiz-chips" aria-label="Players">
        {(view.players ?? []).map((p) => (
          <li key={p.id} className="quiz-chip">
            {p.name}
            <button type="button" className="quiz-chip__x" aria-label={`Remove ${p.name}`} onClick={() => act('kick', { playerId: p.id })}>
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LiveStage({ view, seconds, busy, act }: { view: RoomView; seconds: number; busy: boolean; act: Act }) {
  const q = view.question;
  if (!q) return null;
  const open = view.phase === 'question';
  const nextLabel = view.nextIndex === null || view.nextIndex === undefined ? 'Show final results' : `Next: item ${view.nextIndex + 1}`;

  if (q.type === 'slide') {
    return (
      <div className="quiz-q">
        <p className="quiz-q__meta">
          Item {q.index + 1} of {view.total} · Slide
        </p>
        <SlideBody text={q.text} body={q.body} big />
        <p className="actions">
          <button type="button" className="btn btn--primary" disabled={busy} onClick={() => act('next')}>
            {nextLabel}
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className={open ? 'quiz-q' : 'quiz-reveal'}>
      <div className="quiz-q">
        <div className="quiz-q__meta">
          <span>
            Item {q.index + 1} of {view.total} · {TYPE_LABELS[q.type]}
            {q.points ? ` · ${q.points} pts` : ''}
          </span>
          {open && <span className={`quiz-timer${seconds <= 5 ? ' is-low' : ''}`}>{seconds}s</span>}
        </div>
        <h2 className={`quiz-q__text${open ? ' quiz-q__text--big' : ''}`}>{q.text}</h2>
        {open ? (
          <>
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
            {(q.type === 'match' || q.type === 'order') && (
              <div className="quiz-match-show">
                {q.type === 'match' && (
                  <ol>
                    {(q.left ?? []).map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ol>
                )}
                <ul>
                  {((q.type === 'match' ? q.right : q.items) ?? []).map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
            {q.hints && q.hints.length > 0 && (
              <p className="muted small">Hints players can open: {q.hints.join(' · ')}</p>
            )}
            <p className="quiz-answered">
              <strong>{view.answeredCount ?? 0}</strong> of {view.playerCount} answered
            </p>
            <p className="actions quiz-center">
              <button type="button" className="btn" disabled={busy} onClick={() => act('extend', { seconds: 10 })}>
                +10 s
              </button>
              <button type="button" className="btn btn--primary" disabled={busy} onClick={() => act('reveal')}>
                Close and show answer
              </button>
            </p>
            <ul className="quiz-chips quiz-chips--small" aria-label="Who has answered">
              {(view.players ?? []).map((p) => (
                <li key={p.id} className={`quiz-chip${p.answered ? ' is-done' : ''}`}>
                  {p.answered ? '✓ ' : ''}
                  {p.name}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            {q.type !== 'poll' && (
              <p className="muted">
                {q.stats?.correct ?? 0} of {q.stats?.answered ?? 0} correct
              </p>
            )}
            <Solution q={q} />
            {q.explain && <p className="quiz-explain">{q.explain}</p>}
            {q.type === 'explain' && (
              <ul className="quiz-responses" aria-label="Explanations">
                {(q.stats?.responses ?? []).map((r, i) => (
                  <li key={i}>
                    <strong>{r.name}:</strong> {r.text}
                  </li>
                ))}
              </ul>
            )}
            {view.insights && <InsightRow row={view.insights.find((r) => r.index === q.index)} />}
          </>
        )}
      </div>
      {!open && (
        <div>
          <h2>Leaderboard</h2>
          <Leaderboard rows={(view.leaderboard ?? []).slice(0, 10)} />
          <p className="actions">
            <button type="button" className="btn btn--primary" disabled={busy} onClick={() => act('next')}>
              {nextLabel}
            </button>
          </p>
        </div>
      )}
    </div>
  );
}

function RunSheet({ view, busy, act }: { view: RoomView; busy: boolean; act: Act }) {
  const canJump = view.phase === 'lobby' || view.phase === 'reveal' || (view.phase === 'question' && view.question?.type === 'slide');
  return (
    <aside className="run-sheet" aria-label="Run sheet">
      <h2 className="run-sheet__h">Run sheet</h2>
      <p className="muted small">{canJump ? 'Pick what comes next, in any order.' : 'Close the question to pick what comes next.'}</p>
      <ol className="run-sheet__list">
        {(view.sheet ?? []).map((row) => {
          const current = row.index === view.index && view.phase !== 'lobby';
          return (
            <li key={row.index} className={`run-sheet__row${current ? ' is-current' : ''}${row.done && !current ? ' is-done' : ''}`}>
              <span className="run-sheet__n">{row.index + 1}</span>
              <span className="run-sheet__text">
                <span className="muted small">{TYPE_LABELS[row.type]}</span>
                <span>{row.text}</span>
              </span>
              {current ? (
                <span className="run-sheet__state">Now</span>
              ) : (
                <button
                  type="button"
                  className="btn btn--small btn--quiet"
                  disabled={busy || !canJump || view.phase === 'finished'}
                  onClick={() => act(view.phase === 'lobby' ? 'start' : 'goto', { index: row.index })}
                  aria-label={`${row.done ? 'Run again' : 'Run next'}: item ${row.index + 1}`}
                >
                  {row.done ? 'Again' : row.index === view.nextIndex ? 'Next ▸' : 'Run'}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

function SelfDashboard({ view, act, busy }: { view: RoomView; act: Act; busy: boolean }) {
  const players = view.players ?? [];
  const done = players.filter((p) => p.stage === 'done').length;
  return (
    <div className="self-dash">
      <p className="lede">
        Players work through {view.total} items at their own pace. <strong>{done}</strong> of {players.length} finished.
      </p>
      <div className="self-dash__grid">
        <div>
          <h2>Progress</h2>
          <div className="table-scroll">
          <table className="self-dash__table">
            <thead>
              <tr>
                <th scope="col">Player</th>
                <th scope="col">Item</th>
                <th scope="col">Score</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>
                    <span className="self-dash__bar" style={{ ['--w' as string]: `${((p.position ?? 0) / view.total) * 100}%` }}>
                      {p.stage === 'done' ? 'Done' : p.stage === 'ready' ? 'Not started' : `${p.position} / ${view.total}`}
                    </span>
                  </td>
                  <td className="mono">{p.score.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
        <div>
          <h2>Leaderboard</h2>
          <Leaderboard rows={(view.leaderboard ?? []).slice(0, 10)} />
          <h2>Per item</h2>
          <ol className="self-dash__items">
            {(view.sheet ?? []).map((row, i) => {
              const s = view.itemStats?.[i];
              return (
                <li key={row.index}>
                  <span className="muted small">{TYPE_LABELS[row.type]}</span> {row.text}
                  {s && (
                    <span className="muted small">
                      {' '}
                      — {s.answered} answered{row.type !== 'poll' ? `, ${s.correct} correct` : ''}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      </div>
      {view.insights && <Insights rows={view.insights} advanced={!!view.advanced} />}
      <p className="actions">
        <button type="button" className="btn btn--primary" disabled={busy} onClick={() => act('end')}>
          Close the quiz and show results
        </button>
      </p>
    </div>
  );
}

function InsightRow({ row }: { row?: Insight }) {
  if (!row || !row.answered) return null;
  return (
    <p className="muted small">
      Average {row.avgSeconds}s
      {row.topWrong ? ` · most-picked wrong answer: “${row.topWrong.text}” (${row.topWrong.count})` : ''}
      {row.sureWrong ? ` · ${row.sureWrong} sure but wrong` : ''}
      {row.hintsUsed ? ` · ${row.hintsUsed} hint(s) used` : ''}
    </p>
  );
}

/** Per question: how many got it, and where players went wrong (hardest first). */
export function Insights({ rows, advanced }: { rows: Insight[]; advanced: boolean }) {
  const played = rows.filter((r) => r.answered > 0);
  if (!played.length) return null;
  const sorted = [...played].sort((a, b) => a.correct / a.answered - b.correct / b.answered);
  return (
    <section className="insights" aria-labelledby="insights-title">
      <h2 id="insights-title">Insights</h2>
      <p className="muted small">Hardest first. Use them to pick what to reteach.</p>
      <div className="table-scroll">
      <table className="self-dash__table">
        <thead>
          <tr>
            <th scope="col">Question</th>
            <th scope="col">Correct</th>
            <th scope="col">Avg time</th>
            <th scope="col">Most-picked wrong answer</th>
            {advanced && <th scope="col">Sure but wrong</th>}
            {advanced && <th scope="col">Hints</th>}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const pct = Math.round((100 * r.correct) / r.answered);
            return (
              <tr key={r.index}>
                <td>
                  <span className="muted small">{r.index + 1}.</span> {r.text}
                </td>
                <td>
                  <span className={`insights__pct${pct < 50 ? ' is-low' : ''}`}>{pct}%</span>{' '}
                  <span className="muted small">
                    ({r.correct}/{r.answered})
                  </span>
                </td>
                <td className="mono">{r.avgSeconds ?? '—'}s</td>
                <td>{r.topWrong ? `${r.topWrong.text} (${r.topWrong.count})` : '—'}</td>
                {advanced && <td className={r.sureWrong ? 'insights__warn' : ''}>{r.sureWrong}</td>}
                {advanced && <td>{r.hintsUsed}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
          </div>
    </section>
  );
}

function Final({ view, busy, act }: { view: RoomView; busy: boolean; act: Act }) {
  return (
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
      {view.insights && <Insights rows={view.insights} advanced={!!view.advanced} />}
      <p className="actions quiz-center">
        <button type="button" className="btn" onClick={() => download(`quiz-${view.pin}-results.csv`, resultsCsv(view), 'text/csv')}>
          Download results (CSV)
        </button>
        <button type="button" className="btn btn--danger" disabled={busy} onClick={() => act('close')}>
          Close room
        </button>
      </p>
      <p className="muted small">Players can review the answers as flashcards until you close the room.</p>
    </div>
  );
}
