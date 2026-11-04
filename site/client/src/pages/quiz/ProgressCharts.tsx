// The progress page's charts: plain SVG drawn at the container's pixel width (so text keeps its
// size), one hue (--viz-1), hairline grid, a hover/keyboard readout, and a table view for each.
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode, type RefObject } from 'react';
import type { DayCount, QuizArea, TrendPoint } from '../../lib/progress-stats';

function useWidth<T extends HTMLElement>(fallback = 640): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setWidth(Math.round(el.getBoundingClientRect().width) || fallback);
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, [fallback]);
  return [ref, width];
}

const shortDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const weekday = (ms: number) => new Date(ms).toLocaleDateString(undefined, { weekday: 'short' });

/** Arrow keys move the readout like the pointer does; Escape hides it. */
function keyNav(n: number, active: number | null, set: (i: number | null) => void) {
  return (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const step = e.key === 'ArrowRight' ? 1 : -1;
      set(Math.min(n - 1, Math.max(0, (active ?? (step > 0 ? -1 : n)) + step)));
    } else if (e.key === 'Home') set(0);
    else if (e.key === 'End') set(n - 1);
    else if (e.key === 'Escape') set(null);
  };
}

/** Snap a pointer x to the nearest of n evenly spaced positions. */
function nearest(e: PointerEvent<SVGSVGElement>, left: number, inner: number, n: number, centred: boolean): number {
  const px = e.clientX - e.currentTarget.getBoundingClientRect().left - left;
  const i = centred ? Math.floor((px / inner) * n) : Math.round((px / inner) * (n - 1));
  return Math.min(n - 1, Math.max(0, i));
}

function Tip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  // Keep the box inside the chart: centred on x, nudged in near the edges.
  const left = Math.min(Math.max(x, 80), width - 80);
  return (
    <div className="viz__tip" style={{ left, top: y }} aria-live="polite">
      {children}
    </div>
  );
}

