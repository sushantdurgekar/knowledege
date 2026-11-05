// Open quizzes: each hub's first three topics as a quiz anyone can play, with no room and no host.
// The browser runs the game; the result goes into the player's quiz history and review deck
// (lib/quiz-history.ts), which stays in this browser and also syncs to the account when signed in.
import { api } from './api';
import { fromBank, toServer } from './quiz-doc';
import type { Card } from './quiz';
import { recordQuiz, type HistoryEntry, type QuizState } from './quiz-history';

export interface OpenSummary {
  id: string;
  slug?: string | null;
  title: string;
  code?: string | null;
  topics: string[];
  questions: number;
}

export interface OpenQuestion {
  q: string;
  o: string[];
  a: number;
  e?: string;
}

export interface OpenTopic {
  id: string;
  title: string;
  keys: string[];
  quiz: OpenQuestion[];
}

export interface OpenQuiz {
  id: string;
  slug?: string | null;
  title: string;
  code?: string | null;
  topics: OpenTopic[];
}

export const listOpen = () => api<{ quizzes: OpenSummary[] }>('/api/quiz/open');
export const getOpen = (id: string) => api<OpenQuiz>(`/api/quiz/open/${encodeURIComponent(id)}`);

/** Seconds per question (the hubs' practice questions carry no time of their own). */
export const OPEN_TIME = 30;
export const OPEN_POINTS = 1000;
const STREAK_STEP = 100;
const STREAK_MAX = 500;

/** The quiz's display name: "AI-103 · first 3 topics". */
export const openTitle = (q: Pick<OpenSummary, 'title' | 'code'>) => `${q.code || q.title} · first 3 topics`;

/** One question as played, with its topic. */
export interface PlayItem extends OpenQuestion {
  topic: string;
}

export const playItems = (quiz: OpenQuiz): PlayItem[] =>
  quiz.topics.flatMap((t) => t.quiz.map((q) => ({ ...q, topic: t.title })));

/** Points for one answer, as in live rooms: 50-100% for speed, plus the streak bonus. */
export function scoreAnswer(right: boolean, elapsedMs: number, streak: number): { points: number; bonus: number } {
  if (!right) return { points: 0, bonus: 0 };
  const speed = 1 - 0.5 * Math.min(1, Math.max(0, elapsedMs / (OPEN_TIME * 1000)));
  const bonus = streak > 1 ? Math.min(STREAK_MAX, STREAK_STEP * (streak - 1)) : 0;
  return { points: Math.round(OPEN_POINTS * speed) + bonus, bonus };
}

export interface PlayResult {
  /** The item's index in playItems order and the option picked (null: time ran out). */
  index: number;
  pick: number | null;
  right: boolean;
  points: number;
}

/** Save a finished game: history entry plus review cards (missed ones due now). */
export function recordOpenGame(state: QuizState, quiz: OpenQuiz, items: PlayItem[], results: PlayResult[], now = Date.now()): QuizState {
  const correct = results.filter((r) => r.right).length;
  const entry: HistoryEntry = {
    id: `open:${quiz.id}:${now}`,
    title: openTitle(quiz),
    at: now,
    score: results.reduce((n, r) => n + r.points, 0),
    rank: 1,
    players: 1,
    correct,
    total: items.length,
  };
  const cards: Card[] = items.map((it) => ({
    type: 'single',
    front: it.q,
    back: it.o[it.a] ?? '',
    options: it.o,
    explain: it.e || undefined,
  }));
  const missed = new Set(results.filter((r) => !r.right).map((r) => items[r.index]!.q));
  return recordQuiz(state, entry, cards, missed, now);
}

/** The best and the last game of this open quiz in the player's history. */
export function openRecord(state: QuizState, quiz: Pick<OpenSummary, 'title' | 'code'>): { best: HistoryEntry | null; last: HistoryEntry | null; plays: number } {
  const title = openTitle(quiz);
  const games = state.history.filter((h) => h.title === title);
  const best = games.reduce<HistoryEntry | null>((b, h) => (!b || h.score > b.score ? h : b), null);
  const last = games.reduce<HistoryEntry | null>((l, h) => (!l || h.at > l.at ? h : l), null);
  return { best, last, plays: games.length };
}

/** The open quiz as a studio quiz, for hosting it as a live room or a self-paced challenge. */
export function openAsServerQuiz(quiz: OpenQuiz, slides: boolean): unknown {
  const topics = quiz.topics.map((t) => ({ ...t, quiz: t.quiz.map((q) => ({ ...q, e: q.e ?? '' })) }));
  const doc = fromBank(quiz.code || quiz.title, topics, { slides, advanced: false });
  return toServer({ ...doc, title: openTitle(quiz), time: OPEN_TIME });
}
