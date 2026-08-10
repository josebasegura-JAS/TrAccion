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

export const fieldLabelClass = 'block text-xs font-semibold text-metro-muted';

export const fieldInputClass =
  'mt-1 h-9 w-full rounded-lg border border-metro-border bg-metro-surface px-3 text-sm normal-case text-metro-text outline-none transition focus:border-metro-red required:border-red-400/45 required:bg-red-400/[0.07] disabled:cursor-not-allowed disabled:opacity-60';

interface FieldLabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  children: ReactNode;
}

/** Etiqueta estándar de formulario. */
export function FieldLabel({ children, className, ...props }: FieldLabelProps) {
  return (
    <label className={cx(fieldLabelClass, className)} {...props}>
      {children}
    </label>
  );
}

export type DateInputTone = 'request' | 'start' | 'end';

const dateInputToneClass: Record<DateInputTone, string> = {
  request: '!border-sky-400/45 !bg-sky-400/10 focus:!border-sky-300',
  start: '!border-emerald-400/45 !bg-emerald-400/10 focus:!border-emerald-300',
  end: '!border-amber-400/45 !bg-amber-400/10 focus:!border-amber-300',
};

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /**
   * Tinte semántico para fechas de formulario: solicitud/registro, inicio/desde y fin/hasta.
   * Se usa únicamente cuando el significado de la fecha es inequívoco.
   */
  dateTone?: DateInputTone;
}

/** Campo de texto estándar de 36 px de altura. */
export function Input({ className, dateTone, ...props }: InputProps) {
  return (
    <input
      className={cx(fieldInputClass, dateTone ? dateInputToneClass[dateTone] : undefined, className)}
      {...props}
    />
  );
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

/** Área de texto estándar; conserva altura flexible. */
export function Textarea({ className, ...props }: TextareaProps) {
  return (
    <textarea
      className={cx(
        'mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm normal-case text-metro-text outline-none transition focus:border-metro-red required:border-red-400/45 required:bg-red-400/[0.07] disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...props}
    />
  );
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

/** Selector estándar de 36 px de altura. */
export function Select({ className, ...props }: SelectProps) {
  return <select className={cx(fieldInputClass, className)} {...props} />;
}

interface FieldProps {
  children: ReactNode;
  className?: string;
  error?: ReactNode;
  hint?: ReactNode;
  htmlFor?: string;
  label: ReactNode;
  required?: boolean;
}

/** Agrupa etiqueta, control y ayuda/error con espaciado uniforme. */
export function Field({ children, className, error, hint, htmlFor, label, required }: FieldProps) {
  return (
    <div className={className}>
      <FieldLabel htmlFor={htmlFor}>
        {label}
        {required ? <span className="ml-1 text-metro-red" aria-hidden="true">*</span> : null}
      </FieldLabel>
      {children}
      {error ? <p className="mt-1 text-xs font-semibold text-red-300">{error}</p> : null}
      {!error && hint ? <p className="mt-1 text-xs leading-4 text-metro-muted">{hint}</p> : null}
    </div>
  );
}

export function ReadonlyValue({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        'mt-1 flex min-h-9 items-center rounded-lg border border-metro-border bg-metro-panel px-3 text-sm text-metro-text',
        className,
      )}
    >
      {children}
    </div>
  );
}
