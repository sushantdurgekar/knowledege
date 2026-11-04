import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { BusyLine, FormMessage } from '../../components/forms';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useMe } from '../../context/me';
import {
  advance,
  apiMessage,
  askHint,
  fetchCards,
  fetchReview,
  type Confidence,
  playerToken,
  sendAnswer,
  setPlayerToken,
  TYPE_LABELS,
  useCountdown,
  useRoomPoll,
  type RoomView,
} from '../../lib/quiz';
import { commit, dueCards, loadState, recordQuiz } from '../../lib/quiz-history';
import { Answering, Leaderboard, QuestionImage, SlideBody, Solution } from './Answering';
import { TeamBoard, TeamChip } from './Teams';
import { Calibration } from './Calibration';
import { Flashcards } from './Flashcards';
import { Replay } from './Replay';

/** `/quiz/play/:pin`: the player's screen, live or self-paced, from the lobby to the results. */
export function PlayRoom() {
  const { pin = '' } = useParams();
  const token = playerToken(pin);
  if (!token) return <Navigate to={`/quiz?pin=${encodeURIComponent(pin)}`} replace />;
  return <Playing pin={pin} token={token} />;
}

function resultClass(me: NonNullable<RoomView['me']>): string {
  if (me.lastCorrect === null || me.lastCorrect === undefined) return me.answered ? 'is-poll' : 'is-wrong';
  if (me.lastCorrect) return 'is-right';
  return me.lastPoints ? 'is-part' : 'is-wrong';
}

function resultText(me: NonNullable<RoomView['me']>, type?: string): string {
  if (!me.answered) return 'Time’s up';
  if (me.lastCorrect === null || me.lastCorrect === undefined) return type === 'poll' ? 'Thanks for voting' : 'Thanks, answer sent';
  if (me.lastCorrect) return 'Correct!';
  return me.lastPoints ? 'Partly right' : 'Not this time';
}

