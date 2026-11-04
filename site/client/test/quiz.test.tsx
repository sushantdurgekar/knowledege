import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { parentOf } from '../src/components/SiteNav';
import { blankDoc, blankItem, fromServer, retype, toServer, toText, type QuizDoc } from '../src/lib/quiz-doc';
import { Sortable } from '../src/pages/quiz/Sortable';

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
import { cardId, dueCards, emptyState, merge, recordQuiz, schedule } from '../src/lib/quiz-history';

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
