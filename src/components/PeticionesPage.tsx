import { ChevronDown, ChevronRight, Plus, Search, SlidersHorizontal } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { filterPeticiones } from '../features/peticiones/domain/filters';
import {
  groupHistoricPeticiones,
  type PeticionHistoricSortKey,
  type PeticionHistoricSortState,
} from '../features/peticiones/domain/historico';
import {
  sortPeticionesByColumn,
  sortPeticionesByDefault,
  type PeticionSortKey,
  type SortDirection,
} from '../features/peticiones/domain/sort';
import {
  PETICION_PRIORITIES,
  PETICION_STATES,
  type Peticion,
} from '../features/peticiones/domain/peticion';
import { usePeticionStore } from '../features/peticiones/store/usePeticionStore';
import { PeticionEditor } from './PeticionEditor';

interface SortState {
  key: PeticionSortKey;
  direction: SortDirection;
}

const sortableColumns: Array<{ key: PeticionSortKey; label: string; className: string }> = [
  { key: 'titulo', label: 'Título', className: 'w-[220px]' },
  { key: 'estado', label: 'Estado', className: 'w-[115px]' },
  { key: 'prioridad', label: 'Prioridad', className: 'w-[105px]' },
  { key: 'fechaLimite', label: 'Fecha límite', className: 'w-[120px]' },
  { key: 'solicitante', label: 'Solicitante', className: 'w-[150px]' },
  { key: 'sindicato', label: 'Sindicato', className: 'w-[155px]' },
];

const historicColumns: Array<{ key: PeticionHistoricSortKey; label: string; className: string }> = [
  { key: 'titulo', label: 'Título', className: 'w-[320px]' },
  { key: 'closedAt', label: 'Fecha cierre', className: 'w-[150px]' },
  { key: 'solicitante', label: 'Solicitante', className: 'w-[190px]' },
  { key: 'prioridad', label: 'Prioridad', className: 'w-[120px]' },
];

