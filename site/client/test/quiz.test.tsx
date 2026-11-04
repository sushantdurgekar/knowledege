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
