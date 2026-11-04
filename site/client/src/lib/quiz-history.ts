// A player's quiz history and spaced-repetition review deck.
//
// Every finished quiz adds its questions as cards: missed ones are due at once, ones answered
// right (and, in advanced quizzes, with confidence) come back tomorrow. Reviews use SM-2, the
// scheme the Knowledge vault's srs.py uses: Again (1) resets the card, Hard/Good/Easy (3/4/5)
// stretch the interval by its ease factor.
//
// Stored in this browser; for signed-in players also synced to the account through the
// virtual "live-quiz" hub (/api/progress/live-quiz, /api/sync), merged per card by `updated`.
import { api, isApiProblem } from './api';
import type { Card, QuestionType } from './quiz';

export interface DeckCard {
  id: string;
  quiz: string;
  type: QuestionType;
  front: string;
  back: string;
  options?: string[];
  explain?: string;
  ef: number;
  interval: number; // days
  reps: number;
  due: number; // ms
  lapses: number;
  updated: number;
}

export interface HistoryEntry {
  id: string;
  title: string;
  at: number;
  score: number;
  rank: number;
  players: number;
  correct: number;
  total: number;
  calibration?: { sureRight: number; sureWrong: number; unsureRight: number; unsureWrong: number };
}

export interface QuizState {
  deck: Record<string, DeckCard>;
  history: HistoryEntry[];
}

const KEY = 'studyhubs.quiz.state';
const HUB = 'live-quiz';
const DAY = 86_400_000;
const MAX_CARDS = 500;
const MAX_HISTORY = 50;

export const emptyState = (): QuizState => ({ deck: {}, history: [] });

export function loadState(): QuizState {
  try {
    const raw = window.localStorage.getItem(KEY);
    const data = raw ? (JSON.parse(raw) as QuizState) : null;
    if (data && typeof data === 'object' && data.deck && Array.isArray(data.history)) return data;
  } catch {
    /* fall through */
  }
  return emptyState();
}

function saveLocal(state: QuizState): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage full or blocked */
  }
}

/** A stable id for a card: the same question from the same quiz is one card. */
export function cardId(quiz: string, front: string): string {
  let h = 5381;
  for (const ch of `${quiz}\u0000${front}`) h = ((h << 5) + h + ch.codePointAt(0)!) >>> 0;
  return h.toString(36);
}

/** SM-2. `grade` 0-5; below 3 resets the card. */
export function schedule(card: DeckCard, grade: number, now = Date.now()): DeckCard {
  let { ef, interval, reps, lapses } = card;
  if (grade < 3) {
    reps = 0;
    interval = 0; // again today, after the rest of the session
    lapses += 1;
  } else {
    reps += 1;
    interval = reps === 1 ? 1 : reps === 2 ? 6 : Math.round(interval * ef);
  }
  ef = Math.max(1.3, ef + 0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02));
  const due = interval === 0 ? now + 10 * 60_000 : now + interval * DAY;
  return { ...card, ef: Math.round(ef * 100) / 100, interval, reps, lapses, due, updated: now };
}

export function dueCards(state: QuizState, now = Date.now()): DeckCard[] {
  return Object.values(state.deck)
    .filter((c) => c.due <= now)
    .sort((a, b) => a.due - b.due);
}

/** Add a finished quiz: its cards (missed ones due now) and a history entry. */
export function recordQuiz(
  state: QuizState,
  entry: HistoryEntry,
  cards: Card[],
  missed: Set<string>,
  now = Date.now(),
): QuizState {
  if (state.history.some((h) => h.id === entry.id)) return state; // already recorded
  const deck = { ...state.deck };
  for (const c of cards) {
    if (c.type === 'slide' || c.type === 'poll') continue;
    const id = cardId(entry.title, c.front);
    const wrong = missed.has(c.front);
    const existing = deck[id];
    if (existing) {
      // Seen before: a miss brings it back now; otherwise keep its schedule.
      if (wrong) deck[id] = { ...existing, due: now, updated: now };
      continue;
    }
    deck[id] = {
      id,
      quiz: entry.title,
      type: c.type,
      front: c.front,
      back: c.back,
      options: c.options,
      explain: c.explain,
      ef: 2.5,
      interval: wrong ? 0 : 1,
      reps: wrong ? 0 : 1,
      due: wrong ? now : now + DAY,
      lapses: wrong ? 1 : 0,
      updated: now,
    };
  }
  return trim({ deck, history: [entry, ...state.history] });
}

function trim(state: QuizState): QuizState {
  let cards = Object.values(state.deck);
  if (cards.length > MAX_CARDS) {
    // Drop the most mature cards first (longest interval), they need review least.
    cards = cards.sort((a, b) => a.interval - b.interval).slice(0, MAX_CARDS);
  }
  return {
    deck: Object.fromEntries(cards.map((c) => [c.id, c])),
    history: [...state.history].sort((a, b) => b.at - a.at).slice(0, MAX_HISTORY),
  };
}

/** Two devices' states: newest card wins, histories are united. */
export function merge(a: QuizState, b: QuizState): QuizState {
  const deck: Record<string, DeckCard> = { ...a.deck };
  for (const [id, card] of Object.entries(b.deck)) {
    const mine = deck[id];
    if (!mine || card.updated > mine.updated) deck[id] = card;
  }
  const history = [...a.history];
  for (const h of b.history) if (!history.some((x) => x.id === h.id)) history.push(h);
  return trim({ deck, history });
}

// -- account sync --------------------------------------------------------------------------
let pending: ReturnType<typeof setTimeout> | null = null;

/** Save locally now; push to the account (when signed in) a moment later. */
export function commit(state: QuizState, signedIn: boolean): void {
  saveLocal(state);
  if (!signedIn) return;
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => {
    pending = null;
    void push(state);
  }, 2000);
}

async function push(state: QuizState): Promise<void> {
  try {
    await api('/api/sync', { json: { hubs: { [HUB]: { main: { hub: HUB, upd: Date.now(), S: state } } } } });
  } catch {
    /* offline or paused: the next change retries; the browser copy is safe */
  }
}

/** Fetch the account's copy and merge it into this browser's (signed-in players). */
export async function pull(): Promise<QuizState> {
  const local = loadState();
  try {
    const body = await api<{ signedIn: boolean; parts?: { main?: { S?: QuizState } | null } }>(`/api/progress/${HUB}`);
    const remote = body.signedIn ? body.parts?.main?.S : null;
    if (!remote || !remote.deck) return local;
    const merged = merge(local, remote);
    saveLocal(merged);
    if (JSON.stringify(merged) !== JSON.stringify(remote)) void push(merged);
    return merged;
  } catch (e) {
    if (isApiProblem(e)) return local;
    return local;
  }
}
