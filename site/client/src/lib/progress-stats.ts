// What the progress page shows, computed from the player's quiz state (pure, so it is tested).
import { localDay, type DeckCard, type HistoryEntry, type QuizState } from './quiz-history';

const DAY = 86_400_000;

export interface TrendPoint {
  id: string;
  title: string;
  at: number;
  pct: number; // 0-100
  correct: number;
  total: number;
}

export interface QuizArea {
  title: string;
  plays: number;
  correct: number;
  total: number;
  pct: number;
}

export interface DayCount {
  day: string; // YYYY-MM-DD
  at: number; // local midnight
  count: number;
}

export interface Calibration {
  sureRight: number;
  sureWrong: number;
  unsureRight: number;
  unsureWrong: number;
}

export interface Progress {
  played: number;
  accuracy: number | null; // 0-100 over every scored answer
  /** Last five quizzes against the five before them, in percentage points. */
  recentDelta: number | null;
  trend: TrendPoint[];
  areas: QuizArea[];
  calibration: Calibration | null;
  forecast: DayCount[];
  dueNow: number;
  cards: number;
  streak: number;
  studiedToday: boolean;
  hardest: DeckCard[];
}

const pct = (correct: number, total: number) => (total > 0 ? Math.round((correct / total) * 100) : 0);

function share(entries: HistoryEntry[]): number | null {
  const total = entries.reduce((n, h) => n + h.total, 0);
  return total > 0 ? pct(entries.reduce((n, h) => n + h.correct, 0), total) : null;
}

/** Local midnight of the day `offset` days from `now`. */
function midnight(now: number, offset: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d.getTime();
}

/** Consecutive study days ending today (or yesterday, so a streak survives until tonight). */
export function streakOf(days: Record<string, number> | undefined, now = Date.now()): { streak: number; today: boolean } {
  if (!days) return { streak: 0, today: false };
  const today = !!days[localDay(now)];
  let offset = today ? 0 : -1;
  let streak = 0;
  while (days[localDay(midnight(now, offset) + DAY / 2)]) {
    streak += 1;
    offset -= 1;
  }
  return { streak, today };
}

export function progressOf(state: QuizState, now = Date.now(), forecastDays = 14): Progress {
  const scored = state.history.filter((h) => h.total > 0);
  const oldestFirst = [...scored].sort((a, b) => a.at - b.at);
  const newestFirst = [...oldestFirst].reverse();

  const recent = share(newestFirst.slice(0, 5));
  const before = newestFirst.length >= 10 ? share(newestFirst.slice(5, 10)) : null;

  const byTitle = new Map<string, QuizArea>();
  for (const h of scored) {
    const area = byTitle.get(h.title) ?? { title: h.title, plays: 0, correct: 0, total: 0, pct: 0 };
    area.plays += 1;
    area.correct += h.correct;
    area.total += h.total;
    byTitle.set(h.title, area);
  }
  const areas = [...byTitle.values()]
    .map((a) => ({ ...a, pct: pct(a.correct, a.total) }))
    .sort((a, b) => a.pct - b.pct || b.total - a.total);

  const withCal = state.history.filter((h) => h.calibration);
  const calibration = withCal.length
    ? withCal.reduce<Calibration>(
        (sum, h) => ({
          sureRight: sum.sureRight + h.calibration!.sureRight,
          sureWrong: sum.sureWrong + h.calibration!.sureWrong,
          unsureRight: sum.unsureRight + h.calibration!.unsureRight,
          unsureWrong: sum.unsureWrong + h.calibration!.unsureWrong,
        }),
        { sureRight: 0, sureWrong: 0, unsureRight: 0, unsureWrong: 0 },
      )
    : null;

  const cards = Object.values(state.deck);
  // Day 0 holds everything due by tonight, overdue cards included.
  const forecast: DayCount[] = Array.from({ length: forecastDays }, (_, i) => {
    const at = midnight(now, i);
    return { day: localDay(at + DAY / 2), at, count: 0 };
  });
  for (const c of cards) {
    // Rounded: a day is 23 or 25 hours long when the clocks change.
    const i = c.due < midnight(now, 1) ? 0 : Math.round((midnight(c.due, 0) - midnight(now, 0)) / DAY);
    if (i >= 0 && i < forecastDays) forecast[i]!.count += 1;
  }

  const { streak, today } = streakOf(state.days, now);
  return {
    played: state.history.length,
    accuracy: share(scored),
    recentDelta: recent !== null && before !== null ? recent - before : null,
    trend: oldestFirst.slice(-20).map((h) => ({ id: h.id, title: h.title, at: h.at, pct: pct(h.correct, h.total), correct: h.correct, total: h.total })),
    areas,
    calibration,
    forecast,
    dueNow: cards.filter((c) => c.due <= now).length,
    cards: cards.length,
    streak,
    studiedToday: today,
    hardest: cards
      .filter((c) => c.lapses > 0)
      .sort((a, b) => b.lapses - a.lapses || a.ef - b.ef)
      .slice(0, 5),
  };
}
