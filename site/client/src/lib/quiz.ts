// Live quiz client: types for the /api/quiz views, small API wrappers and the long-poll loop.
import { useEffect, useRef, useState } from 'react';
import { api, isApiProblem } from './api';

export type QuestionType =
  | 'single'
  | 'multi'
  | 'text'
  | 'match'
  | 'truefalse'
  | 'order'
  | 'poll'
  | 'slide'
  | 'explain'
  | 'slider'
  | 'cloud';
export type Confidence = 'sure' | 'unsure';
export type Mode = 'live' | 'self';
export type Stage = 'ready' | 'question' | 'reveal' | 'done';
export type Phase = 'lobby' | 'question' | 'reveal' | 'finished';

export interface QuestionStats {
  answered: number;
  players: number;
  correct: number;
  counts?: number[];
  top?: [string, number][];
  responses?: { name: string; text: string }[];
  /** Word cloud: [word, count], most common first. */
  words?: [string, number][];
  /** Slider: where answers landed. */
  average?: number;
  median?: number;
  bins?: number[];
}

export interface SliderScale {
  min: number;
  max: number;
  step: number;
  unit: string;
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
  items?: string[];
  body?: string;
  answerText?: string;
  hintCount?: number;
  image?: string;
  hints?: string[];
  model?: string[];
  scale?: SliderScale;
  solution?: {
    correct?: number[];
    accepted?: string[];
    pairs?: number[];
    order?: number[];
    value?: number;
    margin?: number;
  };
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
  team?: number | null;
}

export interface TeamRow {
  team: number;
  name: string;
  players: number;
  total: number;
  score: number; // average per member
  rank: number;
}

/** Team names and colours (the server uses the same order: app/quiz/room.py TEAM_NAMES). */
export const TEAMS = [
  { name: 'Violet', color: '#6c4cf5' },
  { name: 'Teal', color: '#0b8478' },
  { name: 'Coral', color: '#d63a48' },
  { name: 'Amber', color: '#9a5503' },
  { name: 'Blue', color: '#2364c9' },
  { name: 'Rose', color: '#b0306f' },
] as const;

export interface MeView {
  id: string;
  name: string;
  score: number;
  rank: number;
  correctCount: number;
  streak: number;
  answered: boolean;
  team?: number | null;
  answer?: unknown;
  lastPoints?: number;
  lastBonus?: number;
  lastCorrect?: boolean | null;
  lastFraction?: number;
  lastConfidence?: Confidence | null;
  hints?: string[];
  calibration?: Calibration;
}

export interface Calibration {
  sureRight: number;
  sureWrong: number;
  unsureRight: number;
  unsureWrong: number;
}

export interface Insight {
  index: number;
  type: QuestionType;
  text: string;
  answered: number;
  correct: number;
  avgSeconds: number | null;
  sureWrong: number;
  hintsUsed: number;
  topWrong?: { text: string; count: number };
}

export interface ReviewItem extends QuestionView {
  correct: boolean;
  answered: boolean;
  patterns?: string[];
}

export interface SheetRow {
  index: number;
  type: QuestionType;
  text: string;
  done: boolean;
  points: number;
}

/** Room options chosen when it opened (the server echoes them in every view). */
export interface RoomSettings {
  streakBonus: boolean;
  autoplay: number; // seconds the results stay up before the next item (0: the host moves on)
  shuffle: boolean;
  friendlyNames: boolean;
  reactions: boolean;
}

export interface HelpRow {
  id: string;
  name: string;
  correct: number;
  answered: number;
}

