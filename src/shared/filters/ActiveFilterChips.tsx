import { X } from 'lucide-react';

export interface ActiveFilterChip {
  key: string;
  label: string;
  value: string;
  onClear: () => void;
}

interface ActiveFilterChipsProps {
  filters: ActiveFilterChip[];
  onClearAll: () => void;
}

export function ActiveFilterChips({ filters, onClearAll }: ActiveFilterChipsProps) {
  if (filters.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-metro-border bg-metro-surface px-3 py-2">
      <span className="text-xs font-bold uppercase tracking-wide text-metro-muted">
        Filtros activos
      </span>
      {filters.map((filter) => (
        <span
          className="inline-flex items-center gap-1.5 rounded-full border border-metro-red/30 bg-metro-red/10 px-2.5 py-1 text-xs font-semibold text-red-100"
          key={filter.key}
        >
          <span className="text-red-200">{filter.label}:</span>
          <span>{filter.value}</span>
          <button
            aria-label={`Quitar filtro ${filter.label}`}
            data-tip={`Quitar filtro ${filter.label}`}
            className="rounded-full p-0.5 text-red-100 hover:bg-metro-red/20 hover:text-white"
            onClick={filter.onClear}
            type="button"
          >
            <X size={12} />
          </button>
        </span>
      ))}
      <button
        className="rounded-full border border-metro-border px-2.5 py-1 text-xs font-semibold text-metro-muted hover:border-metro-red hover:text-metro-text"
        onClick={onClearAll}
        type="button"
      >
        Limpiar todo
      </button>
    </div>
  );
}
