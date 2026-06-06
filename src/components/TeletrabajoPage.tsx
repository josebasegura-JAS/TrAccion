import { Plus, Search, SlidersHorizontal, Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { TeletrabajoEditor } from './TeletrabajoEditor';
import { useEmployeeStore } from '../features/plantilla/store/useEmployeeStore';
import { filterTeletrabajoSolicitudes } from '../features/teletrabajo/domain/filters';
import {
  TELETRABAJO_ESTADOS,
  TELETRABAJO_TIPOS_SOLICITUD,
  type TeletrabajoSolicitud,
} from '../features/teletrabajo/domain/solicitud';
import {
  sortTeletrabajoByColumn,
  sortTeletrabajoByDefault,
  type SortDirection,
  type TeletrabajoSortKey,
} from '../features/teletrabajo/domain/sort';
import { useTeletrabajoStore } from '../features/teletrabajo/store/useTeletrabajoStore';

interface SortState {
  key: TeletrabajoSortKey;
  direction: SortDirection;
}

const sortableColumns: Array<{ key: TeletrabajoSortKey; label: string; className: string }> = [
  { key: 'empleado', label: 'Empleado', className: 'w-[105px]' },
  { key: 'nombreApellidos', label: 'Nombre y apellidos', className: 'w-[220px]' },
  { key: 'puestoNomina', label: 'Puesto nómina', className: 'w-[190px]' },
  { key: 'residencia', label: 'Residencia', className: 'w-[130px]' },
  { key: 'tipoSolicitud', label: 'Tipo', className: 'w-[110px]' },
  { key: 'diasTeletrabajo', label: 'Días', className: 'w-[150px]' },
  { key: 'estado', label: 'Estado', className: 'w-[110px]' },
  { key: 'periodo', label: 'Periodo', className: 'w-[110px]' },
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
    <label className="flex items-center gap-2 rounded-lg border border-metro-border bg-white px-3 py-1.5 text-sm text-metro-muted">
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
  const [editorMode, setEditorMode] = useState<'create' | 'edit' | null>(null);
  const [editingSolicitudId, setEditingSolicitudId] = useState<string | null>(null);
  const [sortState, setSortState] = useState<SortState | null>(null);
  const [importSummary, setImportSummary] = useState<string>('');
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
  const sortedSolicitudes = useMemo(() => {
    if (!sortState) {
      return sortTeletrabajoByDefault(filteredSolicitudes);
    }

    return sortTeletrabajoByColumn(filteredSolicitudes, sortState.key, sortState.direction);
  }, [filteredSolicitudes, sortState]);

  const editorSolicitud =
    editorMode === 'edit'
      ? (visibleSolicitudes.find((solicitud) => solicitud.id === editingSolicitudId) ?? null)
      : null;

  const periodos = useMemo(
    () => uniqueSorted(visibleSolicitudes.map((solicitud) => solicitud.periodo)).reverse(),
    [visibleSolicitudes],
  );

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

  const toggleSort = (key: TeletrabajoSortKey) => {
    setSortState((current) => ({
      key,
      direction: current?.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const handleImportEncuesta = async (file: File) => {
    const summary = await importEncuesta(file, employees);
    setImportSummary(
      `${summary.imported} registros importados · ${summary.updated} registros actualizados · ${summary.ignored} filas ignoradas`,
    );
  };

  return (
    <section
      className="rounded-2xl border border-metro-border bg-white p-4 shadow-card"
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
            className="inline-flex items-center gap-2 rounded-xl border border-metro-border bg-white px-3 py-2 text-sm font-semibold text-metro-text hover:bg-metro-surface"
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

      <div className="mb-3 grid gap-2 rounded-xl border border-metro-border bg-metro-surface p-2 lg:grid-cols-[minmax(220px,1.2fr)_minmax(150px,0.8fr)_minmax(150px,0.8fr)_minmax(150px,0.8fr)]">
        <label className="flex items-center gap-2 rounded-lg border border-metro-border bg-white px-3 py-1.5 text-sm text-metro-muted">
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
        <div className="flex items-center justify-between border-b border-metro-border bg-white px-3 py-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-metro-text">
            <SlidersHorizontal size={16} className="text-metro-red" /> Solicitudes de teletrabajo
          </div>
          <span className="rounded-full bg-metro-red/10 px-3 py-1 text-xs font-bold text-metro-dark">
            {filteredSolicitudes.length} registros
          </span>
        </div>
        <div className="max-h-[460px] overflow-auto">
          <table className="w-full table-fixed text-left text-xs">
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
              {sortedSolicitudes.map((solicitud) => (
                <tr
                  className="cursor-pointer hover:bg-red-50/50"
                  key={solicitud.id}
                  onClick={() => openEditor(solicitud)}
                >
                  <td
                    className="truncate px-3 py-1.5 font-semibold text-metro-text"
                    title={solicitud.empleado}
                  >
                    {solicitud.empleado}
                  </td>
                  <td
                    className="truncate px-3 py-1.5 text-metro-text"
                    title={solicitud.nombreApellidos}
                  >
                    {solicitud.nombreApellidos}
                  </td>
                  <td
                    className="truncate px-3 py-1.5 text-metro-muted"
                    title={solicitud.puestoNomina}
                  >
                    {solicitud.puestoNomina}
                  </td>
                  <td
                    className="truncate px-3 py-1.5 text-metro-muted"
                    title={solicitud.residencia}
                  >
                    {solicitud.residencia}
                  </td>
                  <td
                    className="truncate px-3 py-1.5 text-metro-muted"
                    title={solicitud.tipoSolicitud}
                  >
                    {solicitud.tipoSolicitud}
                  </td>
                  <td
                    className="truncate px-3 py-1.5 text-metro-muted"
                    title={solicitud.diasTeletrabajo.join(', ')}
                  >
                    {solicitud.diasTeletrabajo.join(', ')}
                  </td>
                  <td className="truncate px-3 py-1.5 text-metro-muted" title={solicitud.estado}>
                    {solicitud.estado}
                  </td>
                  <td className="truncate px-3 py-1.5 text-metro-muted" title={solicitud.periodo}>
                    {solicitud.periodo}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right">
                    <button
                      className="rounded-lg bg-metro-red px-2.5 py-1 text-xs font-semibold text-white hover:bg-metro-dark"
                      onClick={(event) => {
                        event.stopPropagation();
                        remove(solicitud.id);
                      }}
                      type="button"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
              {sortedSolicitudes.length === 0 && (
                <tr>
                  <td className="px-3 py-6 text-center text-sm text-metro-muted" colSpan={9}>
                    No hay solicitudes de teletrabajo para los criterios seleccionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editorMode && (
        <TeletrabajoEditor mode={editorMode} onDone={closeEditor} solicitud={editorSolicitud} />
      )}
    </section>
  );
}
