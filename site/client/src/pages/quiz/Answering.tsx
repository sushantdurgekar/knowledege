import { useState, type FormEvent } from 'react';
import type { QuestionView } from '../../lib/quiz';
import { Sortable } from './Sortable';

export const LETTERS = 'ABCDEFGH';

const identity = (n: number) => Array.from({ length: n }, (_, i) => i);

/** A slide (presentation content): the title and its body, paragraphs and "- " bullets kept. */
export function SlideBody({ text, body, big = false }: { text: string; body?: string; big?: boolean }) {
  const blocks = (body ?? '').split(/\n{2,}/).filter((b) => b.trim());
  return (
    <article className={`quiz-slide${big ? ' quiz-slide--big' : ''}`}>
      <h2 className="quiz-slide__title">{text}</h2>
      {blocks.map((block, i) => {
        const lines = block.split('\n');
        if (lines.every((l) => /^\s*[-*•]\s+/.test(l))) {
          return (
            <ul key={i}>
              {lines.map((l, j) => (
                <li key={j}>{l.replace(/^\s*[-*•]\s+/, '')}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="quiz-slide__p">
            {block}
          </p>
        );
      })}
    </article>
  );
}

/** The answer controls for one open question. Calls `onAnswer` once with the answer value. */
export function Answering({
  q,
  disabled,
  onAnswer,
}: {
  q: QuestionView;
  disabled: boolean;
  onAnswer: (value: unknown) => void;
}) {
  if (q.type === 'single' || q.type === 'truefalse' || q.type === 'poll') {
    return (
      <div className="quiz-options" role="group" aria-label="Answers">
        {(q.options ?? []).map((option, i) => (
          <button
            key={i}
            type="button"
            className={`quiz-option quiz-option--${i % 8}`}
            disabled={disabled}
            onClick={() => onAnswer(i)}
          >
            <span className="quiz-option__letter" aria-hidden="true">
              {LETTERS[i]}
            </span>
            {option}
          </button>
        ))}
      </div>
    );
  }
  if (q.type === 'multi') return <MultiAnswer q={q} disabled={disabled} onAnswer={onAnswer} />;
  if (q.type === 'text') return <TextAnswer disabled={disabled} onAnswer={onAnswer} />;
  if (q.type === 'explain') return <ExplainAnswer disabled={disabled} onAnswer={onAnswer} />;
  if (q.type === 'match' || q.type === 'order') return <DragAnswer q={q} disabled={disabled} onAnswer={onAnswer} />;
  return null;
}

function MultiAnswer({ q, disabled, onAnswer }: { q: QuestionView; disabled: boolean; onAnswer: (v: unknown) => void }) {
  const [picked, setPicked] = useState<number[]>([]);
  const toggle = (i: number) => setPicked((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]));
  return (
    <div>
      <p className="muted small">Select every correct answer{q.pick ? ` (${q.pick} to find)` : ''}, then submit.</p>
      <div className="quiz-options" role="group" aria-label="Answers">
        {(q.options ?? []).map((option, i) => (
          <button
            key={i}
            type="button"
            aria-pressed={picked.includes(i)}
            className={`quiz-option quiz-option--${i % 8}`}
            disabled={disabled}
            onClick={() => toggle(i)}
          >
            <span className="quiz-option__letter" aria-hidden="true">
              {picked.includes(i) ? '✓' : LETTERS[i]}
            </span>
            {option}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="btn btn--primary btn--wide quiz-submit"
        disabled={disabled || picked.length === 0}
        onClick={() => onAnswer([...picked].sort((a, b) => a - b))}
      >
        Submit {picked.length > 0 ? `(${picked.length})` : ''}
      </button>
    </div>
  );
}

function TextAnswer({ disabled, onAnswer }: { disabled: boolean; onAnswer: (v: unknown) => void }) {
  const [text, setText] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (text.trim()) onAnswer(text);
  };
  return (
    <form className="quiz-text" onSubmit={submit}>
      <div className="field">
        <label htmlFor="quiz-text-answer">Your answer</label>
        <input
          id="quiz-text-answer"
          autoComplete="off"
          maxLength={200}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={disabled}
          autoFocus
        />
      </div>
      <button type="submit" className="btn btn--primary btn--wide" disabled={disabled || !text.trim()}>
        Submit
      </button>
    </form>
  );
}

/** Teach-back: explain in your own words. Not scored; the host reads the answers. */
function ExplainAnswer({ disabled, onAnswer }: { disabled: boolean; onAnswer: (v: unknown) => void }) {
  const [text, setText] = useState('');
  return (
    <form
      className="quiz-text"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) onAnswer(text.trim());
      }}
    >
      <div className="field">
        <label htmlFor="quiz-explain-answer">Explain it in your own words, as if to a new teammate</label>
        <textarea
          id="quiz-explain-answer"
          rows={4}
          maxLength={600}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={disabled}
          autoFocus
        />
        <span className="field__hint">{600 - text.length} characters left · not scored</span>
      </div>
      <button type="submit" className="btn btn--primary btn--wide" disabled={disabled || !text.trim()}>
        Send
      </button>
    </form>
  );
}

/** Match (drag the right-hand items next to their partners) and order (drag into sequence). */
function DragAnswer({ q, disabled, onAnswer }: { q: QuestionView; disabled: boolean; onAnswer: (v: unknown) => void }) {
  const match = q.type === 'match';
  const labels = (match ? q.right : q.items) ?? [];
  const [order, setOrder] = useState(() => identity(labels.length));
  const left = q.left ?? [];
  return (
    <div className="quiz-drag">
      <p className="muted small">
        {match
          ? 'Drag each item on the right next to its partner (or use ↑ ↓), then submit.'
          : 'Drag the items into the right order, first at the top (or use ↑ ↓), then submit.'}
      </p>
      <Sortable
        label={match ? 'Matches' : 'Order'}
        labels={labels}
        order={order}
        onChange={setOrder}
        disabled={disabled}
        narrow={!match}
        rowLabel={(row) => (match ? left[row] : `${row + 1}.`)}
      />
      <button type="button" className="btn btn--primary btn--wide quiz-submit" disabled={disabled} onClick={() => onAnswer(order)}>
        Submit
      </button>
    </div>
  );
}

/** The correct answer after the reveal (players and host), with the player's own pick marked. */
export function Solution({ q, mine }: { q: QuestionView; mine?: unknown }) {
  const s = q.solution;
  const counts = q.stats?.counts;
  const total = q.stats?.answered ?? 0;
  if (q.options && (s?.correct || q.type === 'poll')) {
    const correct = s?.correct ?? [];
    return (
      <ul className="quiz-solution" aria-label="Answers">
        {q.options.map((option, i) => {
          const right = correct.includes(i);
          const poll = q.type === 'poll';
          const picked = Array.isArray(mine) ? mine.includes(i) : mine === i;
          const n = counts?.[i] ?? 0;
          return (
            <li key={i} className={`quiz-solution__row ${poll ? 'is-poll' : right ? 'is-right' : 'is-wrong'}`}>
              <span className="quiz-solution__mark" aria-hidden="true">
                {poll ? LETTERS[i] : right ? '✓' : '✗'}
              </span>
              <span className="quiz-solution__label">
                {poll ? '' : `${LETTERS[i]}. `}
                {option}
                {picked && <em className="quiz-solution__mine"> — your pick</em>}
                {!poll && <span className="sr-only">{right ? ' (correct)' : ' (wrong)'}</span>}
              </span>
              {counts && (
                <span className="quiz-solution__bar" style={{ ['--w' as string]: `${total ? (n / total) * 100 : 0}%` }}>
                  {n}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    );
  }
  if (q.type === 'explain') {
    return (
      <div className="quiz-solution">
        {typeof mine === 'string' && (
          <p>
            <strong>You wrote:</strong> {mine}
          </p>
        )}
        {q.model && q.model.length > 0 && (
          <p className="quiz-model">
            <strong>A model answer:</strong> {q.model.join(' / ')}
          </p>
        )}
        <p className="muted small">Compare: what did you include, and what did you leave out?</p>
      </div>
    );
  }
  if (!s) return null;
  if (q.type === 'text') {
    return (
      <div className="quiz-solution">
        <p>
          <strong>Accepted:</strong> {(s.accepted ?? []).join(' · ')}
        </p>
        {typeof mine === 'string' && <p className="muted">You answered: {mine}</p>}
        {q.stats?.top && q.stats.top.length > 0 && (
          <p className="muted small">Most given: {q.stats.top.map(([t, n]) => `${t} (${n})`).join(', ')}</p>
        )}
      </div>
    );
  }
  if ((q.type === 'match' && s.pairs) || (q.type === 'order' && s.order)) {
    const labels = (q.type === 'match' ? q.right : q.items) ?? [];
    const right = (q.type === 'match' ? s.pairs : s.order)!;
    const placed = Array.isArray(mine) ? (mine as number[]) : null;
    return (
      <Sortable
        label="Correct answer"
        labels={labels}
        order={right}
        onChange={() => undefined}
        disabled
        narrow={q.type === 'order'}
        rowLabel={(row) => (q.type === 'match' ? (q.left ?? [])[row] : `${row + 1}.`)}
        marks={placed ? right.map((r, row) => placed[row] === r) : undefined}
      />
    );
  }
  return null;
}

export function Leaderboard({
  rows,
  highlight,
}: {
  rows: { rank: number; id: string; name: string; score: number }[];
  highlight?: string;
}) {
  if (rows.length === 0) return <p className="muted">No players yet.</p>;
  return (
    <ol className="quiz-board">
      {rows.map((r) => (
        <li key={r.id} className={`quiz-board__row${r.id === highlight ? ' is-me' : ''}`}>
          <span className="quiz-board__rank">{r.rank}</span>
          <span className="quiz-board__name">{r.name}</span>
          <span className="quiz-board__score">{r.score.toLocaleString()}</span>
        </li>
      ))}
    </ol>
  );
}
