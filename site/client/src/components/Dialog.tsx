import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';

const FOCUSABLE_PARTS = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
];
const FOCUSABLE = FOCUSABLE_PARTS.join(', ');
const FIRST_ACTION = FOCUSABLE_PARTS.map((part) => `.dialog__actions ${part}`).join(', ');

interface DialogProps {
  title: string;
  /** Escape (and the backdrop) call this; omit it for a dialog that needs an explicit choice. */
  onCancel?: () => void;
  children: ReactNode;
  /** Buttons, in reading order. The first one gets focus when the dialog opens. */
  actions: ReactNode;
}

/**
 * A modal dialog: `role="dialog"` + `aria-modal`, labelled by its title and described by its body,
 * focus moved in on open, trapped while open and restored on close.
 */
export function Dialog({ title, onCancel, children, actions }: DialogProps) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const box = ref.current;
    const first = box?.querySelector<HTMLElement>(FIRST_ACTION) ?? box;
    first?.focus();
    return () => {
      if (previous && previous.isConnected) previous.focus();
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && onCancel) {
      event.stopPropagation();
      onCancel();
      return;
    }
    if (event.key !== 'Tab' || !ref.current) return;
    const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onCancel?.()}>
      <div
        ref={ref}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-body`}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <h2 id={`${id}-title`} className="dialog__title">
          {title}
        </h2>
        <div id={`${id}-body`} className="dialog__body">
          {children}
        </div>
        <div className="dialog__actions">{actions}</div>
      </div>
    </div>
  );
}
