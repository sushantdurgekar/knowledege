// Live quiz client: types for the /api/quiz views, small API wrappers and the long-poll loop.
import { useEffect, useRef, useState } from 'react';
import { api, isApiProblem } from './api';

export type QuestionType = 'single' | 'multi' | 'text' | 'match' | 'truefalse';
export type Phase = 'lobby' | 'question' | 'reveal' | 'finished';

export interface QuestionStats {
  answered: number;
  players: number;
  correct: number;
  counts?: number[];
  top?: [string, number][];
}

export interface QuestionView {
  index: number;
  text: string;
  type: QuestionType;
  timeLimit: number;
  points: number;
  remainingMs: number;
  options?: string[];
  pick?: number;
  left?: string[];
  right?: string[];
  solution?: { correct?: number[]; accepted?: string[]; pairs?: number[] };
  explain?: string;
  stats?: QuestionStats;
}

export interface BoardRow {
  rank: number;
  id: string;
  name: string;
  score: number;
  correct: number;
  streak: number;
}

export interface MeView {
  id: string;
  name: string;
  score: number;
  rank: number;
  correctCount: number;
  streak: number;
  answered: boolean;
  answer?: unknown;
  lastPoints?: number;
  lastCorrect?: boolean;
  lastFraction?: number;
}

export interface RoomView {
  pin: string;
  title: string;
  phase: Phase;
  version: number;
  index: number;
  total: number;
  playerCount: number;
  question: QuestionView | null;
  leaderboard?: BoardRow[];
  players?: { id: string; name: string; score: number; answered: boolean }[];
  answeredCount?: number;
  me?: MeView;
}

export interface QuizSummary {
  title: string;
  questions: { text: string; type: QuestionType; timeLimit: number; points: number }[];
}

export const TYPE_LABELS: Record<QuestionType, string> = {
  single: 'Single answer',
  multi: 'Multiple choice',
  text: 'Type the answer',
  match: 'Match the following',
  truefalse: 'True or false',
};

// -- storage: which room this browser plays or hosts --------------------------------------------
const playerKey = (pin: string) => `studyhubs.quiz.player.${pin}`;
const hostKey = (pin: string) => `studyhubs.quiz.host.${pin}`;

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* private mode: the page still works until reload */
  }
}

export const playerToken = (pin: string) => read(playerKey(pin));
export const setPlayerToken = (pin: string, token: string | null) => write(playerKey(pin), token);
export const hostSecret = (pin: string) => read(hostKey(pin));
export const setHostSecret = (pin: string, key: string | null) => write(hostKey(pin), key);

// -- API ------------------------------------------------------------------------------------------
export const joinRoom = (pin: string, name: string) =>
  api<{ playerId: string; token: string; name: string }>(`/api/quiz/rooms/${encodeURIComponent(pin)}/join`, {
    json: { name },
  });

export const sendAnswer = (pin: string, token: string, index: number, answer: unknown) =>
  api<RoomView>(`/api/quiz/rooms/${encodeURIComponent(pin)}/answer`, {
    json: { index, answer },
    headers: { 'X-Quiz-Token': token },
  });

export const parseQuiz = (source: string) =>
  api<({ ok: true } & QuizSummary) | { ok: false; errors: string[] }>('/api/quiz/parse', { json: { source } });

export const createRoom = (source: string) =>
  api<{ pin: string; hostKey: string } & QuizSummary>('/api/quiz/rooms', { json: { source } });

export const listRooms = () =>
  api<{ rooms: { pin: string; title: string; phase: Phase; players: number; hostKey: string }[] }>('/api/quiz/rooms');

export const hostAction = (pin: string, key: string, action: string, playerId?: string) =>
  api<RoomView | { closed: true }>(`/api/quiz/rooms/${encodeURIComponent(pin)}/host/action`, {
    json: { action, playerId },
    headers: { 'X-Quiz-Host': key },
  });

/**
 * Keep a room view fresh by long-polling. `push` lets callers apply a view they got from a POST
 * straight away. Stops for good on 403/404 (`fatal` holds the message).
 */
export function useRoomPoll(path: string | null, headers: Record<string, string>) {
  const [view, setView] = useState<RoomView | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const version = useRef(0);
  const headerKey = JSON.stringify(headers);

  const push = (next: RoomView) => {
    if (next.version >= version.current) {
      version.current = next.version;
      setView(next);
    }
  };

  useEffect(() => {
    if (!path) return;
    let stopped = false;
    const controller = new AbortController();
    version.current = 0;
    (async () => {
      while (!stopped) {
        try {
          const next = await api<RoomView>(`${path}?since=${version.current}`, {
            headers: JSON.parse(headerKey) as Record<string, string>,
            signal: controller.signal,
            timeoutMs: 35_000,
          });
          setOffline(false);
          if (next.version >= version.current) {
            version.current = next.version;
            setView(next);
          }
        } catch (error) {
          if (stopped) return;
          if (isApiProblem(error) && (error.status === 403 || error.status === 404)) {
            setFatal(error.message);
            return;
          }
          setOffline(true);
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
    })();
    return () => {
      stopped = true;
      controller.abort();
    };
  }, [path, headerKey]);

  return { view, fatal, offline, push };
}

/** Seconds left on the open question, ticking locally between server updates. */
export function useCountdown(view: RoomView | null): number {
  const [now, setNow] = useState(() => performance.now());
  const anchor = useRef({ at: performance.now(), ms: 0, key: '' });
  const q = view?.question;
  const key = view ? `${view.version}` : '';
  if (q && anchor.current.key !== key) anchor.current = { at: performance.now(), ms: q.remainingMs, key };
  const open = view?.phase === 'question';
  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => setNow(performance.now()), 250);
    return () => clearInterval(timer);
  }, [open]);
  if (!open || !q) return 0;
  return Math.max(0, Math.ceil((anchor.current.ms - (now - anchor.current.at)) / 1000));
}

export function apiMessage(error: unknown): string {
  return isApiProblem(error) ? error.message : 'Something went wrong. Check your connection and try again.';
}
