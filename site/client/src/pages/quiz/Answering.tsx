import { useState, type FormEvent } from 'react';
import { fmtNumber, imageUrl, type QuestionView, type SliderScale } from '../../lib/quiz';
import { Sortable } from './Sortable';

export const LETTERS = 'ABCDEFGH';

const identity = (n: number) => Array.from({ length: n }, (_, i) => i);

/** The picture attached to a question or slide. */
export function QuestionImage({ id, big = false, alt = '' }: { id?: string; big?: boolean; alt?: string }) {
  if (!id) return null;
  return (
    <figure className={`quiz-image${big ? ' quiz-image--big' : ''}`}>
      <img src={imageUrl(id)} alt={alt} loading="eager" decoding="async" />
    </figure>
  );
}

/** A slide (presentation content): the title and its body, paragraphs and "- " bullets kept. */
export function SlideBody({ text, body, big = false, image }: { text: string; body?: string; big?: boolean; image?: string }) {
  const blocks = (body ?? '').split(/\n{2,}/).filter((b) => b.trim());
  return (
    <article className={`quiz-slide${big ? ' quiz-slide--big' : ''}${image ? ' quiz-slide--image' : ''}`}>
      <QuestionImage id={image} big={big} alt={`Picture for the slide: ${text}`} />
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
  if (q.type === 'slider' && q.scale) return <SliderAnswer scale={q.scale} disabled={disabled} onAnswer={onAnswer} />;
  if (q.type === 'cloud') return <CloudAnswer disabled={disabled} onAnswer={onAnswer} />;
  return null;
}

/** Slider: drag (or type) a number on the question's scale, then submit. */
function SliderAnswer({ scale, disabled, onAnswer }: { scale: SliderScale; disabled: boolean; onAnswer: (v: unknown) => void }) {
  const snap = (v: number) => {
    const steps = Math.round((v - scale.min) / scale.step);
    return Math.min(scale.max, Math.max(scale.min, Number((scale.min + steps * scale.step).toFixed(6))));
  };
  const [value, setValue] = useState(() => snap((scale.min + scale.max) / 2));
  // What is typed in the exact box: kept as text so it can be cleared and retyped.
  const [draft, setDraft] = useState<string | null>(null);
  const unit = scale.unit ? ` ${scale.unit}` : '';
  return (
    <form
      className="quiz-slider"
      onSubmit={(e) => {
        e.preventDefault();
        onAnswer(value);
      }}
    >
      <output className="quiz-slider__value" htmlFor="quiz-slider-range" aria-live="polite">
        {fmtNumber(value)}
        {unit}
      </output>
      <label htmlFor="quiz-slider-range" className="sr-only">
        Your answer, from {fmtNumber(scale.min)} to {fmtNumber(scale.max)}
      </label>
      <input
        id="quiz-slider-range"
        type="range"
        min={scale.min}
        max={scale.max}
        step={scale.step}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          setDraft(null);
          setValue(snap(Number(e.target.value)));
        }}
      />
      <div className="quiz-slider__ends" aria-hidden="true">
        <span>
          {fmtNumber(scale.min)}
          {unit}
        </span>
        <span>
          {fmtNumber(scale.max)}
          {unit}
        </span>
      </div>
      <div className="quiz-slider__row">
        <label htmlFor="quiz-slider-exact" className="muted small">
          Exact value
        </label>
        <input
          id="quiz-slider-exact"
          type="number"
          min={scale.min}
          max={scale.max}
          step={scale.step}
          value={draft ?? value}
          disabled={disabled}
          onChange={(e) => {
            setDraft(e.target.value);
            const n = Number(e.target.value);
            if (e.target.value.trim() !== '' && Number.isFinite(n)) setValue(snap(n));
          }}
          onBlur={() => setDraft(null)}
        />
        <button type="submit" className="btn btn--primary" disabled={disabled}>
          Lock it in
        </button>
      </div>
    </form>
  );
}

