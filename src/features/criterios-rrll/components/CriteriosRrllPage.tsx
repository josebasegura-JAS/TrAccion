import { Plus, Search, SlidersHorizontal } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { filterCriteriosRrll } from '../domain/filters';
import {
  sortCriteriosRrllByColumn,
  sortCriteriosRrllByDefault,
  type CriterioRrllSortKey,
  type SortDirection,
} from '../domain/sort';
import {
  CRITERIO_RRLL_ESTADOS,
  type CriterioRrll,
  type CriterioRrllEstado,
} from '../domain/criterioRrll';
import { useCriteriosRrllStore } from '../store/useCriteriosRrllStore';
import { CriterioRrllEditor } from './CriterioRrllEditor';

interface SortState {
  key: CriterioRrllSortKey;
  direction: SortDirection;
}

const sortableColumns: Array<{ key: CriterioRrllSortKey; label: string; className: string }> = [
  { key: 'tema', label: 'Tema', className: 'w-[220px]' },
  { key: 'estado', label: 'Estado', className: 'w-[120px]' },
  { key: 'fecha', label: 'Fecha', className: 'w-[115px]' },
  { key: 'responsable', label: 'Responsable', className: 'w-[150px]' },
];

function SelectFilter({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: readonly string[];
  value: string;
}) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-metro-border bg-white px-3 py-1.5 text-sm text-metro-muted">
      <span className="shrink-0 text-xs font-bold uppercase tracking-wide">{label}</span>
      <select
        className="w-full bg-transparent text-metro-text outline-none"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        <option value="">Todos</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

export function CriteriosRrllPage() {
  const { criterios, filters, load, selectCriterio, setFilter } = useCriteriosRrllStore();
  const [editorMode, setEditorMode] = useState<'create' | 'edit' | null>(null);
  const [editingCriterioId, setEditingCriterioId] = useState<string | null>(null);
  const [sortState, setSortState] = useState<SortState | null>(null);

  useEffect(() => {
    load();
  }, [load]);

  const visibleCriterios = useMemo(
    () => criterios.filter((criterio) => !criterio.deletedAt),
    [criterios],
  );
  const filteredCriterios = useMemo(
    () => filterCriteriosRrll(criterios, filters),
    [criterios, filters],
  );
  const sortedCriterios = useMemo(() => {
    if (!sortState) {
      return sortCriteriosRrllByDefault(filteredCriterios);
    }

    return sortCriteriosRrllByColumn(filteredCriterios, sortState.key, sortState.direction);
  }, [filteredCriterios, sortState]);

  const editorCriterio =
    editorMode === 'edit'
      ? (visibleCriterios.find((criterio) => criterio.id === editingCriterioId) ?? null)
      : null;

  const openEditor = (criterio: CriterioRrll) => {
    selectCriterio(criterio.id);
    setEditingCriterioId(criterio.id);
    setEditorMode('edit');
  };

  const openCreateEditor = () => {
    setEditingCriterioId(null);
    setEditorMode('create');
  };

  const closeEditor = () => {
    setEditorMode(null);
    setEditingCriterioId(null);
  };

  const toggleSort = (key: CriterioRrllSortKey) => {
    setSortState((current) => ({
      key,
      direction: current?.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  return (
    <section
      className="rounded-2xl border border-metro-border bg-white p-4 shadow-card"
      id="criterios-rrll"
    >
      <div className="mb-3 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-metro-red">Módulo</p>
          <h2 className="text-2xl font-bold text-metro-text">Criterios RRLL</h2>
          <p className="mt-0.5 text-base text-metro-muted">
            Listado de criterios con alta manual, edición, borrado lógico, búsqueda y filtros.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="inline-flex items-center gap-2 rounded-xl bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark"
            onClick={openCreateEditor}
            type="button"
          >
            <Plus size={16} /> Nuevo criterio
          </button>
        </div>
      </div>

      <div className="mb-3 grid gap-2 rounded-xl border border-metro-border bg-metro-surface p-2 lg:grid-cols-[minmax(220px,1.2fr)_minmax(150px,0.8fr)]">
        <label className="flex items-center gap-2 rounded-lg border border-metro-border bg-white px-3 py-1.5 text-sm text-metro-muted">
          <Search size={16} />
          <input
            className="w-full bg-transparent text-metro-text outline-none placeholder:text-metro-muted"
            onChange={(event) => setFilter('search', event.target.value)}
            placeholder="Buscar por tema, criterio u observaciones..."
            type="search"
            value={filters.search}
          />
        </label>
        <SelectFilter
          label="Estado"
          onChange={(value) => setFilter('estado', value as '' | CriterioRrllEstado)}
          options={CRITERIO_RRLL_ESTADOS}
          value={filters.estado}
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-metro-border">
        <div className="flex items-center justify-between border-b border-metro-border bg-white px-3 py-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-metro-text">
            <SlidersHorizontal size={16} className="text-metro-red" /> Criterios RRLL
          </div>
          <span className="rounded-full bg-metro-red/10 px-3 py-1 text-xs font-bold text-metro-dark">
            {filteredCriterios.length} registros
          </span>
        </div>
        <div className="max-h-[460px] overflow-auto">
          <table className="min-w-[940px] table-fixed text-left text-xs">
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
                <th className="w-[300px] px-3 py-2">Criterio</th>
                <th className="w-[100px] px-3 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-metro-border bg-white">
              {sortedCriterios.map((criterio) => (
                <tr
                  className="cursor-pointer hover:bg-red-50/50"
                  key={criterio.id}
                  onClick={() => openEditor(criterio)}
                >
                  <td
                    className="truncate px-3 py-1.5 font-semibold text-metro-text"
                    title={criterio.tema}
                  >
                    {criterio.tema}
                  </td>
                  <td className="truncate px-3 py-1.5 text-metro-muted" title={criterio.estado}>
                    {criterio.estado}
                  </td>
                  <td
                    className="truncate px-3 py-1.5 text-metro-muted"
                    title={criterio.fecha || '—'}
                  >
                    {criterio.fecha || '—'}
                  </td>
                  <td
                    className="truncate px-3 py-1.5 text-metro-muted"
                    title={criterio.responsable}
                  >
                    {criterio.responsable}
                  </td>
                  <td className="truncate px-3 py-1.5 text-metro-muted" title={criterio.criterio}>
                    {criterio.criterio}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right">
                    <button
                      className="rounded-lg bg-metro-red px-2.5 py-1 text-xs font-semibold text-white hover:bg-metro-dark"
                      onClick={(event) => {
                        event.stopPropagation();
                        openEditor(criterio);
                      }}
                      type="button"
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {sortedCriterios.length === 0 && (
            <p className="border-t border-metro-border bg-white px-3 py-3 text-sm text-metro-muted">
              No hay criterios para los filtros seleccionados.
            </p>
          )}
        </div>
      </div>

      {editorMode && (
        <CriterioRrllEditor criterio={editorCriterio} mode={editorMode} onDone={closeEditor} />
      )}
    </section>
  );
}
