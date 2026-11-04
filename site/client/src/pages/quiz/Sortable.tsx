import { useRef, useState, type PointerEvent, type ReactNode } from 'react';

/**
 * A drag-to-reorder list for "put in order" and "match the following".
 *
 * `order[k]` is the index (into `labels`) of the chip shown at row k. Rows can carry a fixed
 * prefix (`rowLabel(k)`: a number, or the left-hand item of a match) that does not move.
 * Dragging works with mouse, pen and touch (pointer events); every chip also has Move up /
 * Move down buttons for keyboard and screen-reader users.
 */
export function Sortable({
  labels,
  order,
  onChange,
  rowLabel,
  disabled = false,
  marks,
  label,
  onSelect,
  selected,
  narrow = false,
}: {
  labels: string[];
  order: number[];
  onChange: (next: number[]) => void;
  rowLabel?: (row: number) => ReactNode;
  disabled?: boolean;
  /** Per row after a reveal: true = right, false = wrong. */
  marks?: (boolean | null)[];
  label: string;
  /** Click (without dragging) on a chip: e.g. open that item in the editor. */
  onSelect?: (chip: number) => void;
  selected?: number;
  /** Short row labels (numbers): keep that column narrow. */
  narrow?: boolean;
}) {
  const [dragging, setDragging] = useState<number | null>(null);
  const [announce, setAnnounce] = useState('');
  const list = useRef<HTMLOListElement>(null);
  const drag = useRef<{ row: number; centers: number[]; pointer: number; moved: boolean } | null>(null);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length || from === to) return;
    const next = [...order];
    const [chip] = next.splice(from, 1);
    next.splice(to, 0, chip!);
    onChange(next);
    setAnnounce(`${labels[chip!]} moved to position ${to + 1} of ${order.length}`);
  };

  const onPointerDown = (row: number) => (event: PointerEvent<HTMLDivElement>) => {
    if (disabled || (event.target as HTMLElement).closest('button')) return;
    const rows = Array.from(list.current?.querySelectorAll<HTMLElement>('[data-chip]') ?? []);
    drag.current = {
      row,
      moved: false,
      pointer: event.pointerId,
      centers: rows.map((el) => {
        const r = el.getBoundingClientRect();
        return r.top + r.height / 2;
      }),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(row);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointer !== event.pointerId) return;
    // The row whose centre the pointer passed: count the other rows' centres above it.
    let target = 0;
    d.centers.forEach((c, i) => {
      if (i !== d.row && event.clientY > c) target += 1;
    });
    if (target !== d.row) {
      d.moved = true;
      move(d.row, target);
      d.row = target;
      setDragging(target);
    }
  };

  const end = () => {
    const d = drag.current;
    if (d && !d.moved && onSelect) onSelect(order[d.row]!);
    drag.current = null;
    setDragging(null);
  };

  return (
    <div className={`sortable${narrow ? ' sortable--narrow' : ''}`}>
      <ol ref={list} className="sortable__list" aria-label={label}>
        {order.map((chip, row) => (
          <li
            key={chip}
            className={`sortable__row${marks && marks[row] === true ? ' is-right' : ''}${marks && marks[row] === false ? ' is-wrong' : ''}`}
          >
            {rowLabel && <span className="sortable__fixed">{rowLabel(row)}</span>}
            <div
              data-chip
              className={`sortable__chip${dragging === row ? ' is-dragging' : ''}${disabled ? ' is-disabled' : ''}${selected === chip ? ' is-selected' : ''}`}
              aria-current={selected === chip ? 'true' : undefined}
              tabIndex={onSelect ? 0 : undefined}
              onKeyDown={onSelect ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.target === e.currentTarget) && (e.preventDefault(), onSelect(chip)) : undefined}
              onPointerDown={onPointerDown(row)}
              onPointerMove={onPointerMove}
              onPointerUp={end}
              onPointerCancel={end}
            >
              {!disabled && (
                <span className="sortable__grip" aria-hidden="true">
                  ⋮⋮
                </span>
              )}
              <span className="sortable__text">{labels[chip]}</span>
              {!disabled && (
                <span className="sortable__buttons">
                  <button type="button" aria-label={`Move ${labels[chip]} up`} disabled={row === 0} onClick={() => move(row, row - 1)}>
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${labels[chip]} down`}
                    disabled={row === order.length - 1}
                    onClick={() => move(row, row + 1)}
                  >
                    ↓
                  </button>
                </span>
              )}
            </div>
          </li>
        ))}
      </ol>
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
    </div>
  );
}
