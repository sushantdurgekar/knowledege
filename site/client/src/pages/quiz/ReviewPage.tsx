import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { BusyLine } from '../../components/forms';
import { useMe } from '../../context/me';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { TYPE_LABELS } from '../../lib/quiz';
import { commit, dueCards, loadState, markStudied, pull, schedule, type QuizState } from '../../lib/quiz-history';
import { deckToVault } from '../../lib/vault-export';
import { VaultExport } from './VaultExport';

const GRADES = [
  { grade: 1, label: 'Again', note: 'forgot' },
  { grade: 3, label: 'Hard', note: 'slow recall' },
  { grade: 4, label: 'Good', note: 'recalled' },
  { grade: 5, label: 'Easy', note: 'instant' },
] as const;

/** `/quiz/review`: the player's spaced-repetition deck (cards from every quiz they played). */
export function ReviewPage() {
  useDocumentTitle('Review deck');
  const { me } = useMe();
  const signedIn = me.status === 'signed-in';
  const [state, setState] = useState<QuizState | null>(null);
  const [queue, setQueue] = useState<string[]>([]);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(0);

  useEffect(() => {
    if (me.status === 'loading') return;
    const ready = (s: QuizState) => {
      setState(s);
      setQueue(dueCards(s).map((c) => c.id));
    };
    if (signedIn) void pull().then(ready);
    else ready(loadState());
  }, [me.status, signedIn]);

  if (!state) return <BusyLine>Loading your review deck…</BusyLine>;
  const total = Object.keys(state.deck).length;
  const card = queue.length ? state.deck[queue[0]!] : undefined;

  const grade = (g: number) => {
    if (!card) return;
    const next = markStudied({ ...state, deck: { ...state.deck, [card.id]: schedule(card, g) } });
    setState(next);
    commit(next, signedIn);
    setFlipped(false);
    setDone((d) => d + 1);
    // "Again" comes back at the end of this session; the others are done for today.
    setQueue((q) => (g < 3 ? [...q.slice(1), card.id] : q.slice(1)));
  };

  return (
    <section className="page page--wide review" aria-labelledby="page-title">
      <p className="eyebrow">Live quiz</p>
      <h1 id="page-title">Review deck</h1>
      <p className="lede">
        Questions from the quizzes you played come back just before you would forget them (spaced repetition).{' '}
        {signedIn ? 'Synced to your account.' : 'Saved in this browser; sign in to keep it on every device.'}{' '}
        <Link to="/quiz/progress">See your progress</Link>.
      </p>

      <div className="review__stats">
        <span>
          <strong>{queue.length}</strong> due now
        </span>
        <span>
          <strong>{total}</strong> cards
        </span>
        <span>
          <strong>{done}</strong> reviewed this session
        </span>
      </div>

      {total === 0 ? (
        <div className="notice">
          <h2>Nothing here yet</h2>
          <p>Play a quiz: its questions land here, and the ones you missed are due first.</p>
          <Link className="btn btn--primary" to="/quiz">
            Join a quiz
          </Link>
        </div>
      ) : !card ? (
        <div className="notice">
          <h2>All caught up</h2>
          <p>
            No cards are due. Next one:{' '}
            {new Date(Math.min(...Object.values(state.deck).map((c) => c.due))).toLocaleString()}.
          </p>
        </div>
      ) : (
        <div className="flash">
          <button
            type="button"
            className={`flash__card${flipped ? ' is-flipped' : ''}`}
            onClick={() => setFlipped((f) => !f)}
            aria-label={flipped ? 'Show the question' : 'Show the answer'}
          >
            <span className="flash__face flash__face--front">
              <span className="flash__type">
                {TYPE_LABELS[card.type]} · {card.quiz}
              </span>
              <span className="flash__q">{card.front}</span>
              {card.options && <span className="flash__opts">{card.options.join(' · ')}</span>}
              <span className="flash__hint">Answer it in your head, then tap to check</span>
            </span>
            <span className="flash__face flash__face--back">
              <span className="flash__type">Answer</span>
              <span className="flash__a">{card.back}</span>
              {card.explain && <span className="flash__explain">{card.explain}</span>}
            </span>
          </button>
          <p className="actions flash__actions">
            {flipped ? (
              GRADES.map((g) => (
                <button key={g.grade} type="button" className={`btn${g.grade === 4 ? ' btn--primary' : ''}`} onClick={() => grade(g.grade)}>
                  {g.label} <span className="muted small">{g.note}</span>
                </button>
              ))
            ) : (
              <button type="button" className="btn btn--primary" onClick={() => setFlipped(true)}>
                Show answer
              </button>
            )}
          </p>
        </div>
      )}

      {total > 0 && (
        <section className="review__vault" aria-labelledby="vault-title">
          <h2 id="vault-title">Keep these cards in your Knowledge vault</h2>
          <p className="muted small">
            Download the whole deck, with its review schedule, for the pro-instructor deck (practice/srs/cards.jsonl).
          </p>
          <VaultExport name="my-review-deck" load={() => deckToVault(Object.values(state.deck))} />
        </section>
      )}

      {state.history.length > 0 && (
        <section className="review__history" aria-labelledby="history-title">
          <h2 id="history-title">Your quizzes</h2>
          <div className="table-scroll">
          <table className="self-dash__table">
            <thead>
              <tr>
                <th scope="col">Quiz</th>
                <th scope="col">Date</th>
                <th scope="col">Score</th>
                <th scope="col">Correct</th>
                <th scope="col">Rank</th>
                <th scope="col">Sure but wrong</th>
              </tr>
            </thead>
            <tbody>
              {state.history.map((h) => (
                <tr key={h.id}>
                  <td>{h.title}</td>
                  <td>{new Date(h.at).toLocaleDateString()}</td>
                  <td className="mono">{h.score.toLocaleString()}</td>
                  <td>
                    {h.correct} / {h.total}
                  </td>
                  <td>
                    #{h.rank} of {h.players}
                  </td>
                  <td>{h.calibration ? h.calibration.sureWrong : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </section>
      )}
    </section>
  );
}
