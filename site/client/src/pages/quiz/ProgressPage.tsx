import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { BusyLine } from '../../components/forms';
import { useMe } from '../../context/me';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { progressOf, type Progress } from '../../lib/progress-stats';
import { loadState, pull } from '../../lib/quiz-history';
import { AreaBars, ForecastChart, TrendChart } from './ProgressCharts';

/** `/quiz/progress`: how a player is doing across every quiz they played. */
export function ProgressPage() {
  useDocumentTitle('My progress');
  const { me } = useMe();
  const signedIn = me.status === 'signed-in';
  const [progress, setProgress] = useState<Progress | null>(null);

  useEffect(() => {
    if (me.status === 'loading') return;
    if (signedIn) void pull().then((s) => setProgress(progressOf(s)));
    else setProgress(progressOf(loadState()));
  }, [me.status, signedIn]);

  if (!progress) return <BusyLine>Loading your progress…</BusyLine>;
  const p = progress;

  return (
    <section className="page page--wide progress" aria-labelledby="page-title">
      <p className="eyebrow">Live quiz</p>
      <h1 id="page-title">My progress</h1>
      <p className="lede">
        Every quiz you played, how your accuracy moves, and what to revise next.{' '}
        {signedIn ? 'Synced to your account.' : 'Saved in this browser; sign in to keep it on every device.'}
      </p>

      {p.played === 0 && p.cards === 0 ? (
        <div className="notice">
          <h2>Nothing to show yet</h2>
          <p>Play a quiz: your score, accuracy and review cards start here.</p>
          <Link className="btn btn--primary" to="/quiz">
            Join a quiz
          </Link>
        </div>
      ) : (
        <>
          <dl className="stat-row">
            <div className="stat">
              <dt>Quizzes played</dt>
              <dd className="stat__value">{p.played}</dd>
            </div>
            <div className="stat">
              <dt>Accuracy</dt>
              <dd className="stat__value">{p.accuracy === null ? '—' : `${p.accuracy}%`}</dd>
              {p.recentDelta !== null && (
                <dd className={`stat__delta${p.recentDelta > 0 ? ' is-up' : p.recentDelta < 0 ? ' is-down' : ''}`}>
                  <span aria-hidden="true">{p.recentDelta > 0 ? '▲' : p.recentDelta < 0 ? '▼' : '■'}</span>{' '}
                  {p.recentDelta > 0 ? '+' : ''}
                  {p.recentDelta} pts, last 5 vs the 5 before
                </dd>
              )}
            </div>
            <div className="stat">
              <dt>Study streak</dt>
              <dd className="stat__value">
                {p.streak} {p.streak === 1 ? 'day' : 'days'}
              </dd>
              <dd className="stat__note">{p.studiedToday ? 'You studied today' : p.streak ? 'Review today to keep it' : 'Review a card to start one'}</dd>
            </div>
            <div className="stat">
              <dt>Due for review</dt>
              <dd className="stat__value">{p.dueNow}</dd>
              <dd className="stat__note">
                of {p.cards} cards · <Link to="/quiz/review">{p.dueNow ? 'Review now' : 'Open the deck'}</Link>
              </dd>
            </div>
          </dl>

          {p.trend.length > 0 && (
            <section className="progress__card" aria-labelledby="trend-title">
              <h2 id="trend-title">Accuracy per quiz</h2>
              <p className="muted small">Share of scored questions you got right, oldest to newest (last {p.trend.length}).</p>
              <TrendChart points={p.trend} />
              <details className="progress__table">
                <summary>Show as a table</summary>
                <div className="table-scroll">
                  <table className="self-dash__table">
                    <thead>
                      <tr>
                        <th scope="col">Quiz</th>
                        <th scope="col">Date</th>
                        <th scope="col">Right</th>
                        <th scope="col">Accuracy</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...p.trend].reverse().map((t) => (
                        <tr key={t.id}>
                          <td>{t.title}</td>
                          <td>{new Date(t.at).toLocaleDateString()}</td>
                          <td className="mono">
                            {t.correct} / {t.total}
                          </td>
                          <td className="mono">{t.pct}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </section>
          )}

          <div className="progress__grid">
            {p.areas.length > 0 && (
              <section className="progress__card" aria-labelledby="areas-title">
                <h2 id="areas-title">Where to focus</h2>
                <p className="muted small">Your accuracy in each quiz, weakest first.</p>
                <AreaBars areas={p.areas.slice(0, 6)} />
              </section>
            )}

            {p.calibration && <CalibrationCard c={p.calibration} />}
          </div>

          {p.cards > 0 && (
            <section className="progress__card" aria-labelledby="forecast-title">
              <h2 id="forecast-title">Reviews coming up</h2>
              <p className="muted small">Cards due each day for the next two weeks. Missed questions come back first.</p>
              <ForecastChart days={p.forecast} />
              <details className="progress__table">
                <summary>Show as a table</summary>
                <div className="table-scroll">
                  <table className="self-dash__table">
                    <thead>
                      <tr>
                        <th scope="col">Day</th>
                        <th scope="col">Cards due</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.forecast.map((d, i) => (
                        <tr key={d.day}>
                          <td>{i === 0 ? 'Today (overdue included)' : new Date(d.at).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}</td>
                          <td className="mono">{d.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </section>
          )}

          {p.hardest.length > 0 && (
            <section className="progress__card" aria-labelledby="hardest-title">
              <h2 id="hardest-title">Questions you keep missing</h2>
              <ol className="progress__hardest">
                {p.hardest.map((c) => (
                  <li key={c.id}>
                    <span>{c.front}</span>
                    <span className="muted small">
                      missed {c.lapses}× · {c.quiz}
                    </span>
                  </li>
                ))}
              </ol>
              <Link className="btn btn--small" to="/quiz/review">
                Review them
              </Link>
            </section>
          )}
        </>
      )}
    </section>
  );
}

/** Confidence against correctness (advanced quizzes): a 2 x 2 table, not a chart. */
function CalibrationCard({ c }: { c: NonNullable<Progress['calibration']> }) {
  const total = c.sureRight + c.sureWrong + c.unsureRight + c.unsureWrong;
  const share = (n: number) => (total ? `${Math.round((n / total) * 100)}%` : '—');
  return (
    <section className="progress__card" aria-labelledby="cal-title">
      <h2 id="cal-title">How sure were you?</h2>
      <p className="muted small">From the advanced quizzes, where you rated your confidence before answering.</p>
      <table className="calib">
        <thead>
          <tr>
            <td />
            <th scope="col">Right</th>
            <th scope="col">Wrong</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Sure</th>
            <td>
              <strong>{c.sureRight}</strong> <span className="muted small">{share(c.sureRight)}</span>
            </td>
            <td className={c.sureWrong ? 'calib__warn' : undefined}>
              <strong>{c.sureWrong}</strong> <span className="muted small">{share(c.sureWrong)}</span>
              {c.sureWrong > 0 && (
                <span className="calib__flag">
                  <span aria-hidden="true">⚠</span> misconceptions: review these first
                </span>
              )}
            </td>
          </tr>
          <tr>
            <th scope="row">Unsure</th>
            <td>
              <strong>{c.unsureRight}</strong> <span className="muted small">{share(c.unsureRight)}</span>
            </td>
            <td>
              <strong>{c.unsureWrong}</strong> <span className="muted small">{share(c.unsureWrong)}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}