// -- accuracy over time: a line --------------------------------------------------------------
export function TrendChart({ points }: { points: TrendPoint[] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const H = 220;
  const m = { l: 40, r: 48, t: 16, b: 30 };
  const w = Math.max(width, 260);
  const iw = w - m.l - m.r;
  const ih = H - m.t - m.b;
  const n = points.length;
  const x = (i: number) => m.l + (n === 1 ? iw / 2 : (i * iw) / (n - 1));
  const y = (v: number) => m.t + ih - (v / 100) * ih;
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.pct).toFixed(1)}`).join('');
  const area = `${path}L${x(n - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z`;
  const last = points[n - 1]!;
  const a = active === null ? null : points[active]!;

  return (
    <div className="viz" ref={ref}>
      <svg
        width={w}
        height={H}
        role="img"
        aria-label={`Accuracy in your last ${n} quizzes, from ${points[0]!.pct}% to ${last.pct}%. Use the arrow keys to read each quiz.`}
        tabIndex={0}
        onPointerMove={(e) => setActive(nearest(e, m.l, iw, n, false))}
        onPointerLeave={() => setActive(null)}
        onKeyDown={keyNav(n, active, setActive)}
        onBlur={() => setActive(null)}
      >
        {[0, 25, 50, 75, 100].map((t) => (
          <g key={t}>
            <line className="viz__grid" x1={m.l} x2={w - m.r} y1={y(t)} y2={y(t)} />
            <text className="viz__tick" x={m.l - 8} y={y(t)} dy="0.32em" textAnchor="end">
              {t}%
            </text>
          </g>
        ))}
        <path className="viz__area" d={area} />
        <path className="viz__line" d={path} />
        {a && <line className="viz__cross" x1={x(active!)} x2={x(active!)} y1={m.t} y2={y(0)} />}
        {a && <circle className="viz__dot" cx={x(active!)} cy={y(a.pct)} r={5} />}
        <circle className="viz__dot" cx={x(n - 1)} cy={y(last.pct)} r={5} />
        <text className="viz__label" x={x(n - 1) + 10} y={y(last.pct)} dy="0.32em">
          {last.pct}%
        </text>
        <text className="viz__tick" x={m.l} y={H - 8}>
          {shortDate(points[0]!.at)}
        </text>
        {n > 1 && (
          <text className="viz__tick" x={w - m.r} y={H - 8} textAnchor="end">
            {shortDate(last.at)}
          </text>
        )}
      </svg>
      {a && (
        <Tip x={x(active!)} y={y(a.pct) - 12} width={w}>
          <strong>{a.pct}%</strong> <span>
            {a.correct} of {a.total} right
          </span>
          <span className="viz__tip-sub">
            {a.title} · {shortDate(a.at)}
          </span>
        </Tip>
      )}
    </div>
  );
}

// -- reviews due in the next days: columns ---------------------------------------------------
function niceMax(v: number): number {
  if (v <= 4) return Math.max(v, 1);
  const pow = 10 ** Math.floor(Math.log10(v));
  const f = v / pow;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow;
}

/** A column with a 4px rounded top and a square foot on the baseline. */
function column(x: number, top: number, base: number, width: number): string {
  const r = Math.min(4, width / 2, base - top);
  return `M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${x + width - r}Q${x + width},${top} ${x + width},${top + r}V${base}Z`;
}

export function ForecastChart({ days }: { days: DayCount[] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const H = 200;
  const m = { l: 32, r: 8, t: 22, b: 30 };
  const w = Math.max(width, 260);
  const iw = w - m.l - m.r;
  const ih = H - m.t - m.b;
  const n = days.length;
  const slot = iw / n;
  const bw = Math.min(24, slot * 0.62);
  const top = niceMax(Math.max(...days.map((d) => d.count)));
  const ticks = top <= 4 ? Array.from({ length: top + 1 }, (_, i) => i) : [0, top / 2, top];
  const y = (v: number) => m.t + ih - (v / top) * ih;
  const cx = (i: number) => m.l + slot * i + slot / 2;
  const peak = days.reduce((best, d, i) => (d.count > days[best]!.count ? i : best), 0);
  const every = slot >= 34 ? 1 : 2;
  const label = (d: DayCount, i: number) => (i === 0 ? 'Today' : weekday(d.at));
  const a = active === null ? null : days[active]!;
  const total = days.reduce((s, d) => s + d.count, 0);

  return (
    <div className="viz" ref={ref}>
      <svg
        width={w}
        height={H}
        role="img"
        aria-label={`${total} reviews due over the next ${n} days, ${days[0]!.count} of them today. Use the arrow keys to read each day.`}
        tabIndex={0}
        onPointerMove={(e) => setActive(nearest(e, m.l, iw, n, true))}
        onPointerLeave={() => setActive(null)}
        onKeyDown={keyNav(n, active, setActive)}
        onBlur={() => setActive(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line className="viz__grid" x1={m.l} x2={w - m.r} y1={y(t)} y2={y(t)} />
            <text className="viz__tick" x={m.l - 8} y={y(t)} dy="0.32em" textAnchor="end">
              {t}
            </text>
          </g>
        ))}
        {days.map((d, i) =>
          d.count > 0 ? (
            <path
              key={d.day}
              className={`viz__col${active === i ? ' is-active' : ''}`}
              d={column(cx(i) - bw / 2, y(d.count), y(0), bw)}
            />
          ) : null,
        )}
        {[0, peak]
          .filter((i, k, all) => days[i]!.count > 0 && all.indexOf(i) === k)
          .map((i) => (
            <text key={i} className="viz__label" x={cx(i)} y={y(days[i]!.count) - 6} textAnchor="middle">
              {days[i]!.count}
            </text>
          ))}
        {days.map((d, i) =>
          i % every === 0 ? (
            <text key={d.day} className="viz__tick" x={cx(i)} y={H - 10} textAnchor="middle">
              {label(d, i)}
            </text>
          ) : null,
        )}
      </svg>
      {a && (
        <Tip x={cx(active!)} y={y(a.count) - 10} width={w}>
          <strong>
            {a.count} {a.count === 1 ? 'card' : 'cards'}
          </strong>
          <span className="viz__tip-sub">
            {active === 0 ? 'today (overdue included)' : new Date(a.at).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}
          </span>
        </Tip>
      )}
    </div>
  );
}

// -- quizzes ranked from weakest: horizontal bars ----------------------------------------------
export function AreaBars({ areas }: { areas: QuizArea[] }) {
  return (
    <ul className="viz-bars" aria-label="Accuracy per quiz, weakest first">
      {areas.map((a) => (
        <li key={a.title} className="viz-bars__row">
          <span className="viz-bars__name">{a.title}</span>
          <span className="viz-bars__line">
            <span className="viz-bars__bar" style={{ width: `calc((100% - 52px) * ${Math.max(a.pct, 1) / 100})` }} />
            <span className="viz-bars__value">{a.pct}%</span>
          </span>
          <span className="muted small">
            {a.correct} of {a.total} right · {a.plays} {a.plays === 1 ? 'play' : 'plays'}
          </span>
        </li>
      ))}
    </ul>
  );
}
