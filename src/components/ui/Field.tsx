import { cloneElement, isValidElement, useId } from 'react';
import type {
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactElement,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export const fieldLabelClass = 'mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-metro-muted';

export type FieldDensity = 'compact' | 'standard';

export const fieldInputClass =
  'w-full rounded-lg border border-metro-border bg-metro-panel/80 px-3 text-sm normal-case text-metro-text outline-none transition focus:border-metro-red focus:bg-metro-surface aria-[invalid=true]:border-red-400/60 aria-[invalid=true]:bg-red-400/[0.07] disabled:cursor-not-allowed disabled:opacity-60';

const fieldDensityClass: Record<FieldDensity, string> = {
  compact: 'h-9',
  standard: 'h-10',
};

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
  density?: FieldDensity;
}

/** Campo de texto estándar de 40 px de altura. */
export function Input({ className, dateTone, density = 'standard', ...props }: InputProps) {
  return (
    <input
      className={cx(fieldInputClass, fieldDensityClass[density], dateTone ? dateInputToneClass[dateTone] : undefined, className)}
      {...props}
    />
  );
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  density?: FieldDensity;
}

/** Área de texto estándar; conserva altura flexible. */
export function Textarea({ className, density = 'standard', ...props }: TextareaProps) {
  return (
    <textarea
      className={cx(
        'w-full rounded-lg border border-metro-border bg-metro-panel/80 px-3 text-sm normal-case text-metro-text outline-none transition focus:border-metro-red focus:bg-metro-surface aria-[invalid=true]:border-red-400/60 aria-[invalid=true]:bg-red-400/[0.07] disabled:cursor-not-allowed disabled:opacity-60',
        density === 'compact' ? 'py-2' : 'py-2.5',
        className,
      )}
      {...props}
    />
  );
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  density?: FieldDensity;
}

/** Selector estándar de 40 px de altura. */
export function Select({ className, density = 'standard', ...props }: SelectProps) {
  return <select className={cx(fieldInputClass, fieldDensityClass[density], className)} {...props} />;
}

interface FieldProps {
  children: ReactNode;
  density?: FieldDensity;
  className?: string;
  error?: ReactNode;
  hint?: ReactNode;
  htmlFor?: string;
  label: ReactNode;
  required?: boolean;
}

/** Agrupa etiqueta, control y ayuda/error con espaciado uniforme y asociación accesible. */
export function Field({
  children,
  className,
  density = 'standard',
  error,
  hint,
  htmlFor,
  label,
  required,
}: FieldProps) {
  const generatedId = useId().replace(/:/g, '');
  const controlId = htmlFor ?? `field-${generatedId}`;
  const errorId = `${controlId}-error`;
  const hintId = `${controlId}-hint`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  const isSharedControl =
    isValidElement(children) &&
    (children.type === Input || children.type === Select || children.type === Textarea);

  const control = isSharedControl
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        id: (children.props as { id?: string }).id ?? controlId,
        density: (children.props as { density?: FieldDensity }).density ?? density,
        required: (children.props as { required?: boolean }).required ?? required,
        'aria-invalid': error ? true : (children.props as { 'aria-invalid'?: boolean | 'true' | 'false' })['aria-invalid'],
        'aria-describedby': [
          (children.props as { 'aria-describedby'?: string })['aria-describedby'],
          describedBy,
        ].filter(Boolean).join(' ') || undefined,
      })
    : children;

  return (
    <div className={cx(density === 'compact' ? 'space-y-0.5' : 'space-y-1', className)}>
      <FieldLabel className="mb-0" htmlFor={controlId}>
        {label}
        {required ? <span className="ml-1 text-metro-red" aria-hidden="true">*</span> : null}
      </FieldLabel>
      {control}
      {error ? (
        <p id={errorId} className="text-xs font-semibold text-red-300" role="alert">{error}</p>
      ) : null}
      {!error && hint ? <p id={hintId} className="text-xs leading-4 text-metro-muted">{hint}</p> : null}
    </div>
  );
}

export function ReadonlyValue({ children, className, density = 'standard' }: { children: ReactNode; className?: string; density?: FieldDensity }) {
  return (
    <div
      className={cx(
        'flex items-center rounded-lg border border-metro-border bg-metro-panel/85 px-3 text-sm text-metro-text',
        density === 'compact' ? 'min-h-9' : 'min-h-10',
        className,
      )}
    >
      {children}
    </div>
  );
}
