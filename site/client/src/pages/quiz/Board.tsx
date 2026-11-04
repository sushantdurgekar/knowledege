import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { BusyLine } from '../../components/forms';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { TYPE_LABELS, useRoomPoll } from '../../lib/quiz';
import { Leaderboard } from './Answering';

/** `/quiz/board/:pin`: the live leaderboard, for anyone (playing or just following along). */
export function Board() {
  const { pin = '' } = useParams();
  useDocumentTitle(`Leaderboard ${pin}`);
  const { view, fatal } = useRoomPoll(`/api/quiz/rooms/${encodeURIComponent(pin)}/board`, {});
  if (fatal) {
    return (
      <section className="page" aria-labelledby="page-title">
        <h1 id="page-title">No live quiz with PIN {pin}</h1>
        <p className="lede">{fatal}</p>
        <WatchForm />
      </section>
    );
  }
  if (!view) return <BusyLine>Loading the leaderboard…</BusyLine>;
  const status =
    view.phase === 'lobby'
      ? 'Waiting for the host to start'
      : view.phase === 'finished'
        ? 'Final results'
        : view.mode === 'self'
          ? 'Self-paced: players are answering at their own pace'
          : view.current
            ? `${view.phase === 'question' ? 'Now' : 'Just answered'}: ${view.current.index + 1} of ${view.total} · ${TYPE_LABELS[view.current.type]}`
            : '';
  return (
    <section className="page board" aria-labelledby="page-title">
      <p className="eyebrow">Live leaderboard · PIN {pin}</p>
      <h1 id="page-title">{view.title}</h1>
      <p className="board__status">
        <span className={`board__dot${view.phase === 'finished' ? ' is-done' : ''}`} aria-hidden="true" /> {status} ·{' '}
        {view.playerCount} players
      </p>
      {view.current && view.phase !== 'finished' && <p className="muted">{view.current.text}</p>}
      <Leaderboard rows={view.leaderboard ?? []} />
      <p className="muted small">Scores update after each question is revealed.</p>
      <p className="actions">
        {view.phase !== 'finished' && (
          <Link className="btn btn--primary" to={`/quiz?pin=${pin}`}>
            Join this quiz
          </Link>
        )}
      </p>
    </section>
  );
}

/** "Just watching?": open a room's leaderboard by PIN. */
export function WatchForm() {
  const navigate = useNavigate();
  const [pin, setPin] = useState('');
  const go = (e: FormEvent) => {
    e.preventDefault();
    const code = pin.replace(/\D/g, '');
    if (code.length === 6) navigate(`/quiz/board/${code}`);
  };
  return (
    <form className="watch-form" onSubmit={go}>
      <label htmlFor="watch-pin">Just watching? Follow the leaderboard</label>
      <div className="watch-form__row">
        <input id="watch-pin" inputMode="numeric" maxLength={7} placeholder="PIN" value={pin} onChange={(e) => setPin(e.target.value)} />
        <button type="submit" className="btn">
          Watch
        </button>
      </div>
    </form>
  );
}
