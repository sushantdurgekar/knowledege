import { useId, type InputHTMLAttributes, type ReactNode } from 'react';

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  hint?: ReactNode;
}

/** A labelled input with an optional hint (linked through aria-describedby). */
export function TextField({ label, hint, ...input }: TextFieldProps) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} aria-describedby={hint ? `${id}-hint` : undefined} {...input} />
      {hint && (
        <p id={`${id}-hint`} className="field__hint">
          {hint}
        </p>
      )}
    </div>
  );
}

/** Error (role=alert) or confirmation (role=status) under a form. */
export function FormMessage({ tone, children }: { tone: 'error' | 'success' | 'info'; children: ReactNode }) {
  return (
    <div className={`form-message form-message--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

/** A busy line for multi-step work ("Saving this browser's progress…"). */
export function BusyLine({ children }: { children: ReactNode }) {
  return (
    <p className="busy-line" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      {children}
    </p>
  );
}
