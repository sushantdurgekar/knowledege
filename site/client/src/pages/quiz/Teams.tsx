import { TEAMS, type TeamRow } from '../../lib/quiz';

export function teamOf(team: number | null | undefined) {
  return team === null || team === undefined ? null : (TEAMS[team] ?? null);
}

export function TeamChip({ team }: { team: number | null | undefined }) {
  const t = teamOf(team);
  if (!t) return null;
  return (
    <span className="team-chip" style={{ ['--team' as string]: t.color }}>
      Team {t.name}
    </span>
  );
}

/** Team standings: average score per member (fair for uneven teams), with the total. */
export function TeamBoard({ rows, highlight, big = false }: { rows: TeamRow[]; highlight?: number | null; big?: boolean }) {
  if (!rows.length) return null;
  const top = Math.max(1, ...rows.map((r) => r.score));
  return (
    <ol className={`team-board${big ? ' team-board--big' : ''}`} aria-label="Team standings">
      {rows.map((r) => {
        const t = teamOf(r.team)!;
        return (
          <li key={r.team} className={`team-board__row${r.team === highlight ? ' is-me' : ''}`} style={{ ['--team' as string]: t.color }}>
            <span className="team-board__rank">{r.rank}</span>
            <span className="team-board__name">
              Team {t.name} <span className="muted small">· {r.players} player{r.players === 1 ? '' : 's'}</span>
            </span>
            <span className="team-board__bar" style={{ ['--w' as string]: `${(r.score / top) * 100}%` }} aria-hidden="true" />
            <span className="team-board__score">
              {r.score.toLocaleString()} <span className="muted small">avg</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
