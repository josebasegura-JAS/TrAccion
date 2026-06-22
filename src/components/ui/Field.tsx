import type {
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export const fieldLabelClass = 'block text-xs font-semibold uppercase tracking-wide text-metro-muted';

export const fieldInputClass =
  'mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm normal-case text-metro-text outline-none focus:border-metro-red';

interface FieldLabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  children: ReactNode;
}

/** Standard field label: uppercase, muted, small. Use above an Input/Select/Textarea. */
export function FieldLabel({ children, className, ...props }: FieldLabelProps) {
  return (
    <label className={cx(fieldLabelClass, className)} {...props}>
      {children}
    </label>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement>;

/** Standard text input matching the app's form styling. */
export function Input({ className, ...props }: InputProps) {
  return <input className={cx(fieldInputClass, className)} {...props} />;
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

/** Standard textarea matching the app's form styling. */
export function Textarea({ className, ...props }: TextareaProps) {
  return <textarea className={cx(fieldInputClass, className)} {...props} />;
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

/** Standard select matching the app's form styling. */
export function Select({ className, ...props }: SelectProps) {
  return <select className={cx(fieldInputClass, className)} {...props} />;
}

interface FieldProps {
  children: ReactNode;
  className?: string;
  htmlFor?: string;
  label: ReactNode;
}

/** Wraps a label + control together. Use when you don't need to customize the control directly. */
export function Field({ children, className, htmlFor, label }: FieldProps) {
  return (
    <div className={className}>
      <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel>
      {children}
    </div>
  );
}
