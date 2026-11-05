import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { BusyLine, FormMessage } from '../../components/forms';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { apiMessage } from '../../lib/quiz';
import { listOpen, OPEN_TIME, openRecord, type OpenSummary } from '../../lib/open-quiz';
import { loadState } from '../../lib/quiz-history';

/** `/quiz/open`: every hub's first three topics as a quiz anyone can play, any time. */
export function OpenList() {
  useDocumentTitle('Open quizzes');
  const [quizzes, setQuizzes] = useState<OpenSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const history = useMemo(() => loadState(), []);

  useEffect(() => {
    listOpen()
      .then((r) => setQuizzes(r.quizzes))
      .catch((e) => setError(apiMessage(e)));
  }, []);

  const shown = (quizzes ?? []).filter((q) => {
    const text = `${q.code ?? ''} ${q.title} ${q.topics.join(' ')}`.toLowerCase();
    return text.includes(search.trim().toLowerCase());
  });

  return (
    <section className="page page--wide open-list" aria-labelledby="page-title">
      <p className="eyebrow">Live quiz</p>
      <h1 id="page-title">Open quizzes</h1>
      <p className="lede">
        The first three topics of every study hub, ready to play any time, with the next topics as further levels. No PIN and no
        host: just press Play. Your scores and review cards stay in this browser, and sync to your account when you are signed in.
      </p>
      {error && <FormMessage tone="error">{error}</FormMessage>}
      {!quizzes && !error && <BusyLine>Loading the quizzes…</BusyLine>}
      {quizzes && (
        <>
          <div className="field open-list__search">
            <label htmlFor="open-search">Find a quiz</label>
            <input id="open-search" type="search" placeholder="AI-103, system design, DSA…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {shown.length === 0 && <p className="muted">No quiz matches “{search}”.</p>}
          <ul className="open-list__grid">
            {shown.map((q) => {
              const { best, plays } = openRecord(history, q);
              return (
                <li key={q.id} className="open-card">
                  <p className="open-card__code">{q.code || 'Study hub'}</p>
                  <h2 className="open-card__title">{q.title}</h2>
                  <ol className="open-card__topics">
                    {q.topics.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ol>
                  <p className="muted small">
                    {q.questions} questions · about {Math.max(1, Math.round((q.questions * OPEN_TIME) / 60 / 2))}–
                    {Math.max(2, Math.round((q.questions * OPEN_TIME) / 60))} min
                  </p>
                  {(q.levels ?? 1) > 1 && (
                    <p className="muted small">
                      Then {q.levels! - 1} more level{q.levels! > 2 ? 's' : ''} with the hub’s next topics
                    </p>
                  )}
                  {best && (
                    <p className="open-card__best">
                      Your best: <strong>{best.score.toLocaleString()}</strong> ({best.correct}/{best.total}) · played {plays}×
                    </p>
                  )}
                  <Link className="btn btn--primary" to={`/quiz/open/${encodeURIComponent(q.id)}`} aria-label={`Play ${q.code || q.title}`}>
                    {best ? 'Play again' : 'Play'}
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