function Playing({ pin, token }: { pin: string; token: string }) {
  useDocumentTitle('Live quiz');
  const { view, fatal, offline, push } = useRoomPoll(`/api/quiz/rooms/${encodeURIComponent(pin)}`, {
    'X-Quiz-Token': token,
  });
  const seconds = useCountdown(view);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [studying, setStudying] = useState(false);
  const [replaying, setReplaying] = useState(false);
  const [confidence, setConfidence] = useState<{ index: number; value: Confidence } | null>(null);
  const [hints, setHints] = useState<{ index: number; list: string[] } | null>(null);
  const [saved, setSaved] = useState<{ added: number; due: number } | null>(null);
  const recorded = useRef(false);
  const { me: account } = useMe();
  const signedIn = account.status === 'signed-in';
  const finishedNow = !!view && (view.phase === 'finished' || (view.mode === 'self' && view.stage === 'done'));

  // When this player is done: add the quiz to their history and its questions to the review
  // deck (missed ones due now). Once per room.
  useEffect(() => {
    if (!finishedNow || !view?.me || recorded.current) return;
    recorded.current = true;
    const me = view.me;
    void (async () => {
      try {
        const [{ cards }, review] = await Promise.all([fetchCards(pin, token), fetchReview(pin, token)]);
        const missed = new Set(review.items.filter((i) => !i.correct).map((i) => i.text));
        const before = loadState();
        const state = recordQuiz(
          before,
          {
            id: `${pin}:${me.id}`,
            title: view.title,
            at: Date.now(),
            score: me.score,
            rank: me.rank,
            players: view.playerCount,
            correct: me.correctCount,
            total: view.scoredTotal,
            calibration: me.calibration,
          },
          cards,
          missed,
        );
        commit(state, signedIn);
        setSaved({ added: Object.keys(state.deck).length - Object.keys(before.deck).length, due: dueCards(state).length });
      } catch {
        /* the room closed meanwhile: nothing to record */
      }
    })();
  }, [finishedNow, view, pin, token, signedIn]);

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
  const self = view.mode === 'self';
  const finished = view.phase === 'finished' || (self && view.stage === 'done');
  const canStudy = finished || (self && view.study);

  const run = async (call: () => Promise<RoomView>) => {
    setSending(true);
    setError(null);
    try {
      push(await call());
    } catch (e) {
      setError(apiMessage(e));
    } finally {
      setSending(false);
    }
  };
  const needsConfidence = !!view.advanced && !!q && !['poll', 'explain', 'slide'].includes(q.type);
  const myConfidence = confidence && q && confidence.index === q.index ? confidence.value : null;
  const myHints = q && hints?.index === q.index ? hints.list : (me.hints ?? []);
  const answer = (value: unknown) =>
    q && run(() => sendAnswer(pin, token, q.index, value, needsConfidence ? (myConfidence ?? undefined) : undefined));
  const takeHint = async () => {
    if (!q) return;
    try {
      const r = await askHint(pin, token, q.index);
      setHints({ index: q.index, list: r.hints });
    } catch (e) {
      setError(apiMessage(e));
    }
  };
  const next = () => run(() => advance(pin, token));

  const bar = (
    <header className="quiz-bar">
      <span className="quiz-bar__title" id="page-title">
        {view.title}
      </span>
      <span className="quiz-bar__me">
        <TeamChip team={me.team} />
        {me.name} · <strong>{me.score.toLocaleString()}</strong> pts
      </span>
    </header>
  );

  if (replaying) {
    return (
      <section className="page quiz-play" aria-labelledby="page-title">
        {bar}
        <Replay pin={pin} token={token} onClose={() => setReplaying(false)} />
      </section>
    );
  }

  if (studying) {
    return (
      <section className="page quiz-play" aria-labelledby="page-title">
        {bar}
        <Flashcards pin={pin} token={token} onClose={() => setStudying(false)} />
      </section>
    );
  }

  const open = self ? view.stage === 'question' : view.phase === 'question';
  const revealed = self ? view.stage === 'reveal' : view.phase === 'reveal';

  return (
    <section className="page quiz-play" aria-labelledby="page-title">
      {bar}
      {offline && <FormMessage tone="info">Reconnecting…</FormMessage>}
      {error && <FormMessage tone="error">{error}</FormMessage>}

      {view.phase === 'lobby' && (
        <div className="quiz-wait">
          <p className="quiz-big">You’re in!</p>
          <p className="lede">
            {self
              ? view.opensAt && view.opensAt > Date.now()
                ? `This is a self-paced challenge. It opens ${new Date(view.opensAt).toLocaleString()}.`
                : 'This is a self-paced quiz. It opens when the host starts it.'
              : 'See your nickname on the host’s screen? Waiting for the host to start…'}
          </p>
          <p className="muted">{view.playerCount} player(s) in the room</p>
          {view.study && (
            <button type="button" className="btn btn--primary" onClick={() => setStudying(true)}>
              Study the flashcards while you wait
            </button>
          )}
        </div>
      )}

      {self && view.phase === 'question' && view.stage === 'ready' && (
        <div className="quiz-wait">
          <p className="quiz-big">Ready when you are</p>
          <p className="lede">
            {view.total} items at your own pace. Each question has its own timer; answering sooner scores more.
          </p>
          <p className="actions quiz-center">
            {view.study && (
              <button type="button" className="btn" onClick={() => setStudying(true)}>
                Study flashcards first
              </button>
            )}
            <button type="button" className="btn btn--primary" disabled={sending} onClick={next}>
              Start the quiz
            </button>
          </p>
        </div>
      )}

      {open && q && q.type === 'slide' && (
        <div className="quiz-q">
          <p className="quiz-q__meta">
            <span>
              {q.index + 1} of {view.total} · Slide
            </span>
          </p>
          <SlideBody text={q.text} body={q.body} image={q.image} />
          {self ? (
            <button type="button" className="btn btn--primary btn--wide" disabled={sending} onClick={next}>
              Continue
            </button>
          ) : (
            <p className="muted">The host will move on when everyone has read this.</p>
          )}
        </div>
      )}

      {open && q && q.type !== 'slide' && (
        <div className="quiz-q">
          <div className="quiz-q__meta">
            <span>
              {q.index + 1} of {view.total} · {TYPE_LABELS[q.type]}
            </span>
            <span className={`quiz-timer${seconds <= 5 ? ' is-low' : ''}`} aria-live="off">
              {seconds}s
            </span>
          </div>
          <h2 className="quiz-q__text">{q.text}</h2>
          <QuestionImage id={q.image} alt={`Picture for the question: ${q.text}`} />
          {me.answered ? (
            <div className="quiz-wait">
              <p className="quiz-big">Answer locked in</p>
              <p className="muted">Waiting for the others…</p>
            </div>
          ) : (
            <>
              {(q.hintCount ?? 0) > 0 && (
                <div className="quiz-hints">
                  {myHints.map((h, i) => (
                    <p key={i} className="quiz-hint">
                      💡 {h}
                    </p>
                  ))}
                  {myHints.length < (q.hintCount ?? 0) && (
                    <button type="button" className="btn btn--small btn--quiet" onClick={takeHint}>
                      {myHints.length ? 'Another hint' : 'Show a hint'} (−25% points)
                    </button>
                  )}
                </div>
              )}
              {needsConfidence && (
                <div className="quiz-confidence" role="radiogroup" aria-label="How sure are you?">
                  <span className="quiz-confidence__label">{myConfidence ? 'Confidence:' : 'First: how sure are you?'}</span>
                  {(['sure', 'unsure'] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      role="radio"
                      aria-checked={myConfidence === c}
                      className={`quiz-confidence__btn${myConfidence === c ? ' is-on' : ''}`}
                      onClick={() => setConfidence({ index: q.index, value: c })}
                    >
                      {c === 'sure' ? 'I’m sure' : 'Not sure'}
                    </button>
                  ))}
                </div>
              )}
              <Answering
                key={`${q.index}`}
                q={q}
                disabled={sending || seconds === 0 || (needsConfidence && !myConfidence)}
                onAnswer={answer}
              />
            </>
          )}
        </div>
      )}

      {revealed && q && (
        <div className="quiz-q">
          {q.type !== 'slide' && (
            <div className={`quiz-result ${resultClass(me)}`} role="status">
              <p className="quiz-big">{resultText(me, q.type)}</p>
              {me.lastCorrect !== null && (
                <p>
                  +{(me.lastPoints ?? 0).toLocaleString()} points · you are <strong>#{me.rank}</strong>
                  {me.streak > 1 ? ` · ${me.streak} in a row` : ''}
                </p>
              )}
            </div>
          )}
          <h2 className="quiz-q__text">{q.text}</h2>
          <QuestionImage id={q.image} alt={`Picture for the question: ${q.text}`} />
          <Solution q={q} mine={me.answer} />
          {q.explain && <p className="quiz-explain">{q.explain}</p>}
          {self ? (
            <button type="button" className="btn btn--primary btn--wide" disabled={sending} onClick={next}>
              {q.index + 1 >= view.total ? 'See my results' : 'Next'}
            </button>
          ) : (
            <p className="muted">Waiting for the next question…</p>
          )}
        </div>
      )}

      {finished && (
        <div className="quiz-final">
          <p className="quiz-big">{view.phase === 'finished' ? `You finished #${me.rank}` : 'All done!'}</p>
          <p className="lede">
            {me.score.toLocaleString()} points · {me.correctCount} of {view.scoredTotal} correct
            {view.phase !== 'finished' ? ` · #${me.rank} so far` : ''}
          </p>
          {me.calibration && <Calibration c={me.calibration} />}
          {saved && (
            <p className="quiz-saved">
              {saved.added > 0 ? `${saved.added} new card(s) added to your review deck. ` : ''}
              <Link to="/quiz/review">{saved.due} due for review now</Link> · <Link to="/quiz/progress">your progress</Link>
              {signedIn ? ' · synced to your account' : ' · saved in this browser (sign in to keep it everywhere)'}
            </p>
          )}
          {view.teamBoard && view.teamBoard.length > 0 && (
            <>
              <h2>Teams</h2>
              <TeamBoard rows={view.teamBoard} highlight={me.team} />
            </>
          )}
          {view.closesAt && view.phase !== 'finished' && (
            <p className="muted">The challenge closes {new Date(view.closesAt).toLocaleString()}; the final ranking settles then.</p>
          )}
          <h2>Top players</h2>
          <Leaderboard rows={view.leaderboard ?? []} highlight={me.id} />
          <p className="actions quiz-center">
            {me.correctCount < view.scoredTotal && (
              <button type="button" className="btn btn--primary" onClick={() => setReplaying(true)}>
                Replay my mistakes
              </button>
            )}
            {canStudy && (
              <button type="button" className="btn" onClick={() => setStudying(true)}>
                Review with flashcards
              </button>
            )}
            <Link className="btn" to="/quiz" onClick={() => setPlayerToken(pin, null)}>
              Join another quiz
            </Link>
          </p>
        </div>
      )}
    </section>
  );
}
