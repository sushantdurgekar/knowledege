import { useState, type FormEvent } from 'react';
import type { QuestionView } from '../../lib/quiz';

export const LETTERS = 'ABCDEFGH';

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
  if (q.type === 'single' || q.type === 'truefalse') {
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
  return <MatchAnswer q={q} disabled={disabled} onAnswer={onAnswer} />;
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

function MatchAnswer({ q, disabled, onAnswer }: { q: QuestionView; disabled: boolean; onAnswer: (v: unknown) => void }) {
  const left = q.left ?? [];
  const right = q.right ?? [];
  const [choice, setChoice] = useState<number[]>(() => left.map(() => -1));
  const used = new Set(choice.filter((c) => c >= 0));
  const done = choice.every((c) => c >= 0);
  return (
    <div className="quiz-match">
      <p className="muted small">Pick the matching item for each line, then submit.</p>
      <ol className="quiz-match__list">
        {left.map((item, i) => (
          <li key={i} className="quiz-match__row">
            <label htmlFor={`match-${i}`} className="quiz-match__left">
              {item}
            </label>
            <select
              id={`match-${i}`}
              value={choice[i]}
              disabled={disabled}
              onChange={(e) => {
                const value = Number(e.target.value);
                setChoice((c) => c.map((x, j) => (j === i ? value : x === value ? -1 : x)));
              }}
            >
              <option value={-1}>Choose…</option>
              {right.map((r, j) => (
                <option key={j} value={j}>
                  {r}
                  {used.has(j) && choice[i] !== j ? ' (used)' : ''}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="btn btn--primary btn--wide quiz-submit"
        disabled={disabled || !done}
        onClick={() => onAnswer(choice)}
      >
        Submit
      </button>
    </div>
  );
}

/** The correct answer, shown after the reveal (players and host). */
export function Solution({ q, mine }: { q: QuestionView; mine?: unknown }) {
  const s = q.solution;
  if (!s) return null;
  const counts = q.stats?.counts;
  const total = q.stats?.answered ?? 0;
  if (q.options && s.correct) {
    return (
      <ul className="quiz-solution" aria-label="Answers">
        {q.options.map((option, i) => {
          const right = s.correct!.includes(i);
          const picked = Array.isArray(mine) ? mine.includes(i) : mine === i;
          const n = counts?.[i] ?? 0;
          return (
            <li key={i} className={`quiz-solution__row ${right ? 'is-right' : 'is-wrong'}`}>
              <span className="quiz-solution__mark" aria-hidden="true">
                {right ? '✓' : '✗'}
              </span>
              <span className="quiz-solution__label">
                {LETTERS[i]}. {option}
                {picked && <em className="quiz-solution__mine"> — your pick</em>}
                <span className="sr-only">{right ? ' (correct)' : ' (wrong)'}</span>
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
  if (q.type === 'match' && s.pairs) {
    return (
      <ul className="quiz-solution">
        {(q.left ?? []).map((item, i) => {
          const ok = Array.isArray(mine) ? mine[i] === s.pairs![i] : undefined;
          return (
            <li key={i} className={`quiz-solution__row ${ok === false ? 'is-wrong' : 'is-right'}`}>
              <span className="quiz-solution__mark" aria-hidden="true">
                {ok === false ? '✗' : '✓'}
              </span>
              <span className="quiz-solution__label">
                {item} → {(q.right ?? [])[s.pairs![i] ?? 0]}
              </span>
            </li>
          );
        })}
      </ul>
    );
  }
  return null;
}

export function Leaderboard({ rows, highlight }: { rows: { rank: number; id: string; name: string; score: number }[]; highlight?: string }) {
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
