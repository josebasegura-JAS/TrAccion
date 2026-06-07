import { FileText, Plus, RotateCcw, Search, SlidersHorizontal, Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DataTable, type DataTableColumn } from '../shared/table/DataTable';
import { sortDataTableRows } from '../shared/table/tableSorting';
import { useTableViewPreferences, type TableViewPreferences } from '../shared/table/useTableViewPreferences';
import { TeletrabajoEditor } from './TeletrabajoEditor';
import { useEmployeeStore } from '../features/plantilla/store/useEmployeeStore';
import { filterTeletrabajoSolicitudes } from '../features/teletrabajo/domain/filters';
import {
  TELETRABAJO_ESTADOS,
  TELETRABAJO_TIPOS_SOLICITUD,
  type TeletrabajoSolicitud,
} from '../features/teletrabajo/domain/solicitud';

import { useConfiguracionStore } from '../features/configuracion/store/useConfiguracionStore';
import { saveDocxWithDialog } from '../features/teletrabajo/domain/download';
import { generateTeletrabajoWord } from '../features/teletrabajo/domain/word';
import { useTeletrabajoStore } from '../features/teletrabajo/store/useTeletrabajoStore';
import { buildFilterLabel } from '../shared/export/filterLabel';
import type { ExportColumn } from '../shared/export/types';
import { ExportPrintButtons } from '../shared/print/ExportPrintButtons';

type TeletrabajoTableColumnId =
  | 'empleado'
  | 'nombreApellidos'
  | 'puestoNomina'
  | 'residencia'
  | 'tipoSolicitud'
  | 'diasTeletrabajo'
  | 'estado'
  | 'periodo'
  | 'actions';

const TELETRABAJO_TABLE_STORAGE_KEY = 'traccion.tableView.teletrabajo.solicitudes';
const teletrabajoTableColumnIds: readonly TeletrabajoTableColumnId[] = [
  'empleado',
  'nombreApellidos',
  'puestoNomina',
  'residencia',
  'tipoSolicitud',
  'diasTeletrabajo',
  'estado',
  'periodo',
  'actions',
];
const defaultTeletrabajoTablePreferences: TableViewPreferences<TeletrabajoTableColumnId> = {
  sort: null,
  columnWidths: {},
};

const teletrabajoExportColumns: ExportColumn<TeletrabajoSolicitud>[] = [
  { key: 'empleado', header: 'Empleado', value: (solicitud) => solicitud.empleado },
  {
    key: 'nombreApellidos',
    header: 'Nombre y apellidos',
    value: (solicitud) => solicitud.nombreApellidos,
  },
  { key: 'puestoNomina', header: 'Puesto nómina', value: (solicitud) => solicitud.puestoNomina },
  { key: 'residencia', header: 'Residencia', value: (solicitud) => solicitud.residencia },
  { key: 'tipoSolicitud', header: 'Tipo', value: (solicitud) => solicitud.tipoSolicitud },
  {
    key: 'diasTeletrabajo',
    header: 'Días',
    value: (solicitud) => solicitud.diasTeletrabajo.join(', '),
  },
  { key: 'estado', header: 'Estado', value: (solicitud) => solicitud.estado },
  { key: 'periodo', header: 'Periodo', value: (solicitud) => solicitud.periodo },
];

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0))).sort(
    (first, second) => first.localeCompare(second, 'es', { numeric: true, sensitivity: 'base' }),
  );
}

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
      <span className="whitespace-nowrap text-xs font-bold uppercase tracking-wide">{label}</span>
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

