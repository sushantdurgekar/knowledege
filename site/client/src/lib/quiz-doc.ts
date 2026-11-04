// The quiz builder's document model, a small library kept in this browser, and the text format.
import type { QuestionType } from './quiz';

export interface DocOption {
  text: string;
  correct: boolean;
}

export interface DocItem {
  id: string;
  type: QuestionType;
  text: string;
  body?: string;
  time?: number;
  points?: number;
  options?: DocOption[];
  answer?: boolean; // truefalse
  answers?: string[]; // text
  pairs?: [string, string][]; // match
  items?: string[]; // order
  explain?: string;
}

export interface QuizDoc {
  id: string;
  title: string;
  time: number;
  points: number;
  items: DocItem[];
  updated: number;
}

export const ITEM_TYPES: { type: QuestionType; label: string; hint: string }[] = [
  { type: 'single', label: 'Quiz', hint: 'One right answer' },
  { type: 'multi', label: 'Multiple choice', hint: 'Several right answers' },
  { type: 'truefalse', label: 'True or false', hint: 'Quick check' },
  { type: 'text', label: 'Type answer', hint: 'Text or pattern' },
  { type: 'match', label: 'Match', hint: 'Drag pairs together' },
  { type: 'order', label: 'Put in order', hint: 'Drag into sequence' },
  { type: 'poll', label: 'Poll', hint: 'No right answer' },
  { type: 'slide', label: 'Slide', hint: 'Present content' },
];

export const newId = () => Math.random().toString(36).slice(2, 10);

export function blankItem(type: QuestionType): DocItem {
  const base: DocItem = { id: newId(), type, text: '' };
  switch (type) {
    case 'single':
    case 'multi':
      return { ...base, options: [0, 1, 2, 3].map((i) => ({ text: '', correct: type === 'multi' ? i < 2 : i === 0 })) };
    case 'poll':
      return { ...base, options: [0, 1, 2].map(() => ({ text: '', correct: false })) };
    case 'truefalse':
      return { ...base, answer: true };
    case 'text':
      return { ...base, answers: [''] };
    case 'match':
      return { ...base, pairs: [['', ''], ['', ''], ['', '']] };
    case 'order':
      return { ...base, items: ['', '', ''] };
    case 'slide':
      return { ...base, body: '' };
  }
}

/** Switch an item to another type, keeping the text and whatever carries over. */
export function retype(item: DocItem, type: QuestionType): DocItem {
  const fresh = blankItem(type);
  const keep = { id: item.id, text: item.text, time: item.time, points: item.points, explain: item.explain };
  if (item.options && fresh.options) {
    const options = item.options.map((o) => ({ text: o.text, correct: type === 'poll' ? false : o.correct }));
    if (type === 'single' && options.filter((o) => o.correct).length !== 1) options.forEach((o, i) => (o.correct = i === 0));
    return { ...fresh, ...keep, options };
  }
  return { ...fresh, ...keep };
}

export function blankDoc(): QuizDoc {
  return { id: newId(), title: 'Untitled quiz', time: 20, points: 1000, items: [blankItem('single')], updated: Date.now() };
}

/** The JSON the server reads (`quiz_from_json`). */
export function toServer(doc: QuizDoc): unknown {
  return {
    title: doc.title,
    time: doc.time,
    points: doc.points,
    items: doc.items.map(({ id: _id, ...item }) => item),
  };
}

/** A quiz the server sent back (`quiz_to_json`) as a builder document. */
export function fromServer(data: unknown, id = newId()): QuizDoc {
  const raw = (data ?? {}) as { title?: string; items?: Omit<DocItem, 'id'>[] };
  const items = (raw.items ?? []).map((item) => ({ ...item, id: newId() }) as DocItem);
  const times = items.map((i) => i.time).filter((t): t is number => typeof t === 'number');
  const points = items.map((i) => i.points).filter((p): p is number => typeof p === 'number' && p > 0);
  return {
    id,
    title: raw.title || 'Imported quiz',
    time: mode(times) ?? 20,
    points: mode(points) ?? 1000,
    items,
    updated: Date.now(),
  };
}

function mode(values: number[]): number | undefined {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: number | undefined;
  for (const [v, n] of counts) if (best === undefined || n > (counts.get(best) ?? 0)) best = v;
  return best;
}

/** The plain-text import format (what `parse_quiz` reads). */
export function toText(doc: QuizDoc): string {
  const lines = [`title: ${doc.title}`, `time: ${doc.time}`, `points: ${doc.points}`, ''];
  for (const item of doc.items) {
    if (item.type === 'slide') {
      lines.push(`Slide: ${item.text}`);
      if (item.body) lines.push(...item.body.split('\n'));
      lines.push('');
      continue;
    }
    lines.push(`Q: ${item.text}`);
    lines.push(`type: ${item.type}`);
    if (item.time && item.time !== doc.time) lines.push(`time: ${item.time}`);
    if (item.points !== undefined && item.points !== doc.points) lines.push(`points: ${item.points}`);
    for (const o of item.options ?? []) lines.push(`${o.correct ? '*' : '-'} ${o.text}`);
    if (item.type === 'truefalse') lines.push(`answer: ${item.answer ? 'true' : 'false'}`);
    for (const a of item.answers ?? []) lines.push(`answer: ${a}`);
    for (const [l, r] of item.pairs ?? []) lines.push(`pair: ${l.replace(/=/g, ' ')} = ${r}`);
    for (const i of item.items ?? []) lines.push(`item: ${i}`);
    if (item.explain) lines.push(`explain: ${item.explain.replace(/\n/g, ' ')}`);
    lines.push('');
  }
  return lines.join('\n');
}

// -- library (localStorage) ------------------------------------------------------------------
const LIBRARY_KEY = 'studyhubs.quiz.library';

export function loadLibrary(): QuizDoc[] {
  try {
    const raw = window.localStorage.getItem(LIBRARY_KEY);
    const docs = raw ? (JSON.parse(raw) as QuizDoc[]) : [];
    return Array.isArray(docs) ? docs.sort((a, b) => b.updated - a.updated) : [];
  } catch {
    return [];
  }
}

export function saveDoc(doc: QuizDoc): QuizDoc[] {
  const docs = loadLibrary().filter((d) => d.id !== doc.id);
  docs.unshift({ ...doc, updated: Date.now() });
  writeLibrary(docs);
  return docs;
}

export function deleteDoc(id: string): QuizDoc[] {
  const docs = loadLibrary().filter((d) => d.id !== id);
  writeLibrary(docs);
  return docs;
}

function writeLibrary(docs: QuizDoc[]): void {
  try {
    window.localStorage.setItem(LIBRARY_KEY, JSON.stringify(docs));
  } catch {
    /* storage full or blocked: the editor still works for this session */
  }
}

export function download(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const slugify = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'quiz';
