import { Search } from 'lucide-react';
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

interface ToolbarProps {
  children: ReactNode;
  className?: string;
}

/** Compact, single-row module toolbar. It scrolls horizontally only when the viewport is too narrow. */
export function Toolbar({ children, className }: ToolbarProps) {
  return (
    <div
      className={cx(
        'flex min-w-0 flex-1 flex-nowrap items-center justify-end gap-2 overflow-x-auto pb-0.5',
        className,
      )}
    >
      {children}
    </div>
  );
}

interface SearchFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  containerClassName?: string;
}

/** Standard compact search control used in module toolbars. */
export function SearchField({ className, containerClassName, ...props }: SearchFieldProps) {
  return (
    <label
      className={cx(
        'flex h-9 min-w-[280px] flex-1 items-center gap-2 rounded-lg border border-metro-border bg-metro-panel px-3 text-sm text-metro-muted focus-within:border-metro-red',
        containerClassName,
      )}
    >
      <Search className="shrink-0" size={15} />
      <input
        className={cx(
          'min-w-0 flex-1 bg-transparent text-metro-text outline-none placeholder:text-metro-muted',
          className,
        )}
        type="search"
        {...props}
      />
    </label>
  );
}

interface FilterSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  children: ReactNode;
  containerClassName?: string;
}

/** Standard compact select used in module toolbars. */
export function FilterSelect({
  children,
  className,
  containerClassName,
  label,
  ...props
}: FilterSelectProps) {
  return (
    <div className={cx('w-44 shrink-0', containerClassName)}>
      <select
        aria-label={label}
        className={cx(
          'h-9 w-full rounded-lg border border-metro-border bg-metro-surface px-3 text-sm text-metro-text outline-none focus:border-metro-red',
          className,
        )}
        {...props}
      >
        {children}
      </select>
    </div>
  );
}
