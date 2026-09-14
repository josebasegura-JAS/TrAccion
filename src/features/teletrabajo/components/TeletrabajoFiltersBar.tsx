import { Search } from 'lucide-react';
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
  return (
    <div className="mb-4 grid grid-cols-[minmax(240px,1.35fr)_minmax(150px,0.8fr)_minmax(150px,0.8fr)_minmax(150px,0.8fr)] gap-2.5 overflow-x-auto rounded-2xl border border-metro-border/80 bg-metro-panel/60 p-3 shadow-[0_10px_24px_rgba(2,8,23,0.12)]">
      <label className="flex h-10 items-center gap-2 rounded-xl border border-metro-border bg-metro-surface px-3 text-sm text-metro-muted focus-within:border-metro-red/70">
        <Search size={16} />
        <input
          className="w-full bg-transparent text-metro-text outline-none placeholder:text-metro-muted"
          onChange={(event) => onSetFilter('search', event.target.value)}
          placeholder="Buscar por empleado o nombre..."
          type="search"
          value={filters.search}
        />
      </label>
      <SelectFilter
        showLabel
        label="Estado"
        onChange={(value) => onSetFilter('estado', value as typeof filters.estado)}
        options={TELETRABAJO_ESTADOS}
        value={filters.estado}
      />
      <SelectFilter
        showLabel
        label="Tipo"
        onChange={(value) => onSetFilter('tipoSolicitud', value as typeof filters.tipoSolicitud)}
        options={TELETRABAJO_TIPOS_SOLICITUD}
        value={filters.tipoSolicitud}
      />
      <SelectFilter
        showLabel
        label="Periodo"
        onChange={(value) => onSetFilter('periodo', value)}
        options={periodos}
        value={filters.periodo}
      />
    </div>
  );
}