/** Word cloud: a word or two, no right answer. */
function CloudAnswer({ disabled, onAnswer }: { disabled: boolean; onAnswer: (v: unknown) => void }) {
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
        <label htmlFor="quiz-cloud-answer">A word or two</label>
        <input
          id="quiz-cloud-answer"
          autoComplete="off"
          maxLength={40}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={disabled}
          autoFocus
        />
        <span className="field__hint">Shown in the word cloud for everyone · not scored</span>
      </div>
      <button type="submit" className="btn btn--primary btn--wide" disabled={disabled || !text.trim()}>
        Send
      </button>
    </form>
  );
}

/** A deterministic shuffle, so the biggest words don't all line up at the start. */
function spread<T>(items: T[]): T[] {
  const out: T[] = [];
  items.forEach((item, i) => (i % 2 ? out.push(item) : out.unshift(item)));
  return out;
}

/** The word cloud: more answers, bigger word. */
export function WordCloud({ words, big = false }: { words: [string, number][]; big?: boolean }) {
  if (!words.length) return <p className="muted quiz-cloud__empty">Waiting for the first words…</p>;
  const top = words[0]![1];
  return (
    <ul className={`quiz-cloud${big ? ' quiz-cloud--big' : ''}`} aria-label="Word cloud: the most common answers">
      {spread(words).map(([word, n], i) => (
        <li
          key={word}
          className={`quiz-cloud__word quiz-cloud__word--${i % 5}`}
          style={{ ['--s' as string]: String(0.95 + (2.3 * n) / top) }}
          title={`${word}: ${n}`}
        >
          {word}
          <span className="sr-only">: {n}</span>
        </li>
      ))}
    </ul>
  );
}

/** Where slider answers landed: ten bins, the right zone marked. */
function SliderSpread({ q }: { q: QuestionView }) {
  const bins = q.stats?.bins;
  const scale = q.scale;
  if (!bins || !scale) return null;
  const top = Math.max(1, ...bins);
  const width = (scale.max - scale.min) / bins.length;
  const target = q.solution?.value;
  const margin = q.solution?.margin ?? 0;
  const unit = scale.unit ? ` ${scale.unit}` : '';
  return (
    <figure className="quiz-spread">
      <ol className="quiz-spread__bins" aria-label="How many answered in each part of the scale">
        {bins.map((n, i) => {
          const lo = scale.min + i * width;
          const hi = lo + width;
          // Bins are [lo, hi); the last one also holds max.
          const last = i === bins.length - 1;
          const right = target !== undefined && lo <= target + margin && (hi > target - margin || (last && hi >= target - margin));
          const label = `${fmtNumber(Number(lo.toFixed(4)))} to ${fmtNumber(Number(hi.toFixed(4)))}${unit}: ${n}`;
          return (
            <li key={i} className={right ? 'is-right' : undefined} title={label} aria-label={label}>
              <span style={{ ['--h' as string]: `${(n / top) * 100}%` }} />
            </li>
          );
        })}
      </ol>
      <figcaption className="muted small">
        {fmtNumber(scale.min)}
        {unit} → {fmtNumber(scale.max)}
        {unit} · average {fmtNumber(Number((q.stats?.average ?? 0).toFixed(2)))} · median {fmtNumber(Number((q.stats?.median ?? 0).toFixed(2)))}
      </figcaption>
    </figure>
  );
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
  if (q.type === 'cloud') {
    return (
      <div className="quiz-solution">
        <WordCloud words={q.stats?.words ?? []} />
        {typeof mine === 'string' && <p className="muted">You sent: {mine}</p>}
      </div>
    );
  }
  if (!s) return null;
  if (q.type === 'slider' && s.value !== undefined) {
    const unit = q.scale?.unit ? ` ${q.scale.unit}` : '';
    return (
      <div className="quiz-solution">
        <p className="quiz-slider__answer">
          <strong>
            {fmtNumber(s.value)}
            {unit}
          </strong>
          {s.margin ? <span className="muted"> (±{fmtNumber(s.margin)} counts)</span> : null}
        </p>
        {typeof mine === 'number' && (
          <p className="muted">
            You said {fmtNumber(mine)}
            {unit}
          </p>
        )}
        <SliderSpread q={q} />
      </div>
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