export interface RoomView {
  pin: string;
  title: string;
  phase: Phase;
  mode: Mode;
  study: boolean;
  locked: boolean;
  advanced?: boolean;
  insights?: Insight[];
  teams?: number;
  teamBoard?: TeamRow[];
  opensAt?: number | null;
  closesAt?: number | null;
  scoredTotal: number;
  stage?: Stage;
  sheet?: SheetRow[];
  nextIndex?: number | null;
  itemStats?: (QuestionStats | null)[];
  version: number;
  index: number;
  total: number;
  playerCount: number;
  question: QuestionView | null;
  leaderboard?: BoardRow[];
  players?: {
    id: string;
    name: string;
    score?: number;
    answered?: boolean | number;
    position?: number;
    stage?: Stage;
    team?: number | null;
  }[];
  presentKey?: string;
  options?: RoomSettings;
  /** Auto-play: milliseconds until the room moves on by itself. */
  autoMs?: number;
  /** Presenter: recent emoji reactions [sequence number, emoji], oldest first. */
  reactions?: [number, string][];
  /** Host, at the end: players under 50% right (after two answers or more). */
  needsHelp?: HelpRow[];
  doneCount?: number;
  current?: { index: number; type: QuestionType; text: string } | null;
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
  order: 'Put in order',
  poll: 'Poll',
  slide: 'Slide',
  explain: 'Explain it',
  slider: 'Slider',
  cloud: 'Word cloud',
};

/** Emoji players can send to the presenter screen (same order as the server's REACTIONS). */
export const REACTIONS = ['👍', '👏', '😂', '😮', '❤️', '🔥'] as const;

/** A slider number as the server prints it: no trailing zeros. */
export const fmtNumber = (n: number) => (Number.isInteger(n) ? String(n) : String(Number(n.toFixed(6))));

export interface Card {
  type: QuestionType;
  front: string;
  back: string;
  options?: string[];
  explain?: string;
}

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

export const sendAnswer = (pin: string, token: string, index: number, answer: unknown, confidence?: Confidence) =>
  api<RoomView>(`/api/quiz/rooms/${encodeURIComponent(pin)}/answer`, {
    json: { index, answer, confidence },
    headers: { 'X-Quiz-Token': token },
  });

export type ParseResult = ({ ok: true; quiz: unknown } & QuizSummary) | { ok: false; errors: string[] };

/** Check a quiz: the builder's JSON (`quiz`) or the text format (`source`). */
export const parseQuiz = (input: { source: string } | { quiz: unknown }) =>
  api<ParseResult>('/api/quiz/parse', { json: input });

export interface RoomOptions {
  mode: Mode;
  study: boolean;
  teams: number;
  opensAt?: number | null;
  closesAt?: number | null;
  streakBonus?: boolean;
  autoplay?: number;
  shuffle?: boolean;
  friendlyNames?: boolean;
  reactions?: boolean;
}

/** What the join page needs before a nickname is chosen. */
export const roomInfo = (pin: string) =>
  api<{ pin: string; title: string; phase: Phase; mode: Mode; locked: boolean; friendlyNames: boolean }>(
    `/api/quiz/rooms/${encodeURIComponent(pin)}/info`,
  );

/** Three friendly nicknames (adjective + animal) nobody in the room uses yet. */
export const suggestNames = (pin: string) =>
  api<{ names: string[] }>(`/api/quiz/rooms/${encodeURIComponent(pin)}/names`);

export const sendReaction = (pin: string, token: string, emoji: number) =>
  api<{ ok: true }>(`/api/quiz/rooms/${encodeURIComponent(pin)}/react`, {
    json: { emoji },
    headers: { 'X-Quiz-Token': token },
  });

/** The host's full report: one row per player per question. */
export const fetchReport = (pin: string, hostKey: string) =>
  api<{ title: string; columns: string[]; rows: (string | number)[][] }>(
    `/api/quiz/rooms/${encodeURIComponent(pin)}/host/report`,
    { headers: { 'X-Quiz-Host': hostKey } },
  );

/** Rows to CSV (RFC 4180 quoting; formulas defused for spreadsheets). */
export function toCsv(rows: (string | number)[][]): string {
  const cell = (v: string | number) => {
    let text = String(v);
    if (/^[=+\-@]/.test(text) && typeof v === 'string') text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  return rows.map((r) => r.map(cell).join(',')).join('\r\n');
}

export const createRoom = (quiz: unknown, options: RoomOptions) =>
  api<{ pin: string; hostKey: string; mode: Mode } & QuizSummary>('/api/quiz/rooms', {
    json: { quiz, ...options },
  });

export const imageUrl = (id: string) => `/api/quiz/images/${encodeURIComponent(id)}`;

/** Shrink a picture in the browser (longest side 1280 px) and upload it; returns its id. */
export async function uploadImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  let quality = 0.85;
  let data = canvas.toDataURL('image/webp', quality);
  if (!data.startsWith('data:image/webp')) data = canvas.toDataURL('image/jpeg', quality);
  while (data.length > 520_000 && quality > 0.4) {
    quality -= 0.15;
    data = canvas.toDataURL(data.startsWith('data:image/webp') ? 'image/webp' : 'image/jpeg', quality);
  }
  const r = await api<{ id: string }>('/api/quiz/images', { json: { data } });
  return r.id;
}

