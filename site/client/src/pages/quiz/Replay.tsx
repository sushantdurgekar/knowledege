import { useEffect, useState } from 'react';
import { BusyLine, FormMessage } from '../../components/forms';
import { apiMessage, checkLocally, fetchReview, TYPE_LABELS, type ReviewItem } from '../../lib/quiz';
import { Answering, Solution } from './Answering';

/** "Replay my mistakes": re-ask only the questions this player missed, checked in the browser. */
export function Replay({ pin, token, onClose }: { pin: string; token: string; onClose: () => void }) {
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pos, setPos] = useState(0);
  const [answer, setAnswer] = useState<{ value: unknown; right: boolean } | null>(null);
  const [right, setRight] = useState(0);

  useEffect(() => {
    fetchReview(pin, token)
      .then((r) => setItems(r.items.filter((i) => !i.correct)))
      .catch((e) => setError(apiMessage(e)));
  }, [pin, token]);

  if (error) return <FormMessage tone="error">{error}</FormMessage>;
  if (!items) return <BusyLine>Loading your mistakes…</BusyLine>;
  if (items.length === 0) {
    return (
      <div className="quiz-wait">
        <p className="quiz-big">No mistakes to replay</p>
        <button type="button" className="btn" onClick={onClose}>
          Back
        </button>
      </div>
    );
  }
  if (pos >= items.length) {
    return (
      <div className="quiz-wait">
        <p className="quiz-big">
          {right} of {items.length} right this time
        </p>
        <p className="lede">{right === items.length ? 'All fixed. Nice work!' : 'The ones you missed are in your review deck for later.'}</p>
        <p className="actions quiz-center">
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              setPos(0);
              setRight(0);
              setAnswer(null);
            }}
          >
            Replay again
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Done
          </button>
        </p>
      </div>
    );
  }

  const item = items[pos]!;
  return (
    <div className="quiz-q replay">
      <div className="quiz-q__meta">
        <span>
          Mistake {pos + 1} of {items.length} · {TYPE_LABELS[item.type]}
        </span>
        <button type="button" className="btn btn--small btn--quiet" onClick={onClose}>
          Close
        </button>
      </div>
      <h2 className="quiz-q__text">{item.text}</h2>
      {answer === null ? (
        <Answering
          key={pos}
          q={{ ...item, remainingMs: 0 }}
          disabled={false}
          onAnswer={(value) => {
            const ok = checkLocally(item, value);
            setAnswer({ value, right: ok });
            if (ok) setRight((r) => r + 1);
          }}
        />
      ) : (
        <>
          <div className={`quiz-result ${answer.right ? 'is-right' : 'is-wrong'}`} role="status">
            <p className="quiz-big">{answer.right ? 'Got it now!' : 'Not yet'}</p>
          </div>
          <Solution q={item} mine={answer.value} />
          {item.explain && <p className="quiz-explain">{item.explain}</p>}
          <button
            type="button"
            className="btn btn--primary btn--wide"
            onClick={() => {
              setAnswer(null);
              setPos((p) => p + 1);
            }}
          >
            Next
          </button>
        </>
      )}
    </div>
  );
}
