import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { parentOf } from '../src/components/SiteNav';
import { blankDoc, blankItem, fromServer, retype, toServer, toText, type QuizDoc } from '../src/lib/quiz-doc';
import { Sortable } from '../src/pages/quiz/Sortable';
import { Answering, WordCloud } from '../src/pages/quiz/Answering';
import { toCsv, type QuestionView } from '../src/lib/quiz';
import { bodyText, ME_SIGNED_IN, mockServer, setHint, USER } from './api-mock';
import { renderApp } from './render';
import type { DeckCard, HistoryEntry } from '../src/lib/quiz-history';
import { progressOf, streakOf } from '../src/lib/progress-stats';
import { cueFor, setSoundPreference, soundPreference, type RoomSnap } from '../src/lib/sound';
import { deckToVault, roomToVault, vaultId } from '../src/lib/vault-export';

describe('quiz builder model', () => {
  const doc: QuizDoc = {
    ...blankDoc(),
    title: 'Demo',
    items: [
      { id: 'a', type: 'slide', text: 'Intro', body: 'Line one\n\n- bullet' },
      { id: 'b', type: 'single', text: 'Port?', options: [{ text: '80', correct: false }, { text: '443', correct: true }], time: 30 },
      { id: 'c', type: 'truefalse', text: 'TLS is L4', answer: false },
      { id: 'd', type: 'order', text: 'Handshake', items: ['SYN', 'SYN-ACK', 'ACK'] },
      { id: 'e', type: 'match', text: 'Ports', pairs: [['SSH', '22'], ['DNS', '53']] },
      { id: 'f', type: 'text', text: 'Capital?', answers: ['Paris', '/^paris$/i'] },
    ],
  };

  it('writes the text format the server reads', () => {
    const text = toText(doc);
    expect(text).toContain('Slide: Intro\nLine one\n\n- bullet');
    expect(text).toContain('Q: Port?\ntype: single\ntime: 30\n- 80\n* 443');
    expect(text).toContain('answer: false');
    expect(text).toContain('item: SYN\nitem: SYN-ACK\nitem: ACK');
    expect(text).toContain('pair: SSH = 22');
    expect(text).toContain('answer: /^paris$/i');
  });

  it('sends JSON without editor ids and reads it back', () => {
    const json = toServer(doc) as { items: Record<string, unknown>[] };
    expect(json.items.every((i) => !('id' in i))).toBe(true);
    const again = fromServer(json);
    expect(again.items.map((i) => i.type)).toEqual(doc.items.map((i) => i.type));
    expect(again.title).toBe('Demo');
  });

  it('keeps text and options when an item changes type', () => {
    const multi = { ...blankItem('multi'), text: 'Pick' };
    const single = retype(multi, 'single');
    expect(single.text).toBe('Pick');
    expect(single.options!.filter((o) => o.correct)).toHaveLength(1);
    expect(retype(multi, 'poll').options!.every((o) => !o.correct)).toBe(true);
    expect(retype(multi, 'order').items).toHaveLength(3);
  });

  it('Back goes to the right parent page', () => {
    expect(parentOf('/quiz/host/edit/abc')).toBe('/quiz/host');
    expect(parentOf('/quiz/host/123456')).toBe('/quiz/host');
    expect(parentOf('/quiz/play/123456')).toBe('/quiz');
    expect(parentOf('/account')).toBe('/');
  });
});

describe('Sortable', () => {
  function Harness() {
    const [order, setOrder] = useState([0, 1, 2]);
    return (
      <>
        <Sortable label="Order" labels={['A', 'B', 'C']} order={order} onChange={setOrder} />
        <output data-testid="order">{order.join(',')}</output>
      </>
    );
  }

  it('reorders with the Move up / Move down buttons and announces it', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Move A down' }));
    expect(screen.getByTestId('order')).toHaveTextContent('1,0,2');
    await user.click(screen.getByRole('button', { name: 'Move C up' }));
    expect(screen.getByTestId('order')).toHaveTextContent('1,2,0');
    expect(screen.getByText('C moved to position 2 of 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move B up' })).toBeDisabled();
  });
});