export interface OpenRoom {
  pin: string;
  title: string;
  phase: Phase;
  mode: Mode;
  players: number;
  hostKey: string;
}
export const listRooms = () => api<{ rooms: OpenRoom[] }>('/api/quiz/rooms');

export const hostAction = (
  pin: string,
  key: string,
  action: string,
  extra: { playerId?: string; index?: number; seconds?: number } = {},
) =>
  api<RoomView | { closed: true }>(`/api/quiz/rooms/${encodeURIComponent(pin)}/host/action`, {
    json: { action, ...extra },
    headers: { 'X-Quiz-Host': key },
  });

export const advance = (pin: string, token: string) =>
  api<RoomView>(`/api/quiz/rooms/${encodeURIComponent(pin)}/advance`, {
    method: 'POST',
    headers: { 'X-Quiz-Token': token },
  });

export const fetchCards = (pin: string, token: string) =>
  api<{ title: string; cards: Card[] }>(`/api/quiz/rooms/${encodeURIComponent(pin)}/cards`, {
    headers: { 'X-Quiz-Token': token },
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
  const open = !!q && q.timeLimit > 0 && (view?.mode === 'self' ? view.stage === 'question' : view?.phase === 'question');
  const key = view ? `${view.version}:${q?.index}:${view.stage}:${view.phase}:${q?.remainingMs}` : '';
  if (q && anchor.current.key !== key) anchor.current = { at: performance.now(), ms: q.remainingMs, key };
  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => setNow(performance.now()), 250);
    return () => clearInterval(timer);
  }, [open]);
  if (!open || !q) return 0;
  return Math.max(0, Math.ceil((anchor.current.ms - (now - anchor.current.at)) / 1000));
}

/** Auto-play: whole seconds until the room moves on by itself (null when it waits for the host). */
export function useAutoCountdown(view: RoomView | null): number | null {
  const [now, setNow] = useState(() => performance.now());
  const anchor = useRef({ at: performance.now(), ms: 0, key: '' });
  const ms = view?.autoMs;
  const key = view ? `${view.version}:${ms}` : '';
  if (ms !== undefined && anchor.current.key !== key) anchor.current = { at: performance.now(), ms, key };
  useEffect(() => {
    if (ms === undefined) return;
    const timer = setInterval(() => setNow(performance.now()), 250);
    return () => clearInterval(timer);
  }, [ms]);
  if (ms === undefined) return null;
  return Math.max(0, Math.ceil((anchor.current.ms - (now - anchor.current.at)) / 1000));
}

export function apiMessage(error: unknown): string {
  return isApiProblem(error) ? error.message : 'Something went wrong. Check your connection and try again.';
}

export const askHint = (pin: string, token: string, index: number) =>
  api<{ hints: string[] }>(`/api/quiz/rooms/${encodeURIComponent(pin)}/hint`, {
    json: { index },
    headers: { 'X-Quiz-Token': token },
  });

export const fetchReview = (pin: string, token: string) =>
  api<{ title: string; items: ReviewItem[]; advanced: boolean }>(`/api/quiz/rooms/${encodeURIComponent(pin)}/review`, {
    headers: { 'X-Quiz-Token': token },
  });

/** The host's export of a room: every card (with its item index) and the results per item. */
export const fetchHostCards = (pin: string, hostKey: string) =>
  api<{ title: string; cards: (Card & { index: number })[]; insights: Insight[] }>(
    `/api/quiz/rooms/${encodeURIComponent(pin)}/host/cards`,
    { headers: { 'X-Quiz-Host': hostKey } },
  );

