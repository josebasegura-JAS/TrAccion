import { Search, X } from 'lucide-react';
import { SelectFilter } from '../../../shared/filters/SelectFilter';
import type { TeletrabajoFilters } from '../domain/filters';
import { TELETRABAJO_ESTADOS, TELETRABAJO_TIPOS_SOLICITUD } from '../domain/solicitud';

interface TeletrabajoFiltersBarProps {
  filters: TeletrabajoFilters;
  periodos: string[];
  onSetFilter: <K extends keyof TeletrabajoFilters>(key: K, value: TeletrabajoFilters[K]) => void;
}

export function TeletrabajoFiltersBar({
  filters,
  periodos,
  onSetFilter,
}: TeletrabajoFiltersBarProps) {
  const hasActiveFilters = Boolean(
    filters.search || filters.estado || filters.tipoSolicitud || filters.periodo,
  );

  const clearFilters = () => {
    onSetFilter('search', '');
    onSetFilter('estado', '');
    onSetFilter('tipoSolicitud', '');
    onSetFilter('periodo', '');
  };

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-metro-border/75 bg-metro-panel/45 p-2">
      <label className="flex h-9 min-w-[260px] flex-1 items-center gap-2 rounded-lg border border-metro-border bg-metro-surface px-3 text-sm text-metro-muted focus-within:border-metro-red/70">
        <Search aria-hidden="true" size={15} />
        <input
          className="min-w-0 flex-1 bg-transparent text-metro-text outline-none placeholder:text-metro-muted"
          onChange={(event) => onSetFilter('search', event.target.value)}
          placeholder="Buscar empleado o nombre…"
          type="search"
          value={filters.search}
        />
      </label>

      <SelectFilter
        className="h-9 min-w-[138px] rounded-lg border border-metro-border bg-metro-surface px-2.5 text-sm text-metro-text outline-none focus:border-metro-red"
        label="Estado"
        onChange={(value) => onSetFilter('estado', value as typeof filters.estado)}
        options={TELETRABAJO_ESTADOS}
        placeholder="Estado"
        value={filters.estado}
      />
      <SelectFilter
        className="h-9 min-w-[145px] rounded-lg border border-metro-border bg-metro-surface px-2.5 text-sm text-metro-text outline-none focus:border-metro-red"
        label="Tipo"
        onChange={(value) => onSetFilter('tipoSolicitud', value as typeof filters.tipoSolicitud)}
        options={TELETRABAJO_TIPOS_SOLICITUD}
        placeholder="Tipo"
        value={filters.tipoSolicitud}
      />
      <SelectFilter
        className="h-9 min-w-[132px] rounded-lg border border-metro-border bg-metro-surface px-2.5 text-sm text-metro-text outline-none focus:border-metro-red"
        label="Periodo"
        onChange={(value) => onSetFilter('periodo', value)}
        options={periodos}
        placeholder="Periodo"
        value={filters.periodo}
      />

      {hasActiveFilters ? (
        <button
          className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-metro-muted transition hover:bg-metro-raised hover:text-metro-text"
          onClick={clearFilters}
          type="button"
        >
          <X aria-hidden="true" size={14} />
          Limpiar
        </button>
      ) : null}
    </div>
  );
}