export function TeletrabajoPage() {
  const { filters, importEncuesta, load, remove, selectSolicitud, setFilter, solicitudes } =
    useTeletrabajoStore();
  const employees = useEmployeeStore((state) => state.employees);
  const loadEmployees = useEmployeeStore((state) => state.load);
  const jobPositionTranslations = useEmployeeStore((state) => state.jobPositionTranslations);
  const [editorMode, setEditorMode] = useState<'create' | 'edit' | null>(null);
  const [editingSolicitudId, setEditingSolicitudId] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<string>('');
  const [wordStatus, setWordStatus] = useState<string>('');
  const [generatingWordId, setGeneratingWordId] = useState<string | null>(null);
  const rutaPlantillaTeletrabajo = useConfiguracionStore((state) => state.rutaPlantillaTeletrabajo);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    load();
    loadEmployees();
  }, [load, loadEmployees]);

  const visibleSolicitudes = useMemo(
    () => solicitudes.filter((solicitud) => !solicitud.deletedAt),
    [solicitudes],
  );
  const filteredSolicitudes = useMemo(
    () => filterTeletrabajoSolicitudes(solicitudes, filters),
    [filters, solicitudes],
  );
  const { preferences, setSort, setColumnWidth, resetPreferences } =
    useTableViewPreferences<TeletrabajoTableColumnId>({
      storageKey: TELETRABAJO_TABLE_STORAGE_KEY,
      defaultPreferences: defaultTeletrabajoTablePreferences,
      validColumnIds: teletrabajoTableColumnIds,
    });

  const teletrabajoTableColumns = useMemo<Array<DataTableColumn<TeletrabajoSolicitud, TeletrabajoTableColumnId>>>(
    () => [
      { id: 'empleado', header: 'Empleado', accessor: (s) => Number(s.empleado) || s.empleado, render: (s) => s.empleado, width: 105, minWidth: 85, maxWidth: 170, sortable: true, className: 'font-semibold text-metro-text' },
      { id: 'nombreApellidos', header: 'Nombre y apellidos', accessor: (s) => s.nombreApellidos, render: (s) => s.nombreApellidos, width: 220, minWidth: 160, maxWidth: 420, sortable: true, className: 'text-metro-text' },
      { id: 'puestoNomina', header: 'Puesto nómina', accessor: (s) => s.puestoNomina, render: (s) => s.puestoNomina, width: 190, minWidth: 140, maxWidth: 360, sortable: true, className: 'text-metro-muted' },
      { id: 'residencia', header: 'Residencia', accessor: (s) => s.residencia, render: (s) => s.residencia, width: 130, minWidth: 100, maxWidth: 240, sortable: true, className: 'text-metro-muted' },
      { id: 'tipoSolicitud', header: 'Tipo', accessor: (s) => s.tipoSolicitud, render: (s) => s.tipoSolicitud, width: 110, minWidth: 90, maxWidth: 180, sortable: true, className: 'text-metro-muted' },
      { id: 'diasTeletrabajo', header: 'Días', accessor: (s) => s.diasTeletrabajo.join(', '), render: (s) => s.diasTeletrabajo.join(', '), width: 150, minWidth: 110, maxWidth: 240, sortable: true, className: 'text-metro-muted' },
      { id: 'estado', header: 'Estado', accessor: (s) => s.estado, render: (s) => s.estado, width: 110, minWidth: 90, maxWidth: 180, sortable: true, className: 'text-metro-muted' },
      { id: 'periodo', header: 'Periodo', accessor: (s) => s.periodo, render: (s) => s.periodo, width: 110, minWidth: 90, maxWidth: 180, sortable: true, className: 'text-metro-muted' },
      { id: 'actions', header: 'Acciones', render: (solicitud) => (
        <div className="inline-flex items-center justify-end gap-1">
          {solicitud.estado === 'aprobada' && (
            <button aria-label="Generar acuerdo Word" className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-metro-border bg-metro-surface text-xs font-black text-metro-text hover:border-metro-red disabled:cursor-not-allowed disabled:opacity-50" disabled={generatingWordId !== null} onClick={(event) => { event.stopPropagation(); void handleGenerateWord(solicitud); }} title="Generar acuerdo Word" type="button">
              {generatingWordId === solicitud.id ? <FileText size={13} /> : 'W'}
            </button>
          )}
          <button className="rounded-lg bg-metro-red px-2.5 py-1 text-xs font-semibold text-white hover:bg-metro-dark" onClick={(event) => { event.stopPropagation(); remove(solicitud.id); }} type="button">Eliminar</button>
        </div>
      ), width: 100, minWidth: 95, maxWidth: 130, resizable: false, isActionColumn: true, className: 'whitespace-nowrap' },
    ],
    [generatingWordId, remove],
  );

  const sortedSolicitudes = useMemo(
    () => sortDataTableRows(filteredSolicitudes, teletrabajoTableColumns, preferences.sort),
    [filteredSolicitudes, preferences.sort, teletrabajoTableColumns],
  );

  const editorSolicitud =
    editorMode === 'edit'
      ? (visibleSolicitudes.find((solicitud) => solicitud.id === editingSolicitudId) ?? null)
      : null;

  const periodos = useMemo(
    () => uniqueSorted(visibleSolicitudes.map((solicitud) => solicitud.periodo)).reverse(),
    [visibleSolicitudes],
  );
  const teletrabajoFilterLabel = buildFilterLabel([
    ['Búsqueda', filters.search],
    ['Estado', filters.estado],
    ['Tipo', filters.tipoSolicitud],
    ['Periodo', filters.periodo],
  ]);

  const openEditor = (solicitud: TeletrabajoSolicitud) => {
    selectSolicitud(solicitud.id);
    setEditingSolicitudId(solicitud.id);
    setEditorMode('edit');
  };

  const openCreateEditor = () => {
    setEditingSolicitudId(null);
    setEditorMode('create');
  };

  const closeEditor = () => {
    setEditorMode(null);
    setEditingSolicitudId(null);
  };

  const handleImportEncuesta = async (file: File) => {
    const summary = await importEncuesta(file, employees);
    setImportSummary(
      `${summary.imported} registros importados · ${summary.updated} registros actualizados · ${summary.ignored} filas ignoradas`,
    );
  };

  const handleGenerateWord = async (solicitud: TeletrabajoSolicitud) => {
    if (solicitud.estado !== 'aprobada' || generatingWordId) {
      return;
    }

    const employee =
      employees.find(
        (candidate) =>
          !candidate.deletedAt && candidate.empleado.trim() === solicitud.empleado.trim(),
      ) ?? null;

    setGeneratingWordId(solicitud.id);
    setWordStatus('');

    try {
      const result = await generateTeletrabajoWord(
        solicitud,
        employee,
        rutaPlantillaTeletrabajo,
        jobPositionTranslations,
      );
      await saveDocxWithDialog(result.blob, result.fileName);
      setWordStatus(`Word generado: ${result.detectedMarkers.length} marcadores sustituidos.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se ha podido generar el Word.';
      setWordStatus(message);
    } finally {
      setGeneratingWordId(null);
    }
  };

  return (
    <section
      className="rounded-2xl border border-metro-border bg-metro-surface p-4 shadow-card"
      id="teletrabajo"
    >
      <div className="mb-3 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-metro-red">Módulo</p>
          <h2 className="text-xl font-bold text-metro-text">Teletrabajo</h2>
          <p className="mt-0.5 text-sm text-metro-muted">
            Listado de solicitudes con alta manual, edición, borrado lógico, búsqueda y filtros.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            accept=".xlsx,.csv,.tsv"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void handleImportEncuesta(file);
              }
              event.target.value = '';
            }}
            ref={fileInputRef}
            type="file"
          />
          <button
            className="inline-flex items-center gap-2 rounded-xl border border-metro-border bg-metro-surface px-3 py-2 text-sm font-semibold text-metro-text hover:bg-metro-surface"
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            <Upload size={16} /> Importar encuesta
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-xl bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark"
            onClick={openCreateEditor}
            type="button"
          >
            <Plus size={16} /> Nueva solicitud
          </button>
        </div>
      </div>

      {importSummary && (
        <div className="mb-3 rounded-xl border border-metro-border bg-metro-surface px-3 py-2 text-sm font-semibold text-metro-text">
          {importSummary}
        </div>
      )}

      {wordStatus && (
        <div className="mb-3 rounded-xl border border-metro-border bg-metro-surface px-3 py-2 text-sm font-semibold text-metro-text">
          {wordStatus}
        </div>
      )}

      <div className="mb-3 grid gap-2 rounded-xl border border-metro-border bg-metro-panel p-2 lg:grid-cols-[minmax(220px,1.2fr)_minmax(150px,0.8fr)_minmax(150px,0.8fr)_minmax(150px,0.8fr)]">
        <label className="flex items-center gap-2 rounded-lg border border-metro-border bg-metro-surface px-3 py-1.5 text-sm text-metro-muted">
          <Search size={16} />
          <input
            className="w-full bg-transparent text-metro-text outline-none placeholder:text-metro-muted"
            onChange={(event) => setFilter('search', event.target.value)}
            placeholder="Buscar por empleado o nombre..."
            type="search"
            value={filters.search}
          />
        </label>
        <SelectFilter
          label="Estado"
          onChange={(value) => setFilter('estado', value as typeof filters.estado)}
          options={TELETRABAJO_ESTADOS}
          value={filters.estado}
        />
        <SelectFilter
          label="Tipo"
          onChange={(value) => setFilter('tipoSolicitud', value as typeof filters.tipoSolicitud)}
          options={TELETRABAJO_TIPOS_SOLICITUD}
          value={filters.tipoSolicitud}
        />
        <SelectFilter
          label="Periodo"
          onChange={(value) => setFilter('periodo', value)}
          options={periodos}
          value={filters.periodo}
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-metro-border">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-metro-border bg-metro-surface px-3 py-2">
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-metro-text">
            <SlidersHorizontal size={16} className="text-metro-red" /> Solicitudes de teletrabajo
            <ExportPrintButtons
              payload={{
                title: 'Solicitudes de teletrabajo',
                filename: 'teletrabajo-solicitudes',
                columns: teletrabajoExportColumns,
                rows: sortedSolicitudes,
                filterLabel: teletrabajoFilterLabel,
              }}
            />
          </div>
          <span className="rounded-full bg-metro-red/10 px-3 py-1 text-xs font-bold text-red-200">
            {filteredSolicitudes.length} registros
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
          ariaLabel="Solicitudes de teletrabajo"
          columnWidths={preferences.columnWidths}
          columns={teletrabajoTableColumns}
          emptyMessage="No hay solicitudes de teletrabajo para los criterios seleccionados."
          getRowId={(solicitud) => solicitud.id}
          onColumnWidthChange={setColumnWidth}
          onRowClick={openEditor}
          onSortChange={setSort}
          rows={filteredSolicitudes}
          sort={preferences.sort}
        />
      </div>

      {editorMode && (
        <TeletrabajoEditor mode={editorMode} onDone={closeEditor} solicitud={editorSolicitud} />
      )}
    </section>
  );
}
