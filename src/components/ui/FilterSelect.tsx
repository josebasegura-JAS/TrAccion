import type { SelectHTMLAttributes } from 'react';

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export interface FilterSelectOption {
  label: string;
  value: string;
}

interface FilterSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: readonly (string | FilterSelectOption)[];
  /** Texto de la opción vacía. Omitir para no añadirla. */
  allLabel?: string;
  wrapperClassName?: string;
}

/** Selector estándar de 36 px para filtros de listados. */
export function FilterSelect({
  allLabel,
  className,
  options,
  wrapperClassName,
  ...props
}: FilterSelectProps) {
  return (
    <div className={cx('h-10 w-44 shrink-0', wrapperClassName)}>
      <select
        className={cx(
          'h-full w-full rounded-xl border border-metro-border bg-metro-surface/80 px-3 text-sm font-medium text-metro-text outline-none transition hover:border-slate-500 focus:border-metro-red',
          className,
        )}
        {...props}
      >
        {allLabel !== undefined ? <option value="">{allLabel}</option> : null}
        {options.map((option) => {
          const resolved = typeof option === 'string' ? { label: option, value: option } : option;
          return (
            <option key={resolved.value} value={resolved.value}>
              {resolved.label}
            </option>
          );
        })}
      </select>
    </div>
  );
}
