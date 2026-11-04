import { useState } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { BusyLine, FormMessage } from '../../components/forms';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { apiMessage, playerToken, sendAnswer, setPlayerToken, TYPE_LABELS, useCountdown, useRoomPoll } from '../../lib/quiz';
import { Answering, Leaderboard, Solution } from './Answering';

/** `/quiz/play/:pin`: the player's screen, from the lobby to the final ranking. */
export function PlayRoom() {
  const { pin = '' } = useParams();
  const token = playerToken(pin);
  if (!token) return <Navigate to={`/quiz?pin=${encodeURIComponent(pin)}`} replace />;
  return <Playing pin={pin} token={token} />;
}

function Playing({ pin, token }: { pin: string; token: string }) {
  useDocumentTitle('Live quiz');
  const { view, fatal, offline, push } = useRoomPoll(`/api/quiz/rooms/${encodeURIComponent(pin)}`, {
    'X-Quiz-Token': token,
  });
  const seconds = useCountdown(view);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (fatal) {
    setPlayerToken(pin, null);
    return (
      <section className="page" aria-labelledby="page-title">
        <h1 id="page-title">Quiz unavailable</h1>
        <p className="lede">{fatal}</p>
        <p className="actions">
          <Link className="btn btn--primary" to="/quiz">
            Join another quiz
          </Link>
          <Link className="btn" to="/">
            Back to home
          </Link>
        </p>
      </section>
    );
  }
  if (!view?.me) return <BusyLine>Connecting to room {pin}…</BusyLine>;
  const { me, question: q } = view;

  const answer = async (value: unknown) => {
    if (!q) return;
    setSending(true);
    setError(null);
    try {
      push(await sendAnswer(pin, token, q.index, value));
    } catch (e) {
      setError(apiMessage(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="page quiz-play" aria-labelledby="page-title">
      <header className="quiz-bar">
        <span className="quiz-bar__title" id="page-title">
          {view.title}
        </span>
        <span className="quiz-bar__me">
          {me.name} · <strong>{me.score.toLocaleString()}</strong> pts
        </span>
      </header>
      {offline && <FormMessage tone="info">Reconnecting…</FormMessage>}

      {view.phase === 'lobby' && (
        <div className="quiz-wait">
          <p className="quiz-big">You’re in!</p>
          <p className="lede">See your nickname on the host’s screen? Waiting for the host to start…</p>
          <p className="muted">{view.playerCount} player(s) in the room</p>
        </div>
      )}

      {view.phase === 'question' && q && (
        <div className="quiz-q">
          <div className="quiz-q__meta">
            <span>
              Question {q.index + 1} of {view.total} · {TYPE_LABELS[q.type]}
            </span>
            <span className={`quiz-timer${seconds <= 5 ? ' is-low' : ''}`} aria-live="off">
              {seconds}s
            </span>
          </div>
          <h2 className="quiz-q__text">{q.text}</h2>
          {me.answered ? (
            <div className="quiz-wait">
              <p className="quiz-big">Answer locked in</p>
              <p className="muted">Waiting for the others…</p>
            </div>
          ) : (
            <Answering key={q.index} q={q} disabled={sending || seconds === 0} onAnswer={answer} />
          )}
          {error && <FormMessage tone="error">{error}</FormMessage>}
        </div>
      )}

      {view.phase === 'reveal' && q && (
        <div className="quiz-q">
          <div
            className={`quiz-result ${me.lastCorrect ? 'is-right' : me.answered ? (me.lastPoints ? 'is-part' : 'is-wrong') : 'is-wrong'}`}
            role="status"
          >
            <p className="quiz-big">
              {!me.answered ? 'Time’s up' : me.lastCorrect ? 'Correct!' : me.lastPoints ? 'Partly right' : 'Not this time'}
            </p>
            <p>
              +{(me.lastPoints ?? 0).toLocaleString()} points · you are <strong>#{me.rank}</strong>
              {me.streak > 1 ? ` · ${me.streak} in a row` : ''}
            </p>
          </div>
          <h2 className="quiz-q__text">{q.text}</h2>
          <Solution q={q} mine={me.answer} />
          {q.explain && <p className="quiz-explain">{q.explain}</p>}
          <p className="muted">Waiting for the next question…</p>
        </div>
      )}

      {view.phase === 'finished' && (
        <div className="quiz-final">
          <p className="quiz-big">You finished #{me.rank}</p>
          <p className="lede">
            {me.score.toLocaleString()} points · {me.correctCount} of {view.total} correct
          </p>
          <h2>Top players</h2>
          <Leaderboard rows={view.leaderboard ?? []} highlight={me.id} />
          <p className="actions">
            <Link className="btn btn--primary" to="/quiz" onClick={() => setPlayerToken(pin, null)}>
              Join another quiz
            </Link>
            <Link className="btn" to="/">
              Back to home
            </Link>
          </p>
        </div>
      )}
    </section>
  );
}
