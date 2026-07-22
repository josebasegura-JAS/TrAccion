import { Search, X } from 'lucide-react';
import type { InputHTMLAttributes } from 'react';

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

interface SearchFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Permite limpiar el valor desde el propio control cuando está informado. */
  onClear?: () => void;
  wrapperClassName?: string;
}

/** Buscador estándar de 36 px para barras de herramientas. */
export function SearchField({
  className,
  onClear,
  value,
  wrapperClassName,
  ...props
}: SearchFieldProps) {
  const hasValue = typeof value === 'string' ? value.length > 0 : value != null;

  return (
    <div
      className={cx(
        'relative h-9 min-w-[280px] flex-1 rounded-lg border border-metro-border bg-metro-surface',
        'focus-within:border-metro-red',
        wrapperClassName,
      )}
    >
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-metro-muted"
        size={15}
      />
      <input
        className={cx(
          'h-full w-full rounded-lg bg-transparent pl-9 pr-3 text-sm text-metro-text outline-none placeholder:text-metro-muted',
          onClear && hasValue && 'pr-9',
          className,
        )}
        type="search"
        value={value}
        {...props}
      />
      {onClear && hasValue ? (
        <button
          aria-label="Limpiar búsqueda"
          className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-metro-muted transition hover:bg-metro-panel hover:text-metro-text"
          onClick={onClear}
          type="button"
        >
          <X size={13} />
        </button>
      ) : null}
    </div>
  );
}