function formatDateTime(value: string | null): string {
  if (!value) {
    return '—';
  }

  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function PeticionesPage() {
  const { filters, load, peticiones, remove, selectPeticion, setFilter } = usePeticionStore();
  const [editorMode, setEditorMode] = useState<'create' | 'edit' | null>(null);
  const [editingPeticionId, setEditingPeticionId] = useState<string | null>(null);
  const [sortState, setSortState] = useState<SortState | null>(null);
  const [historicSortState, setHistoricSortState] = useState<PeticionHistoricSortState>({
    key: 'closedAt',
    direction: 'desc',
  });
  const [isHistoricOpen, setIsHistoricOpen] = useState(false);
  const [openYears, setOpenYears] = useState<Record<string, boolean>>({});

  useEffect(() => {
    load();
  }, [load]);

  const visiblePeticiones = useMemo(
    () => peticiones.filter((peticion) => !peticion.deletedAt),
    [peticiones],
  );
  const filteredPeticiones = useMemo(
    () => filterPeticiones(peticiones, filters),
    [filters, peticiones],
  );
  const sortedPeticiones = useMemo(() => {
    if (!sortState) {
      return sortPeticionesByDefault(filteredPeticiones);
    }

    return sortPeticionesByColumn(filteredPeticiones, sortState.key, sortState.direction);
  }, [filteredPeticiones, sortState]);
  const historicPeticiones = useMemo(
    () => visiblePeticiones.filter((peticion) => peticion.estado === 'cerrada'),
    [visiblePeticiones],
  );
  const historicGroups = useMemo(
    () => groupHistoricPeticiones(historicPeticiones, historicSortState),
    [historicPeticiones, historicSortState],
  );

  const editorPeticion =
    editorMode === 'edit'
      ? (visiblePeticiones.find((peticion) => peticion.id === editingPeticionId) ?? null)
      : null;

  const openEditor = (peticion: Peticion) => {
    selectPeticion(peticion.id);
    setEditingPeticionId(peticion.id);
    setEditorMode('edit');
  };

  const openCreateEditor = () => {
    setEditingPeticionId(null);
    setEditorMode('create');
  };

  const closeEditor = () => {
    setEditorMode(null);
    setEditingPeticionId(null);
  };

  const toggleSort = (key: PeticionSortKey) => {
    setSortState((current) => ({
      key,
      direction: current?.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const toggleHistoricSort = (key: PeticionHistoricSortKey) => {
    setHistoricSortState((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const toggleHistoricYear = (year: string) => {
    setOpenYears((current) => ({ ...current, [year]: !current[year] }));
  };

  return (
    <section
      className="rounded-2xl border border-metro-border bg-white p-4 shadow-card"
      id="peticiones"
    >
      <div className="mb-3 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-metro-red">Módulo</p>
          <h2 className="text-2xl font-bold text-metro-text">Peticiones</h2>
          <p className="mt-0.5 text-base text-metro-muted">
            Listado de peticiones con alta manual, edición, borrado lógico, búsqueda y filtros.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="inline-flex items-center gap-2 rounded-xl bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark"
            onClick={openCreateEditor}
            type="button"
          >
            <Plus size={16} /> Nueva petición
          </button>
        </div>
      </div>

      <div className="mb-3 grid gap-2 rounded-xl border border-metro-border bg-metro-surface p-2 lg:grid-cols-[minmax(220px,1.2fr)_minmax(150px,0.8fr)_minmax(150px,0.8fr)]">
        <label className="flex items-center gap-2 rounded-lg border border-metro-border bg-white px-3 py-1.5 text-sm text-metro-muted">
          <Search size={16} />
          <input
            className="w-full bg-transparent text-metro-text outline-none placeholder:text-metro-muted"
            onChange={(event) => setFilter('search', event.target.value)}
            placeholder="Buscar por título o descripción..."
            type="search"
            value={filters.search}
          />
        </label>
        <SelectFilter
          label="Estado"
          onChange={(value) => setFilter('estado', value as typeof filters.estado)}
          options={PETICION_STATES.filter((estado) => estado !== 'cerrada')}
          value={filters.estado}
        />
        <SelectFilter
          label="Prioridad"
          onChange={(value) => setFilter('prioridad', value as typeof filters.prioridad)}
          options={PETICION_PRIORITIES}
          value={filters.prioridad}
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-metro-border">
        <div className="flex items-center justify-between border-b border-metro-border bg-white px-3 py-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-metro-text">
            <SlidersHorizontal size={16} className="text-metro-red" /> Peticiones
          </div>
          <span className="rounded-full bg-metro-red/10 px-3 py-1 text-xs font-bold text-metro-dark">
            {filteredPeticiones.length} registros
          </span>
        </div>
        <div className="max-h-[460px] overflow-auto">
          <table className="min-w-[970px] table-fixed text-left text-xs">
            <thead className="sticky top-0 z-10 bg-[#F9FAFB] text-[11px] uppercase tracking-wide text-metro-muted">
              <tr>
                {sortableColumns.map((column) => {
                  const isActive = sortState?.key === column.key;

                  return (
                    <th className={`${column.className} px-3 py-2`} key={column.key}>
                      <button
                        className="flex w-full items-center gap-1 text-left font-bold uppercase tracking-wide hover:text-metro-text"
                        onClick={() => toggleSort(column.key)}
                        type="button"
                      >
                        <span>{column.label}</span>
                        {isActive && <span>{sortState.direction === 'asc' ? '↑' : '↓'}</span>}
                      </button>
                    </th>
                  );
                })}
                <th className="w-[100px] px-3 py-2 text-right font-bold uppercase tracking-wide">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-metro-border bg-white">
              {sortedPeticiones.length === 0 && (
                <tr>
                  <td className="px-3 py-4 text-center text-sm text-metro-muted" colSpan={7}>
                    No hay peticiones activas con los filtros actuales.
                  </td>
                </tr>
              )}
              {sortedPeticiones.map((peticion) => (
                <tr
                  className="cursor-pointer hover:bg-red-50/50"
                  key={peticion.id}
                  onClick={() => openEditor(peticion)}
                >
                  <td
                    className="truncate px-3 py-1.5 font-semibold text-metro-text"
                    title={peticion.titulo}
                  >
                    {peticion.titulo}
                  </td>
                  <td className="truncate px-3 py-1.5 text-metro-muted" title={peticion.estado}>
                    {peticion.estado}
                  </td>
                  <td className="truncate px-3 py-1.5 text-metro-muted" title={peticion.prioridad}>
                    {peticion.prioridad}
                  </td>
                  <td
                    className="truncate px-3 py-1.5 text-metro-muted"
                    title={peticion.fechaLimite || 'Sin fecha'}
                  >
                    {peticion.fechaLimite || '—'}
                  </td>
                  <td
                    className="truncate px-3 py-1.5 text-metro-muted"
                    title={peticion.solicitante}
                  >
                    {peticion.solicitante}
                  </td>
                  <td className="truncate px-3 py-1.5 text-metro-muted" title={peticion.sindicato}>
                    {peticion.sindicato}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right">
                    <button
                      className="rounded-lg bg-metro-red px-2.5 py-1 text-xs font-semibold text-white hover:bg-metro-dark"
                      onClick={(event) => {
                        event.stopPropagation();
                        remove(peticion.id);
                      }}
                      type="button"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-metro-border">
        <button
          className="flex w-full items-center justify-between border-b border-metro-border bg-white px-3 py-2 text-left"
          onClick={() => setIsHistoricOpen((current) => !current)}
          type="button"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-metro-text">
            {isHistoricOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />} Histórico
          </span>
          <span className="rounded-full bg-metro-red/10 px-3 py-1 text-xs font-bold text-metro-dark">
            {historicPeticiones.length} registros
          </span>
        </button>
        {isHistoricOpen && (
          <div className="bg-white">
            {historicGroups.length === 0 && (
              <p className="px-3 py-3 text-sm text-metro-muted">No hay peticiones cerradas.</p>
            )}
            {historicGroups.map((group) => {
              const isYearOpen = openYears[group.year] ?? false;

              return (
                <div className="border-b border-metro-border last:border-b-0" key={group.year}>
                  <button
                    className="flex w-full items-center gap-2 bg-[#F9FAFB] px-3 py-2 text-left text-sm font-bold text-metro-text hover:bg-red-50/50"
                    onClick={() => toggleHistoricYear(group.year)}
                    type="button"
                  >
                    {isYearOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    {group.year} ({group.peticiones.length})
                  </button>
                  {isYearOpen && (
                    <div className="max-h-[320px] overflow-auto">
                      <table className="min-w-[780px] table-fixed text-left text-xs">
                        <thead className="sticky top-0 z-10 bg-[#F9FAFB] text-[11px] uppercase tracking-wide text-metro-muted">
                          <tr>
                            {historicColumns.map((column) => {
                              const isActive = historicSortState.key === column.key;

                              return (
                                <th className={`${column.className} px-3 py-2`} key={column.key}>
                                  <button
                                    className="flex w-full items-center gap-1 text-left font-bold uppercase tracking-wide hover:text-metro-text"
                                    onClick={() => toggleHistoricSort(column.key)}
                                    type="button"
                                  >
                                    <span>{column.label}</span>
                                    {isActive && (
                                      <span>
                                        {historicSortState.direction === 'asc' ? '↑' : '↓'}
                                      </span>
                                    )}
                                  </button>
                                </th>
                              );
                            })}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-metro-border bg-white">
                          {group.peticiones.map((peticion) => (
                            <tr
                              className="cursor-pointer hover:bg-red-50/50"
                              key={peticion.id}
                              onClick={() => openEditor(peticion)}
                            >
                              <td
                                className="truncate px-3 py-1.5 font-semibold text-metro-text"
                                title={peticion.titulo}
                              >
                                {peticion.titulo}
                              </td>
                              <td
                                className="truncate px-3 py-1.5 text-metro-muted"
                                title={formatDateTime(peticion.closedAt)}
                              >
                                {formatDateTime(peticion.closedAt)}
                              </td>
                              <td
                                className="truncate px-3 py-1.5 text-metro-muted"
                                title={peticion.solicitante}
                              >
                                {peticion.solicitante}
                              </td>
                              <td
                                className="truncate px-3 py-1.5 text-metro-muted"
                                title={peticion.prioridad}
                              >
                                {peticion.prioridad}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editorMode && (
        <PeticionEditor mode={editorMode} onDone={closeEditor} peticion={editorPeticion} />
      )}
    </section>
  );
}

function SelectFilter({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <select
      aria-label={label}
      className="rounded-lg border border-metro-border bg-white px-3 py-1.5 text-sm text-metro-text outline-none focus:border-metro-red"
      onChange={(event) => onChange(event.target.value)}
      value={value}
    >
      <option value="">{label}</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}
