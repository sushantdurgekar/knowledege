import { useEffect, useState } from 'react';
import { BusyLine, FormMessage } from '../../components/forms';
import { apiMessage, fetchCards, TYPE_LABELS, type Card } from '../../lib/quiz';
import { SlideBody } from './Answering';

/**
 * Study mode: read each card, think of the answer, flip it, and say whether you knew it.
 * Cards you missed come back in a second round. Slides are reading cards (no flip needed).
 */
export function Flashcards({ pin, token, onClose }: { pin: string; token: string; onClose: () => void }) {
  const [cards, setCards] = useState<Card[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queue, setQueue] = useState<number[]>([]);
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [missed, setMissed] = useState<number[]>([]);
  const [known, setKnown] = useState(0);
  const [round, setRound] = useState(1);

  useEffect(() => {
    fetchCards(pin, token)
      .then((r) => {
        setCards(r.cards);
        setQueue(r.cards.map((_, i) => i));
      })
      .catch((e) => setError(apiMessage(e)));
  }, [pin, token]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select')) return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        setFlipped((f) => !f);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  if (error) return <FormMessage tone="error">{error}</FormMessage>;
  if (!cards) return <BusyLine>Loading flashcards…</BusyLine>;
  if (cards.length === 0) return <p className="muted">This quiz has no flashcards.</p>;

  const finished = pos >= queue.length;
  const grade = (knew: boolean) => {
    const id = queue[pos]!;
    if (knew) setKnown((k) => k + 1);
    else setMissed((m) => [...m, id]);
    setFlipped(false);
    setPos((p) => p + 1);
  };

  if (finished) {
    return (
      <section className="flash flash--done" aria-label="Flashcards">
        <p className="quiz-big">Round {round} done</p>
        <p className="lede">
          You knew {known} of {queue.length}.{missed.length ? ` ${missed.length} to go over again.` : ' Nice work!'}
        </p>
        <p className="actions">
          {missed.length > 0 && (
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                setQueue(missed);
                setMissed([]);
                setKnown(0);
                setPos(0);
                setRound((r) => r + 1);
              }}
            >
              Study the {missed.length} missed
            </button>
          )}
          <button type="button" className="btn" onClick={onClose}>
            Done studying
          </button>
        </p>
      </section>
    );
  }

  const card = cards[queue[pos]!]!;
  const reading = card.type === 'slide';
  return (
    <section className="flash" aria-label="Flashcards">
      <div className="flash__meta">
        <span>
          Card {pos + 1} of {queue.length}
          {round > 1 ? ` · round ${round}` : ''}
        </span>
        <button type="button" className="btn btn--small btn--quiet" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="flash__progress" aria-hidden="true">
        <i style={{ width: `${(pos / queue.length) * 100}%` }} />
      </div>
      {reading ? (
        <div className="flash__card flash__card--read">
          <SlideBody text={card.front} body={card.back} />
        </div>
      ) : (
        <button
          type="button"
          className={`flash__card${flipped ? ' is-flipped' : ''}`}
          onClick={() => setFlipped((f) => !f)}
          aria-label={flipped ? 'Show the question' : 'Show the answer'}
        >
          <span className="flash__face flash__face--front">
            <span className="flash__type">{TYPE_LABELS[card.type]}</span>
            <span className="flash__q">{card.front}</span>
            {card.options && <span className="flash__opts">{card.options.join(' · ')}</span>}
            <span className="flash__hint">Think of the answer, then tap to flip</span>
          </span>
          <span className="flash__face flash__face--back">
            <span className="flash__type">Answer</span>
            <span className="flash__a">{card.back}</span>
            {card.explain && <span className="flash__explain">{card.explain}</span>}
          </span>
        </button>
      )}
      <p className="actions flash__actions">
        {reading ? (
          <button type="button" className="btn btn--primary" onClick={() => grade(true)}>
            Got it, next
          </button>
        ) : flipped ? (
          <>
            <button type="button" className="btn" onClick={() => grade(false)}>
              Study again
            </button>
            <button type="button" className="btn btn--primary" onClick={() => grade(true)}>
              I knew it
            </button>
          </>
        ) : (
          <button type="button" className="btn btn--primary" onClick={() => setFlipped(true)}>
            Show answer
          </button>
        )}
      </p>
    </section>
  );
}