// -- saved quizzes (server library) and the hubs' question bank ---------------------------
export interface LibraryEntry {
  id: string;
  title: string;
  advanced: boolean;
  items: number;
  questions: number;
  updated: number;
  by: string;
}
export const listLibrary = () => api<{ quizzes: LibraryEntry[] }>('/api/quiz/library');
export const getSaved = (id: string) => api<{ doc: unknown; version: number }>(`/api/quiz/library/${encodeURIComponent(id)}`);
export const putSaved = (id: string, doc: unknown, expect: number | null) =>
  api<{ version: number }>(`/api/quiz/library/${encodeURIComponent(id)}`, { method: 'PUT', json: { doc, expect } });
export const deleteSaved = (id: string) =>
  api<{ deleted: true }>(`/api/quiz/library/${encodeURIComponent(id)}`, { method: 'DELETE' });

export interface BankModule {
  id: string;
  title: string;
  keys: string[];
  quiz: { q: string; o: string[]; a: number; e: string }[];
}
export interface BankHub {
  id: string;
  title: string;
  code: string | null;
  modules: { id: string; title: string; questions: number; keys: number }[];
}
export const listBank = () => api<{ hubs: BankHub[] }>('/api/quiz/bank');
export const getBankHub = (id: string) =>
  api<{ id: string; title: string; modules: BankModule[] }>(`/api/quiz/bank/${encodeURIComponent(id)}`);

// -- AI drafts (optional: the server needs ANTHROPIC_API_KEY) -------------------------------
export type DraftKind = 'single' | 'multi' | 'truefalse' | 'text';
export interface DraftRequest {
  notes?: string;
  hubId?: string;
  moduleIds?: string[];
  count: number;
  kinds: DraftKind[];
  advanced: boolean;
  avoid: string[];
}
export interface DraftResult {
  items: unknown[];
  dropped: number;
  model: string;
  usage: { input: number; output: number };
}
export const aiStatus = () => api<{ enabled: boolean; model: string }>('/api/quiz/ai');
export const draftQuestions = (request: DraftRequest) =>
  // Drafting takes the model up to a couple of minutes: a long timeout for this call only.
  api<DraftResult>('/api/quiz/ai/draft', { method: 'POST', json: request, timeoutMs: 200_000 });

/** Check a practice answer locally (replay mode), from a reviewed item's solution. */
export function checkLocally(item: ReviewItem, value: unknown): boolean {
  const s = item.solution ?? {};
  const norm = (v: string) => v.split(/\s+/).filter(Boolean).join(' ').toLowerCase();
  switch (item.type) {
    case 'single':
    case 'truefalse':
      return (s.correct ?? []).includes(value as number);
    case 'multi': {
      const picked = [...((value as number[]) ?? [])].sort().join(',');
      return picked === [...(s.correct ?? [])].sort().join(',');
    }
    case 'text': {
      const text = String(value ?? '');
      return (item.patterns ?? s.accepted ?? []).some((raw) => {
        const m = /^\/(.*)\/([a-z]*)$/s.exec(raw);
        if (!m) return norm(raw) === norm(text);
        try {
          return new RegExp(`^(?:${m[1]})$`, m[2]!.includes('i') ? 'i' : '').test(text.trim());
        } catch {
          return false;
        }
      });
    }
    case 'match':
      return JSON.stringify(value) === JSON.stringify(s.pairs);
    case 'order':
      return JSON.stringify(value) === JSON.stringify(s.order);
    default:
      return false;
  }
}

// -- presenter screen and public leaderboard -------------------------------------------------
const presentStore = (pin: string) => `studyhubs.quiz.present.${pin}`;

/** The presenter key from the link (#k=...), remembered for this tab so reloads keep working. */
export function presenterKey(pin: string): string | null {
  const fromHash = new URLSearchParams(window.location.hash.slice(1)).get('k');
  try {
    if (fromHash) window.sessionStorage.setItem(presentStore(pin), fromHash);
    return fromHash ?? window.sessionStorage.getItem(presentStore(pin));
  } catch {
    return fromHash;
  }
}

export const presenterLink = (pin: string, key: string) => `${window.location.origin}/quiz/present/${pin}#k=${encodeURIComponent(key)}`;
export const boardLink = (pin: string) => `${window.location.origin}/quiz/board/${pin}`;
