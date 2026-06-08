interface SelectFilterProps {
  label: string;
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  showLabel?: boolean;
  labelClassName?: string;
}

export function SelectFilter({
  label,
  options,
  value,
  onChange,
  placeholder,
  showLabel = false,
  labelClassName = 'whitespace-nowrap text-xs font-bold uppercase tracking-wide',
}: SelectFilterProps) {
  if (showLabel) {
    return (
      <label className="flex items-center gap-2 rounded-lg border border-metro-border bg-metro-surface px-3 py-1.5 text-sm text-metro-muted">
        <span className={labelClassName}>{label}</span>
        <select
          aria-label={label}
          className="w-full bg-transparent text-metro-text outline-none"
          onChange={(event) => onChange(event.target.value)}
          value={value}
        >
          <option value="">{placeholder ?? 'Todos'}</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <select
      aria-label={label}
      className="rounded-lg border border-metro-border bg-metro-surface px-3 py-1.5 text-sm text-metro-text outline-none focus:border-metro-red"
      onChange={(event) => onChange(event.target.value)}
      value={value}
    >
      <option value="">{placeholder ?? label}</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}
