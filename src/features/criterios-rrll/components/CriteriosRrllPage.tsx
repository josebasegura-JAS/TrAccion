import { Plus, RotateCcw, Search, SlidersHorizontal } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { DataTable, type DataTableColumn } from '../../../shared/table/DataTable';
import { sortDataTableRows } from '../../../shared/table/tableSorting';
import { useTableViewPreferences, type TableViewPreferences } from '../../../shared/table/useTableViewPreferences';
import { filterCriteriosRrll } from '../domain/filters';
import {
  CRITERIO_RRLL_ESTADOS,
  type CriterioRrll,
  type CriterioRrllEstado,
} from '../domain/criterioRrll';
import { buildFilterLabel } from '../../../shared/export/filterLabel';
import type { ExportColumn } from '../../../shared/export/types';
import { ExportPrintButtons } from '../../../shared/print/ExportPrintButtons';
import { useCriteriosRrllStore } from '../store/useCriteriosRrllStore';
import { CriterioRrllEditor } from './CriterioRrllEditor';

type CriterioTableColumnId = 'tema' | 'estado' | 'fecha' | 'responsable' | 'criterio' | 'actions';

const CRITERIOS_TABLE_STORAGE_KEY = 'traccion.tableView.criteriosRrll.main';
const criterioTableColumnIds: readonly CriterioTableColumnId[] = [
  'tema',
  'estado',
  'fecha',
  'responsable',
  'criterio',
  'actions',
];
const defaultCriterioTablePreferences: TableViewPreferences<CriterioTableColumnId> = {
  sort: null,
  columnWidths: {},
};

const criterioExportColumns: ExportColumn<CriterioRrll>[] = [
  { key: 'tema', header: 'Tema', value: (criterio) => criterio.tema },
  { key: 'estado', header: 'Estado', value: (criterio) => criterio.estado },
  { key: 'fecha', header: 'Fecha', value: (criterio) => criterio.fecha || null },
  { key: 'responsable', header: 'Responsable', value: (criterio) => criterio.responsable },
  { key: 'criterio', header: 'Criterio', value: (criterio) => criterio.criterio },
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
    <label className="flex items-center gap-2 rounded-lg border border-metro-border bg-metro-surface px-3 py-1.5 text-sm text-metro-muted">
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
  const { criterios, filters, load, remove, selectCriterio, setFilter } = useCriteriosRrllStore();
  const [editorMode, setEditorMode] = useState<'create' | 'edit' | null>(null);
  const [editingCriterioId, setEditingCriterioId] = useState<string | null>(null);

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
  const { preferences, setSort, setColumnWidth, resetPreferences } =
    useTableViewPreferences<CriterioTableColumnId>({
      storageKey: CRITERIOS_TABLE_STORAGE_KEY,
      defaultPreferences: defaultCriterioTablePreferences,
      validColumnIds: criterioTableColumnIds,
    });

  const criterioTableColumns = useMemo<Array<DataTableColumn<CriterioRrll, CriterioTableColumnId>>>(
    () => [
      { id: 'tema', header: 'Tema', accessor: (c) => c.tema, render: (c) => c.tema, width: 220, minWidth: 150, maxWidth: 360, sortable: true, className: 'font-semibold text-metro-text' },
      { id: 'estado', header: 'Estado', accessor: (c) => c.estado, render: (c) => c.estado, width: 120, minWidth: 95, maxWidth: 190, sortable: true, className: 'text-metro-muted' },
      { id: 'fecha', header: 'Fecha', accessor: (c) => c.fecha, render: (c) => c.fecha || '—', width: 115, minWidth: 90, maxWidth: 180, sortable: true, className: 'text-metro-muted' },
      { id: 'responsable', header: 'Responsable', accessor: (c) => c.responsable, render: (c) => c.responsable, width: 150, minWidth: 115, maxWidth: 260, sortable: true, className: 'text-metro-muted' },
      { id: 'criterio', header: 'Criterio', accessor: (c) => c.criterio, render: (c) => c.criterio, width: 300, minWidth: 190, maxWidth: 520, sortable: true, className: 'text-metro-muted' },
      { id: 'actions', header: 'Acciones', render: (criterio) => (
        <button className="rounded-lg bg-metro-red px-2.5 py-1 text-xs font-semibold text-white hover:bg-metro-dark" onClick={(event) => { event.stopPropagation(); remove(criterio.id); }} type="button">Eliminar</button>
      ), width: 100, minWidth: 90, maxWidth: 120, resizable: false, isActionColumn: true, className: 'whitespace-nowrap' },
    ],
    [remove],
  );

  const sortedCriterios = useMemo(
    () => sortDataTableRows(filteredCriterios, criterioTableColumns, preferences.sort),
    [criterioTableColumns, filteredCriterios, preferences.sort],
  );

  const editorCriterio =
    editorMode === 'edit'
      ? (visibleCriterios.find((criterio) => criterio.id === editingCriterioId) ?? null)
      : null;
  const criterioFilterLabel = buildFilterLabel([
    ['Búsqueda', filters.search],
    ['Estado', filters.estado],
  ]);

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

  return (
    <section
      className="rounded-2xl border border-metro-border bg-metro-surface p-4 shadow-card"
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

      <div className="mb-3 grid gap-2 rounded-xl border border-metro-border bg-metro-panel p-2 lg:grid-cols-[minmax(220px,1.2fr)_minmax(150px,0.8fr)]">
        <label className="flex items-center gap-2 rounded-lg border border-metro-border bg-metro-surface px-3 py-1.5 text-sm text-metro-muted">
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
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-metro-border bg-metro-surface px-3 py-2">
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-metro-text">
            <SlidersHorizontal size={16} className="text-metro-red" /> Criterios RRLL
            <ExportPrintButtons
              payload={{
                title: 'Criterios RRLL',
                filename: 'criterios-rrll',
                columns: criterioExportColumns,
                rows: sortedCriterios,
                filterLabel: criterioFilterLabel,
              }}
            />
          </div>
          <span className="rounded-full bg-metro-red/10 px-3 py-1 text-xs font-bold text-red-200">
            {filteredCriterios.length} registros
          </span>
        </div>
        <div className="flex flex-wrap justify-end pb-2">
          <button
            className="inline-flex items-center gap-1 rounded-lg border border-metro-border bg-metro-panel px-2.5 py-1 text-xs font-semibold text-metro-muted hover:border-metro-red hover:text-metro-text"
            onClick={resetPreferences}
            type="button"
          >
            <RotateCcw size={14} /> Restablecer vista
          </button>
        </div>
        <DataTable
          ariaLabel="Criterios RRLL"
          columnWidths={preferences.columnWidths}
          columns={criterioTableColumns}
          emptyMessage="No hay criterios para los filtros seleccionados."
          getRowId={(criterio) => criterio.id}
          onColumnWidthChange={setColumnWidth}
          onRowClick={openEditor}
          onSortChange={setSort}
          rows={filteredCriterios}
          sort={preferences.sort}
        />
      </div>

      {editorMode && (
        <CriterioRrllEditor criterio={editorCriterio} mode={editorMode} onDone={closeEditor} />
      )}
    </section>
  );
}
