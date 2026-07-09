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
    <div className="mb-3 grid grid-cols-[minmax(200px,1.3fr)_minmax(130px,0.8fr)_minmax(130px,0.8fr)_minmax(130px,0.8fr)] gap-2 overflow-x-auto rounded-xl border border-metro-border bg-metro-panel p-2">
      <label className="flex items-center gap-2 rounded-lg border border-metro-border bg-metro-surface px-3 py-1.5 text-sm text-metro-muted">
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