import { checkLocally, type ReviewItem } from '../src/lib/quiz';
import { fromBank } from '../src/lib/quiz-doc';
import { cardId, dueCards, emptyState, localDay, markStudied, merge, recordQuiz, schedule } from '../src/lib/quiz-history';

describe('review deck (SM-2) and history', () => {
  const cards = [
    { type: 'single' as const, front: 'Port of HTTPS?', back: '443' },
    { type: 'order' as const, front: 'Handshake order', back: 'SYN → SYN-ACK → ACK' },
    { type: 'slide' as const, front: 'Intro', back: 'text' },
  ];
  const entry = { id: 'r1', title: 'Net', at: 1, score: 10, rank: 1, players: 2, correct: 1, total: 2 };

  it('adds missed cards due now and right ones due tomorrow; slides are skipped', () => {
    const now = 1_000_000;
    const s = recordQuiz(emptyState(), entry, cards, new Set(['Handshake order']), now);
    expect(Object.keys(s.deck)).toHaveLength(2);
    expect(dueCards(s, now).map((c) => c.front)).toEqual(['Handshake order']);
    expect(recordQuiz(s, entry, cards, new Set(), now)).toBe(s); // the same quiz twice: no-op
  });

  it('schedules with SM-2: again resets, good grows 1 -> 6 -> ef', () => {
    const now = 0;
    const base = recordQuiz(emptyState(), entry, cards, new Set(['Port of HTTPS?']), now).deck[cardId('Net', 'Port of HTTPS?')]!;
    const good1 = schedule(base, 4, now);
    expect([good1.reps, good1.interval]).toEqual([1, 1]);
    const good2 = schedule(good1, 4, now);
    expect(good2.interval).toBe(6);
    expect(schedule(good2, 4, now).interval).toBe(15);
    const again = schedule(good2, 1, now);
    expect([again.reps, again.interval, again.lapses]).toEqual([0, 0, 2]);
    expect(schedule(base, 5, now).ef).toBeGreaterThan(base.ef);
  });

  it('merges two devices: newest card wins, histories unite', () => {
    const a = recordQuiz(emptyState(), entry, cards, new Set(), 0);
    const id = cardId('Net', 'Port of HTTPS?');
    const b = { ...a, deck: { ...a.deck, [id]: { ...a.deck[id]!, updated: 99, interval: 6 } }, history: [{ ...entry, id: 'r2', at: 2 }] };
    const m = merge(a, b);
    expect(m.deck[id]!.interval).toBe(6);
    expect(m.history.map((h) => h.id)).toEqual(['r2', 'r1']);
  });
});

describe('replay checking and hub import', () => {
  const item = (over: Partial<ReviewItem>): ReviewItem =>
    ({ index: 0, text: 'q', type: 'single', timeLimit: 10, points: 1, remainingMs: 0, correct: false, answered: true, ...over }) as ReviewItem;

  it('checks answers in the browser', () => {
    expect(checkLocally(item({ solution: { correct: [1] } }), 1)).toBe(true);
    expect(checkLocally(item({ type: 'multi', solution: { correct: [0, 2] } }), [2, 0])).toBe(true);
    expect(checkLocally(item({ type: 'text', patterns: ['Paris', '/^par(is)?$/i'] }), '  PAR ')).toBe(true);
    expect(checkLocally(item({ type: 'text', patterns: ['Paris'] }), 'Lyon')).toBe(false);
    expect(checkLocally(item({ type: 'order', solution: { order: [2, 0, 1] } }), [2, 0, 1])).toBe(true);
  });

  it('builds a quiz from a hub: key points as a slide, then the questions', () => {
    const doc = fromBank('AB-620', [{ title: 'Basics', keys: ['one', 'two'], quiz: [{ q: 'Q?', o: ['a', 'b'], a: 1, e: 'why' }] }], {
      slides: true,
      advanced: true,
    });
    expect(doc.title).toBe('AB-620: Basics');
    expect(doc.advanced).toBe(true);
    expect(doc.items.map((i) => i.type)).toEqual(['slide', 'single']);
    expect(doc.items[0]!.body).toBe('- one\n- two');
    expect(doc.items[1]!.options!.map((o) => o.correct)).toEqual([false, true]);
  });

  it('drops hints from simple quizzes when sending to the server', () => {
    const doc = { ...blankDoc(false), items: [{ ...blankItem('single'), hints: ['h'] }] };
    const sent = toServer(doc) as { items: Record<string, unknown>[] };
    expect('hints' in sent.items[0]!).toBe(false);
    const adv = toServer({ ...doc, advanced: true }) as { items: Record<string, unknown>[] };
    expect(adv.items[0]!.hints).toEqual(['h']);
  });
});

