import type { Calibration as Cal } from '../../lib/quiz';

/** Confidence vs result. Sure-and-wrong answers are the ones to fix first. */
export function Calibration({ c }: { c: Cal }) {
  const total = c.sureRight + c.sureWrong + c.unsureRight + c.unsureWrong;
  if (!total) return null;
  const cell = (n: number, label: string, note: string, tone: string) => (
    <div className={`calib__cell calib__cell--${tone}`}>
      <strong className="calib__n">{n}</strong>
      <span className="calib__label">{label}</span>
      <span className="calib__note">{note}</span>
    </div>
  );
  return (
    <section className="calib" aria-label="How well you judged your own answers">
      <h2>How well did you judge yourself?</h2>
      <div className="calib__grid">
        {cell(c.sureRight, 'Sure and right', 'Solid knowledge', 'good')}
        {cell(c.sureWrong, 'Sure but wrong', 'Fix these first: a wrong idea you trust', 'bad')}
        {cell(c.unsureRight, 'Unsure but right', 'Fragile: review to make it stick', 'info')}
        {cell(c.unsureWrong, 'Unsure and wrong', 'A gap: study it', 'trap')}
      </div>
    </section>
  );
}
