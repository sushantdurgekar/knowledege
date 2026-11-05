import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { BusyLine, FormMessage } from '../../components/forms';
import { useMe } from '../../context/me';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import {
  getOpen,
  levelLabel,
  OPEN_TIME,
  openAsServerQuiz,
  openRecord,
  openTitle,
  playItems,
  recordOpenGame,
  scoreAnswer,
  shuffleAnswers,
  type OpenQuiz,
  type PlayItem,
  type PlayResult,
} from '../../lib/open-quiz';
import { apiMessage, createRoom, setHostSecret, type Mode, type QuestionView, type RoomOptions } from '../../lib/quiz';
import { commit, dueCards, loadState, pull } from '../../lib/quiz-history';
import { play, setSoundPreference, soundPreference, unlockAudio } from '../../lib/sound';
import { LETTERS, Solution } from './Answering';
import { Confetti } from './Confetti';
import { HostOptions } from './HostOptions';

type Stage = 'intro' | 'question' | 'feedback' | 'done' | 'retry';

/**
 * `/quiz/open/:id[?level=N]`: play a hub's topics solo, in the browser (level 1: the first three
 * topics). No room, no host.
 */
export function OpenPlay() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const level = Math.max(1, Math.floor(Number(params.get('level'))) || 1);
  const [quiz, setQuiz] = useState<OpenQuiz | null>(null);
  const [error, setError] = useState<string | null>(null);
  useDocumentTitle(quiz ? openTitle(quiz) : 'Open quiz');

  useEffect(() => {
    setQuiz(null);
    setError(null);
    getOpen(id, level)
      .then(setQuiz)
      .catch((e) => setError(apiMessage(e)));
  }, [id, level]);

  if (error) {
    return (
      <section className="page" aria-labelledby="page-title">
        <h1 id="page-title">Quiz not found</h1>
        <FormMessage tone="error">{error}</FormMessage>
        <Link className="btn" to="/quiz/open">
          All open quizzes
        </Link>
      </section>
    );
  }
  if (!quiz) return <BusyLine>Loading the quiz…</BusyLine>;
  return <Game key={`${quiz.id}:${quiz.level ?? 1}`} quiz={quiz} />;
}