describe('AI drafts in the editor', () => {
  const ADMIN = { ...USER, email: 'admin@studyhubs.test', provider: 'google.com', admin: true };
  const SAVED = {
    doc: { title: 'Networking', items: [{ type: 'single', text: 'Port?', options: [{ text: '80', correct: false }, { text: '443', correct: true }] }] },
    version: 1,
  };
  const BANK = { hubs: [{ id: 'net', title: 'Networking Hub', code: null, modules: [{ id: 'm1', title: 'TLS', questions: 2, keys: 3 }] }] };
  const DRAFT = {
    items: [{ type: 'truefalse', text: 'TLS 1.3 removed RSA key exchange.', answer: true, explain: 'Only (EC)DHE remains.' }],
    dropped: 1,
    model: 'test',
    usage: { input: 10, output: 20 },
  };

  afterEach(() => setHint(null));

  it('hides the button when the server has no API key', async () => {
    setHint(ADMIN.publicId);
    mockServer({
      'GET /api/me': { ...ME_SIGNED_IN, user: ADMIN },
      'GET /api/quiz/library/abc123': SAVED,
      'GET /api/quiz/ai': { enabled: false, model: 'test' },
    });
    renderApp('/quiz/host/edit/abc123');
    expect(await screen.findByLabelText('Quiz title')).toHaveValue('Networking');
    expect(screen.queryByRole('button', { name: 'Draft with AI' })).not.toBeInTheDocument();
  });

  it('drafts from hub modules, avoids existing questions and adds the drafts after the current item', async () => {
    setHint(ADMIN.publicId);
    const server = mockServer({
      'GET /api/me': { ...ME_SIGNED_IN, user: ADMIN },
      'GET /api/quiz/library/abc123': SAVED,
      'PUT /api/quiz/library/abc123': { version: 2 },
      'GET /api/quiz/ai': { enabled: true, model: 'test' },
      'GET /api/quiz/bank': BANK,
      'POST /api/quiz/ai/draft': DRAFT,
    });
    const { user } = renderApp('/quiz/host/edit/abc123');
    await user.click(await screen.findByRole('button', { name: 'Draft with AI' }));
    const dialog = screen.getByRole('dialog', { name: 'Draft questions with AI' });
    expect(within(dialog).getByRole('button', { name: 'Draft 8 questions' })).toBeDisabled();
    await user.selectOptions(await within(dialog).findByLabelText('Hub'), 'net');
    await user.click(within(dialog).getByRole('checkbox', { name: /TLS/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Draft 8 questions' }));

    expect(await screen.findByText(/Added 1 drafted question after item 1 \(1 failed the checks/)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const sent = JSON.parse(await bodyText(server.to('POST /api/quiz/ai/draft')[0]!));
    expect(sent).toMatchObject({ hubId: 'net', moduleIds: ['m1'], count: 8, kinds: ['single', 'multi', 'truefalse'], avoid: ['Port?'] });
    // The draft is now item 2 and selected for review.
    expect(screen.getByLabelText('Question')).toHaveValue('TLS 1.3 removed RSA key exchange.');
  });
});

describe('Knowledge vault export', () => {
  const card = (over: Partial<DeckCard>): DeckCard => ({
    id: 'x',
    quiz: 'Networking 101',
    type: 'single',
    front: 'Which port does HTTPS use?',
    back: '443',
    options: ['80', '443'],
    explain: 'TLS on the web port 443.',
    ef: 2.36,
    interval: 6,
    reps: 2,
    due: new Date(2026, 10, 10, 9).getTime(),
    lapses: 1,
    updated: 0,
    ...over,
  });

  it('writes srs.py cards with the schedule, options on the front and the explanation on the back', () => {
    const [out, ...rest] = deckToVault([card({}), card({ type: 'slide', front: 'Intro' })]);
    expect(rest).toHaveLength(0); // slides are not review cards
    expect(out).toEqual({
      id: vaultId('Networking 101', 'Which port does HTTPS use?'),
      deck: 'quiz-networking-101',
      track: 'technical',
      front: 'Which port does HTTPS use?\nA. 80\nB. 443',
      back: '443\n\nTLS on the web port 443.',
      tags: ['study-hubs', 'live-quiz', 'missed'],
      source: 'Study Hubs quiz: Networking 101',
      ef: 2.36,
      interval: 6,
      reps: 2,
      lapses: 1,
      due: '2026-11-10',
    });
    expect(out!.id).toMatch(/^quiz-networking-101-[a-z0-9]+$/);
  });

  it('tags the questions most of the room missed', () => {
    const cards = [
      { index: 1, type: 'truefalse' as const, front: 'TLS is L4', back: 'False' },
      { index: 2, type: 'text' as const, front: 'Capital of France?', back: 'Paris' },
    ];
    const stats = new Map([
      [1, { answered: 10, correct: 3 }],
      [2, { answered: 10, correct: 9 }],
    ]);
    const out = roomToVault('Net quiz', cards, stats);
    expect(out.map((c) => c.tags)).toEqual([
      ['study-hubs', 'live-quiz', 'missed-by-room'],
      ['study-hubs', 'live-quiz'],
    ]);
    expect(out[0]).not.toHaveProperty('due'); // new to the vault: srs.py makes it due today
  });
});

describe('progress page numbers', () => {
  const NOW = new Date(2026, 10, 4, 15).getTime(); // 4 Nov 2026, 15:00 local
  const DAYMS = 86_400_000;
  const entry = (i: number, correct: number, title = 'Net'): HistoryEntry => ({
    id: `h${i}`,
    title,
    at: NOW - (20 - i) * DAYMS,
    score: 0,
    rank: 1,
    players: 3,
    correct,
    total: 10,
  });
  const deckCard = (id: string, due: number, lapses = 0): DeckCard => ({
    id, quiz: 'Net', type: 'single', front: id, back: 'x', ef: 2.5, interval: 1, reps: 1, due, lapses, updated: 0,
  });

  it('computes accuracy, the last-5 delta, weakest quizzes and calibration', () => {
    const history = [
      ...Array.from({ length: 5 }, (_, i) => entry(i, 5)),
      ...Array.from({ length: 5 }, (_, i) => entry(i + 5, 8)),
      { ...entry(10, 2, 'Crypto'), calibration: { sureRight: 1, sureWrong: 3, unsureRight: 2, unsureWrong: 4 } },
    ];
    const p = progressOf({ deck: {}, history }, NOW);
    expect(p.played).toBe(11);
    expect(p.accuracy).toBe(Math.round((67 / 110) * 100));
    // newest five: 8,8,8,8,2 (=68%) against the five before: 8,5,5,5,5 (=56%)
    expect(p.recentDelta).toBe(12);
    expect(p.areas.map((a) => [a.title, a.pct])).toEqual([['Crypto', 20], ['Net', 65]]);
    expect(p.calibration).toEqual({ sureRight: 1, sureWrong: 3, unsureRight: 2, unsureWrong: 4 });
    expect(p.trend.at(-1)!.title).toBe('Crypto');
  });

  it('puts overdue cards on today and counts the next two weeks by local day', () => {
    const deck = Object.fromEntries(
      [
        deckCard('late', NOW - 3 * DAYMS),
        deckCard('tonight', NOW + 2 * 3_600_000),
        deckCard('tomorrow', NOW + DAYMS, 2),
        deckCard('far', NOW + 30 * DAYMS),
      ].map((c) => [c.id, c]),
    );
    const p = progressOf({ deck, history: [] }, NOW);
    expect(p.forecast.slice(0, 3).map((d) => d.count)).toEqual([2, 1, 0]);
    expect(p.forecast.reduce((n, d) => n + d.count, 0)).toBe(3);
    expect(p.dueNow).toBe(1);
    expect(p.hardest.map((c) => c.id)).toEqual(['tomorrow']);
  });

  it('keeps a streak alive until tonight and merges study days by the larger count', () => {
    const day = (offset: number) => localDay(NOW + offset * DAYMS);
    expect(streakOf({ [day(-1)]: 2, [day(-2)]: 1, [day(-4)]: 5 }, NOW)).toEqual({ streak: 2, today: false });
    expect(streakOf({ [day(0)]: 1, [day(-1)]: 1 }, NOW)).toEqual({ streak: 2, today: true });
    const studied = markStudied({ deck: {}, history: [] }, NOW);
    expect(studied.days).toEqual({ [day(0)]: 1 });
    const merged = merge({ deck: {}, history: [], days: { [day(0)]: 3 } }, { deck: {}, history: [], days: { [day(0)]: 1, [day(-1)]: 2 } });
    expect(merged.days).toEqual({ [day(0)]: 3, [day(-1)]: 2 });
  });
});

describe('presenter sounds', () => {
  const snap = (over: Partial<RoomSnap>): RoomSnap => ({ phase: 'lobby', self: false, players: 0, done: 0, seconds: 0, ...over });

  it('cues joins, the question start, the last five seconds, the reveal and the finale', () => {
    expect(cueFor(null, snap({ players: 30 }))).toBeNull(); // what the screen finds on load is silent
    expect(cueFor(snap({ players: 1 }), snap({ players: 2 }))).toBe('join');
    const q = snap({ phase: 'question', index: 0, players: 2, seconds: 20 });
    expect(cueFor(snap({ players: 2 }), q)).toBe('start');
    expect(cueFor(q, { ...q, seconds: 19 })).toBeNull();
    expect(cueFor({ ...q, seconds: 6 }, { ...q, seconds: 5 })).toBe('tick');
    expect(cueFor({ ...q, seconds: 4 }, { ...q, seconds: 3 })).toBe('tock');
    expect(cueFor({ ...q, seconds: 1 }, { ...q, seconds: 0 })).toBeNull();
    expect(cueFor(q, { ...q, phase: 'reveal' })).toBe('reveal');
    expect(cueFor({ ...q, phase: 'reveal' }, { ...q, index: 1 })).toBe('start');
    expect(cueFor({ ...q, phase: 'reveal' }, { ...q, phase: 'finished' })).toBe('finale');
    expect(cueFor({ ...q, phase: 'finished' }, { ...q, phase: 'finished' })).toBeNull();
  });

  it('in a self-paced room pops when a player finishes, without ticks', () => {
    const s = snap({ phase: 'question', self: true, players: 5, done: 1, seconds: 9 });
    expect(cueFor(s, { ...s, done: 2 })).toBe('join');
    expect(cueFor({ ...s, seconds: 5 }, { ...s, seconds: 4 })).toBeNull();
  });

  it('remembers mute in this browser', () => {
    setSoundPreference(false);
    expect(soundPreference()).toBe(false);
    setSoundPreference(true);
    expect(soundPreference()).toBe(true);
  });
});

describe('Kahoot-style additions', () => {
  it('writes slider and word-cloud items in the text format', () => {
    const doc: QuizDoc = {
      ...blankDoc(),
      title: 'Fun',
      items: [
        { id: 's', type: 'slider', text: 'Bits in a byte?', min: 0, max: 16, step: 1, answer: 8, margin: 0, unit: 'bits' },
        { id: 'c', type: 'cloud', text: 'One word for TLS' },
      ],
    };
    const text = toText(doc);
    expect(text).toContain('Q: Bits in a byte?\ntype: slider\nmin: 0\nmax: 16\nstep: 1\nanswer: 8\nunit: bits');
    expect(text).toContain('Q: One word for TLS\ntype: cloud');
    expect(blankItem('slider')).toMatchObject({ min: 0, max: 100, step: 1, answer: 50 });
  });

  it('builds CSV with quotes and defuses spreadsheet formulas', () => {
    expect(toCsv([['Player', 'Answer'], ['Ann', '=1+1'], ['Bob', 'say "hi"'], ['Cy', 42]])).toBe(
      '"Player","Answer"\r\n"Ann","\'=1+1"\r\n"Bob","say ""hi"""\r\n"Cy","42"',
    );
  });

  it('answers a slider on the question scale', async () => {
    const user = userEvent.setup();
    const answers: unknown[] = [];
    const q: QuestionView = {
      index: 0, text: 'How many?', type: 'slider', timeLimit: 20, points: 1000, remainingMs: 20000,
      scale: { min: 0, max: 10, step: 0.5, unit: 'km' },
    };
    render(<Answering q={q} disabled={false} onAnswer={(v) => answers.push(v)} />);
    expect(screen.getByRole('status')).toHaveTextContent('5 km');
    const exact = screen.getByLabelText('Exact value');
    await user.clear(exact);
    await user.type(exact, '7.4');
    await user.click(screen.getByRole('button', { name: 'Lock it in' }));
    expect(answers).toEqual([7.5]); // snapped to the 0.5 steps
  });

  it('draws a word cloud, biggest word for the most answers', () => {
    render(<WordCloud words={[['secure', 4], ['fast', 1]]} />);
    const words = screen.getAllByRole('listitem');
    const size = (name: string) => Number(words.find((w) => w.textContent?.startsWith(name))!.style.getPropertyValue('--s'));
    expect(size('secure')).toBeGreaterThan(size('fast'));
    expect(screen.getByRole('list', { name: /Word cloud/ })).toHaveTextContent('secure: 4');
  });

  it('a friendly-names room offers generated names and joins with the one picked', async () => {
    const server = mockServer({
      'GET /api/quiz/rooms/123456/info': { pin: '123456', title: 'Team quiz', phase: 'lobby', mode: 'live', locked: false, friendlyNames: true },
      'GET /api/quiz/rooms/123456/names': { names: ['Curious Otter', 'Brave Koala', 'Sunny Owl'] },
      'POST /api/quiz/rooms/123456/join': { playerId: 'p1', token: 't1', name: 'Brave Koala' },
    });
    const { user } = renderApp('/quiz?pin=123456');
    expect(await screen.findByText('Joining “Team quiz”')).toBeInTheDocument();
    expect(screen.queryByLabelText('Nickname')).not.toBeInTheDocument();
    await user.click(await screen.findByRole('radio', { name: 'Brave Koala' }));
    await user.click(screen.getByRole('button', { name: 'Join' }));
    await waitFor(() => expect(server.to('POST /api/quiz/rooms/123456/join')).toHaveLength(1));
    expect(JSON.parse(await bodyText(server.to('POST /api/quiz/rooms/123456/join')[0]!))).toEqual({ name: 'Brave Koala' });
  });
});