function Game({ quiz }: { quiz: OpenQuiz }) {
  const { me } = useMe();
  const signedIn = me.status === 'signed-in';
  const admin = signedIn && me.user.admin;
  // Each game gets its own answer order (see restart), so replays test knowledge, not positions.
  const [items, setItems] = useState<PlayItem[]>(() => playItems(quiz));
  const [stage, setStage] = useState<Stage>('intro');
  const [pos, setPos] = useState(0);
  const [results, setResults] = useState<PlayResult[]>([]);
  const [streak, setStreak] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [sound, setSound] = useState(soundPreference);
  const [saved, setSaved] = useState<{ due: number; best: boolean } | null>(null);
  const [record, setRecord] = useState(() => openRecord(loadState(), quiz));

  const item = items[pos];
  const left = Math.max(0, Math.ceil(OPEN_TIME - (now - startedAt) / 1000));
  const score = results.reduce((n, r) => n + r.points, 0);

  // The question timer: ticks in the last five seconds, then "time's up".
  useEffect(() => {
    if (stage !== 'question') return;
    const timer = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(timer);
  }, [stage]);
  const lastTick = useRef(-1);
  useEffect(() => {
    if (stage !== 'question') return;
    if (left <= 0) {
      answer(null);
      return;
    }
    if (sound && left <= 5 && left !== lastTick.current) {
      lastTick.current = left;
      play(left <= 3 ? 'tock' : 'tick');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left, stage]);

  const open = (index: number) => {
    setPos(index);
    setStartedAt(Date.now());
    setNow(Date.now());
    lastTick.current = -1;
    setStage('question');
    if (sound) play('start');
  };

  const answer = (pick: number | null) => {
    if (stage !== 'question' || !item) return;
    const right = pick === item.a;
    const nextStreak = right ? streak + 1 : 0;
    const { points } = scoreAnswer(right, Date.now() - startedAt, nextStreak);
    setStreak(nextStreak);
    setResults((r) => [...r, { index: pos, pick, right, points }]);
    setStage('feedback');
    if (sound) play(right ? 'reveal' : 'join');
  };

  const next = () => {
    if (pos + 1 < items.length) open(pos + 1);
    else void finish();
  };

  const finish = async () => {
    setStage('done');
    if (sound) play('finale');
    try {
      const base = signedIn ? await pull() : loadState();
      const state = recordOpenGame(base, quiz, items, results);
      commit(state, signedIn);
      // Compare with the best before this game, then remember this one for the next replay.
      setSaved({ due: dueCards(state).length, best: !record.best || score > record.best.score });
      setRecord(openRecord(state, quiz));
    } catch {
      setSaved(null);
    }
  };

  const restart = () => {
    setItems(shuffleAnswers(playItems(quiz)));
    setResults([]);
    setStreak(0);
    setSaved(null);
    open(0);
  };

  const toggleSound = () => {
    const nextOn = !sound;
    setSound(nextOn);
    setSoundPreference(nextOn);
    if (nextOn) unlockAudio();
  };

  const header = (
    <div className="open-bar">
      <span className="open-bar__title">{openTitle(quiz)}</span>
      {stage !== 'intro' && stage !== 'retry' && (
        <span className="open-bar__score">
          {score.toLocaleString()} pts{streak > 1 ? ` · 🔥 ${streak} in a row` : ''}
        </span>
      )}
      <button type="button" className="btn btn--small btn--quiet" aria-pressed={sound} onClick={toggleSound}>
        <span aria-hidden="true">{sound ? '🔊' : '🔇'}</span> {sound ? 'Sound on' : 'Sound off'}
      </button>
    </div>
  );

  if (stage === 'intro') {
    return (
      <section className="page page--wide open-play" aria-labelledby="page-title">
        {header}
        <p className="eyebrow">Open quiz · no PIN needed</p>
        <h1 id="page-title">{quiz.title}</h1>
        {(quiz.levels ?? 1) > 1 && (
          <nav className="open-levels" aria-label="Topic levels">
            {Array.from({ length: quiz.levels ?? 1 }, (_, i) => i + 1).map((n) => (
              <Link
                key={n}
                className={`open-levels__chip${n === (quiz.level ?? 1) ? ' is-on' : ''}`}
                aria-current={n === (quiz.level ?? 1) ? 'page' : undefined}
                to={n === 1 ? `/quiz/open/${encodeURIComponent(quiz.id)}` : `/quiz/open/${encodeURIComponent(quiz.id)}?level=${n}`}
              >
                {levelLabel(n)}
              </Link>
            ))}
          </nav>
        )}
        <p className="lede">
          {items.length} questions from {(quiz.level ?? 1) > 1 ? openTitle(quiz).split(' · ')[1] : 'the first three topics'},{' '}
          {OPEN_TIME} seconds each. Answer fast for more points; right answers in a row add a streak bonus. Answers are shuffled
          every game.
        </p>
        <ol className="open-play__topics">
          {quiz.topics.map((t) => (
            <li key={t.id}>
              <details>
                <summary>
                  <strong>{t.title}</strong> <span className="muted small">({t.quiz.length} questions)</span>
                </summary>
                <ul className="open-play__keys">
                  {t.keys.map((k) => (
                    <li key={k}>{k}</li>
                  ))}
                </ul>
              </details>
            </li>
          ))}
        </ol>
        {record.best && (
          <p className="open-card__best">
            Your best: <strong>{record.best.score.toLocaleString()}</strong> ({record.best.correct}/{record.best.total}) · played{' '}
            {record.plays}×
          </p>
        )}
        <p className="actions">
          <button
            type="button"
            className="btn btn--primary btn--big"
            onClick={() => {
              unlockAudio();
              restart();
            }}
          >
            Play
          </button>
          {quiz.slug && (
            <Link className="btn" to={`/h/${quiz.slug}`} reloadDocument>
              Study the hub first
            </Link>
          )}
        </p>
        <p className="muted small">
          {signedIn ? 'Your score and review cards sync to your account.' : 'Your score and review cards stay in this browser. Sign in to keep them on every device.'}
        </p>
        {admin && <HostPanel quiz={quiz} />}
      </section>
    );
  }

  if (stage === 'retry') return <Retry items={items} results={results} header={header} onDone={() => setStage('done')} />;

  if (stage === 'done') {
    const correct = results.filter((r) => r.right).length;
    const missed = results.filter((r) => !r.right).length;
    return (
      <section className="page page--wide open-play" aria-labelledby="page-title">
        {header}
        {saved?.best && correct > 0 && <Confetti />}
        <div className="quiz-final">
          <h1 id="page-title" className="quiz-big">
            {score.toLocaleString()} points
          </h1>
          <p className="lede">
            {correct} of {items.length} right
            {saved?.best && record.best ? ' · a new personal best!' : record.best ? ` · your best is ${record.best.score.toLocaleString()}` : ''}
          </p>
          {saved && (
            <p className="quiz-saved" role="status">
              {signedIn ? 'Saved and synced to your account. ' : 'Saved in this browser. '}
              <Link to="/quiz/review">{saved.due} card(s) due in your review deck</Link> · <Link to="/quiz/progress">your progress</Link>
            </p>
          )}
          <p className="actions quiz-center">
            {missed > 0 && (
              <button type="button" className="btn btn--primary" onClick={() => setStage('retry')}>
                Practise the {missed} I missed
              </button>
            )}
            <button type="button" className="btn" onClick={restart}>
              Play again
            </button>
            <Link className="btn btn--quiet" to="/quiz/open">
              More open quizzes
            </Link>
          </p>
        </div>
      </section>
    );
  }

  if (!item) return null;
  const last = results[results.length - 1];
  const view: QuestionView = {
    index: pos,
    text: item.q,
    type: 'single',
    timeLimit: OPEN_TIME,
    points: 1000,
    remainingMs: 0,
    options: item.o,
    solution: { correct: [item.a] },
  };

  return (
    <section className="page page--wide open-play" aria-labelledby="question-title">
      {header}
      <div className="quiz-q">
        <div className="quiz-q__meta">
          <span>
            {pos + 1} of {items.length} · {item.topic}
          </span>
          {stage === 'question' && (
            <span className={`quiz-timer${left <= 5 ? ' is-low' : ''}`} aria-live="off">
              {left}s
            </span>
          )}
        </div>
        <h2 id="question-title" className="quiz-q__text">
          {item.q}
        </h2>
        {stage === 'question' ? (
          <div className="quiz-options" role="group" aria-label="Answers">
            {item.o.map((option, i) => (
              <button key={i} type="button" className={`quiz-option quiz-option--${i % 8}`} onClick={() => answer(i)}>
                <span className="quiz-option__letter" aria-hidden="true">
                  {LETTERS[i]}
                </span>
                {option}
              </button>
            ))}
          </div>
        ) : (
          last && (
            <>
              <div className={`quiz-result ${last.right ? 'is-right' : 'is-wrong'}`} role="status">
                <p className="quiz-big">{last.right ? 'Correct!' : last.pick === null ? 'Time’s up' : 'Not this time'}</p>
                {last.right && (
                  <p>
                    +{last.points.toLocaleString()} points{streak > 1 ? ` · ${streak} in a row 🔥` : ''}
                  </p>
                )}
              </div>
              <Solution q={view} mine={last.pick ?? undefined} />
              {item.e && <p className="quiz-explain">{item.e}</p>}
              <button type="button" className="btn btn--primary btn--wide" onClick={next} autoFocus>
                {pos + 1 < items.length ? 'Next question' : 'See my score'}
              </button>
            </>
          )
        )}
      </div>
    </section>
  );
}

/** A practice round of the missed questions: no timer, no points, checked at once. */
function Retry({ items, results, header, onDone }: { items: PlayItem[]; results: PlayResult[]; header: ReactNode; onDone: () => void }) {
  const missed = useRef(results.filter((r) => !r.right).map((r) => items[r.index]!)).current;
  const [pos, setPos] = useState(0);
  const [pick, setPick] = useState<number | null>(null);
  const [right, setRight] = useState(0);
  const item = missed[pos];
  if (!item) {
    return (
      <section className="page page--wide open-play" aria-labelledby="page-title">
        {header}
        <div className="quiz-wait">
          <h1 id="page-title" className="quiz-big">
            {right} of {missed.length} right this time
          </h1>
          <p className="lede">{right === missed.length ? 'All fixed. Nice work!' : 'They stay in your review deck, due again soon.'}</p>
          <button type="button" className="btn btn--primary" onClick={onDone}>
            Back to my score
          </button>
        </div>
      </section>
    );
  }
  const view: QuestionView = {
    index: pos,
    text: item.q,
    type: 'single',
    timeLimit: 0,
    points: 0,
    remainingMs: 0,
    options: item.o,
    solution: { correct: [item.a] },
  };
  return (
    <section className="page page--wide open-play" aria-labelledby="question-title">
      {header}
      <div className="quiz-q">
        <p className="quiz-q__meta">
          Practice {pos + 1} of {missed.length} · {item.topic} · no timer, no points
        </p>
        <h2 id="question-title" className="quiz-q__text">
          {item.q}
        </h2>
        {pick === null ? (
          <div className="quiz-options" role="group" aria-label="Answers">
            {item.o.map((option, i) => (
              <button
                key={i}
                type="button"
                className={`quiz-option quiz-option--${i % 8}`}
                onClick={() => {
                  setPick(i);
                  if (i === item.a) setRight((n) => n + 1);
                }}
              >
                <span className="quiz-option__letter" aria-hidden="true">
                  {LETTERS[i]}
                </span>
                {option}
              </button>
            ))}
          </div>
        ) : (
          <>
            <p className="quiz-big">{pick === item.a ? 'Got it now!' : 'Not yet'}</p>
            <Solution q={view} mine={pick} />
            {item.e && <p className="quiz-explain">{item.e}</p>}
            <button
              type="button"
              className="btn btn--primary btn--wide"
              autoFocus
              onClick={() => {
                setPick(null);
                setPos(pos + 1);
              }}
            >
              Next
            </button>
          </>
        )}
      </div>
    </section>
  );
}

/** Admins: run this open quiz as a live room or a self-paced challenge (a normal hosted room). */
function HostPanel({ quiz }: { quiz: OpenQuiz }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode | null>(null);
  const [slides, setSlides] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const host = async (options: RoomOptions) => {
    setBusy(true);
    setError(null);
    try {
      const room = await createRoom(openAsServerQuiz(quiz, slides), options);
      setHostSecret(room.pin, room.hostKey);
      navigate(`/quiz/host/${room.pin}`);
    } catch (e) {
      setError(apiMessage(e));
      setBusy(false);
    }
  };
  return (
    <section className="open-host" aria-labelledby="open-host-title">
      <h2 id="open-host-title">Host it for a group</h2>
      <p className="muted small">
        Runs the same questions in a room with a PIN, a presenter screen and a leaderboard. The open quiz stays playable for everyone
        else.
      </p>
      {error && <FormMessage tone="error">{error}</FormMessage>}
      <label className="studio__check">
        <input type="checkbox" checked={slides} onChange={(e) => setSlides(e.target.checked)} /> Key points as slides before each
        topic
      </label>
      <p className="actions">
        <button type="button" className="btn btn--primary" disabled={busy} onClick={() => setMode('live')}>
          Host live
        </button>
        <button type="button" className="btn" disabled={busy} onClick={() => setMode('self')}>
          Self-paced challenge
        </button>
      </p>
      {mode && (
        <HostOptions
          title={openTitle(quiz)}
          initialMode={mode}
          busy={busy}
          onCancel={() => setMode(null)}
          onStart={(options) => {
            setMode(null);
            void host(options);
          }}
        />
      )}
    </section>
  );
}
