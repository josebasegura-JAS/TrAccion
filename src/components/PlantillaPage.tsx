import {
  FileUp,
  Languages,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { EmployeeEditor } from './EmployeeEditor';
import { JobPositionTranslationsModal } from './JobPositionTranslationsModal';
import type { Employee } from '../features/plantilla/domain/employee';
import { uniqueSorted } from '../features/plantilla/domain/filters';
import { filterEmployees, useEmployeeStore } from '../features/plantilla/store/useEmployeeStore';
import { buildFilterLabel } from '../shared/export/filterLabel';
import { ActiveFilterChips, type ActiveFilterChip } from '../shared/filters/ActiveFilterChips';
import { SelectFilter } from '../shared/filters/SelectFilter';
import type { ExportColumn } from '../shared/export/types';
import { ExportPrintButtons } from '../shared/print/ExportPrintButtons';
import { DataTable, type DataTableColumn } from '../shared/table/DataTable';
import { sortDataTableRows } from '../shared/table/tableSorting';
import {
  type TableViewPreferences,
  useTableViewPreferences,
} from '../shared/table/useTableViewPreferences';

type SortKey =
  | 'empleado'
  | 'nombreApellidos'
  | 'puestoNomina'
  | 'puestoEus'
  | 'residencia'
  | 'nivelRetributivo';

type EmployeeTableColumnId = SortKey | 'actions';

const PLANTILLA_TABLE_STORAGE_KEY = 'traccion.tableView.plantilla.main';

const defaultPlantillaTablePreferences: TableViewPreferences<EmployeeTableColumnId> = {
  sort: { columnId: 'empleado', direction: 'asc' },
  columnWidths: {
    empleado: 105,
    nombreApellidos: 240,
    puestoNomina: 190,
    puestoEus: 190,
    residencia: 120,
    nivelRetributivo: 95,
    actions: 92,
  },
};

const plantillaTableColumnIds: EmployeeTableColumnId[] = [
  'empleado',
  'nombreApellidos',
  'puestoNomina',
  'puestoEus',
  'residencia',
  'nivelRetributivo',
  'actions',
];

const employeeExportColumns: ExportColumn<Employee>[] = [
  { key: 'empleado', header: 'Empleado', value: (employee) => employee.empleado },
  {
    key: 'nombreApellidos',
    header: 'Nombre y apellidos',
    value: (employee) => employee.nombreApellidos,
  },
  { key: 'puestoNomina', header: 'Puesto nómina', value: (employee) => employee.puestoNomina },
  { key: 'puestoEus', header: 'Puesto EUS', value: (employee) => employee.puestoEus || null },
  { key: 'residencia', header: 'Residencia', value: (employee) => employee.residencia },
  { key: 'nivelRetributivo', header: 'Nivel', value: (employee) => employee.nivelRetributivo },
];

export function PlantillaPage() {
  const {
    employees,
    filters,
    importExcel,
    load,
    remove,
    selectEmployee,
    setFilter,
    updateEmptyEmployeeJobPositionTranslations,
  } = useEmployeeStore();
  const [editorMode, setEditorMode] = useState<'create' | 'edit' | null>(null);
  const [isTranslationsModalOpen, setTranslationsModalOpen] = useState(false);
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    load();
  }, [load]);

  const visibleEmployees = useMemo(
    () => employees.filter((employee) => !employee.deletedAt),
    [employees],
  );
  const filteredEmployees = useMemo(
    () => filterEmployees(employees, filters),
    [employees, filters],
  );
  const editorEmployee =
    editorMode === 'edit'
      ? (visibleEmployees.find((employee) => employee.empleado === editingEmployeeId) ?? null)
      : null;

  const openEditor = (employee: Employee) => {
    selectEmployee(employee.empleado);
    setEditingEmployeeId(employee.empleado);
    setEditorMode('edit');
  };

  const openCreateEditor = () => {
    setEditingEmployeeId(null);
    setEditorMode('create');
  };

  const closeEditor = () => {
    setEditorMode(null);
    setEditingEmployeeId(null);
  };

  const residencias = uniqueSorted(visibleEmployees.map((employee) => employee.residencia));
  const niveles = uniqueSorted(visibleEmployees.map((employee) => employee.nivelRetributivo));
  const emptyPuestoEusCount = visibleEmployees.filter(
    (employee) => !employee.puestoEus.trim(),
  ).length;
  const employeeFilterLabel = buildFilterLabel([
    ['Búsqueda', filters.search],
    ['Residencia', filters.residencia],
    ['Nivel retributivo', filters.nivelRetributivo],
  ]);
  const activeFilterChips: ActiveFilterChip[] = [
    filters.search.trim()
      ? { key: 'search', label: 'Búsqueda', value: filters.search.trim(), onClear: () => setFilter('search', '') }
      : null,
    filters.residencia
      ? { key: 'residencia', label: 'Residencia', value: filters.residencia, onClear: () => setFilter('residencia', '') }
      : null,
    filters.nivelRetributivo
      ? { key: 'nivelRetributivo', label: 'Nivel retributivo', value: filters.nivelRetributivo, onClear: () => setFilter('nivelRetributivo', '') }
      : null,
  ].filter((filter): filter is ActiveFilterChip => filter !== null);

  const clearActiveFilters = () => {
    setFilter('search', '');
    setFilter('residencia', '');
    setFilter('nivelRetributivo', '');
  };

  const { preferences, setSort, setColumnWidth, resetPreferences } =
    useTableViewPreferences<EmployeeTableColumnId>({
      storageKey: PLANTILLA_TABLE_STORAGE_KEY,
      defaultPreferences: defaultPlantillaTablePreferences,
      validColumnIds: plantillaTableColumnIds,
    });

  const employeeTableColumns = useMemo<Array<DataTableColumn<Employee, EmployeeTableColumnId>>>(
    () => [
      {
        id: 'empleado',
        header: 'Empleado',
        accessor: (employee) => {
          const employeeNumber = Number(employee.empleado.trim());
          return Number.isFinite(employeeNumber) ? employeeNumber : employee.empleado;
        },
        render: (employee) => employee.empleado,
        width: 105,
        minWidth: 90,
        maxWidth: 180,
        sortable: true,
        className: 'font-semibold text-metro-text',
      },
      {
        id: 'nombreApellidos',
        header: 'Nombre y apellidos',
        accessor: (employee) => employee.nombreApellidos,
        render: (employee) => employee.nombreApellidos,
        width: 240,
        minWidth: 170,
        maxWidth: 420,
        sortable: true,
        className: 'text-metro-text',
      },
      {
        id: 'puestoNomina',
        header: 'Puesto nómina',
        accessor: (employee) => employee.puestoNomina,
        render: (employee) => employee.puestoNomina,
        width: 190,
        minWidth: 145,
        maxWidth: 360,
        sortable: true,
        className: 'text-metro-muted',
      },
      {
        id: 'puestoEus',
        header: 'Puesto EUS',
        accessor: (employee) => employee.puestoEus,
        render: (employee) => employee.puestoEus || '—',
        width: 190,
        minWidth: 145,
        maxWidth: 360,
        sortable: true,
        className: 'text-metro-muted',
      },
      {
        id: 'residencia',
        header: 'Residencia',
        accessor: (employee) => employee.residencia,
        render: (employee) => employee.residencia,
        width: 120,
        minWidth: 95,
        maxWidth: 220,
        sortable: true,
        className: 'text-metro-muted',
      },
      {
        id: 'nivelRetributivo',
        header: 'Nivel',
        accessor: (employee) => employee.nivelRetributivo,
        render: (employee) => employee.nivelRetributivo,
        width: 95,
        minWidth: 75,
        maxWidth: 160,
        sortable: true,
        className: 'text-metro-muted',
      },
      {
        id: 'actions',
        header: 'Acciones',
        render: (employee) => (
          <button
            className="rounded-lg bg-metro-red px-2.5 py-1 text-xs font-semibold text-white hover:bg-metro-dark"
            onClick={(event) => {
              event.stopPropagation();
              remove(employee.empleado);
            }}
            type="button"
          >
            Eliminar
          </button>
        ),
        width: 92,
        minWidth: 84,
        maxWidth: 120,
        resizable: false,
        isActionColumn: true,
        className: 'whitespace-nowrap',
      },
    ],
    [remove],
  );

  const sortedEmployees = useMemo(
    () => sortDataTableRows(filteredEmployees, employeeTableColumns, preferences.sort),
    [employeeTableColumns, filteredEmployees, preferences.sort],
  );

  const handleGlobalJobPositionUpdate = () => {
    const { updated, missing } = updateEmptyEmployeeJobPositionTranslations();
    setImportMessage(
      `Puestos EUS actualizados: ${updated}. Sin traducción encontrada: ${missing}.`,
    );
  };

  return (
    <section
      className="rounded-2xl border border-metro-border bg-metro-surface p-4 shadow-card"
      id="plantilla"
    >
      <div className="mb-3 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-metro-red">Módulo</p>
          <h2 className="text-xl font-bold text-metro-text">Plantilla</h2>
          <p className="mt-0.5 text-sm text-metro-muted">
            Listado de personas con alta manual, edición, borrado lógico e importación Excel.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            accept=".xlsx,.xls,.csv,.tsv,.txt"
            className="hidden"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) {
                return;
              }

              await importExcel(file);
              setImportMessage(`Importación completada: ${file.name}`);
              event.target.value = '';
            }}
            ref={fileInputRef}
            type="file"
          />
          <button
            className="inline-flex items-center gap-2 rounded-xl border border-metro-border bg-metro-surface px-3 py-2 text-sm font-semibold text-metro-text hover:border-metro-red"
            onClick={() => setTranslationsModalOpen(true)}
            type="button"
          >
            <Languages size={16} /> Traducir puestos
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-xl border border-metro-border bg-metro-surface px-3 py-2 text-sm font-semibold text-metro-text hover:border-metro-red disabled:cursor-not-allowed disabled:opacity-50"
            disabled={emptyPuestoEusCount === 0}
            onClick={handleGlobalJobPositionUpdate}
            title={
              emptyPuestoEusCount === 0
                ? 'No hay puestos EUS pendientes'
                : `${emptyPuestoEusCount} puestos EUS pendientes`
            }
            type="button"
          >
            <RefreshCw size={16} /> Actualizar puestos global
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-xl border border-metro-border bg-metro-surface px-3 py-2 text-sm font-semibold text-metro-text hover:border-metro-red"
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            <FileUp size={16} /> Importar
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-xl bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark"
            onClick={openCreateEditor}
            type="button"
          >
            <Plus size={16} /> Nueva persona
          </button>
        </div>
      </div>

      {importMessage && (
        <div className="mb-3 rounded-xl border border-metro-success/30 bg-metro-success/10 px-3 py-2 text-sm font-semibold text-emerald-200">
          {importMessage}
        </div>
      )}

      <div className="mb-3 grid gap-2 rounded-xl border border-metro-border bg-metro-panel p-2 lg:grid-cols-[minmax(220px,1.2fr)_minmax(150px,0.8fr)_minmax(150px,0.8fr)]">
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
          label="Residencia"
          onChange={(value) => setFilter('residencia', value)}
          options={residencias}
          value={filters.residencia}
        />
        <SelectFilter
          label="Nivel retributivo"
          onChange={(value) => setFilter('nivelRetributivo', value)}
          options={niveles}
          value={filters.nivelRetributivo}
        />
      </div>

      {activeFilterChips.length > 0 && (
        <div className="mb-3">
          <ActiveFilterChips filters={activeFilterChips} onClearAll={clearActiveFilters} />
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-metro-border">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-metro-border bg-metro-surface px-3 py-2">
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-metro-text">
            <SlidersHorizontal size={16} className="text-metro-red" /> Personas en plantilla
            <ExportPrintButtons
              payload={{
                title: 'Personas en plantilla',
                filename: 'plantilla-personas',
                columns: employeeExportColumns,
                rows: sortedEmployees,
                filterLabel: employeeFilterLabel,
              }}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="inline-flex items-center gap-1 rounded-lg border border-metro-border bg-metro-panel px-2.5 py-1 text-xs font-semibold text-metro-muted hover:border-metro-red hover:text-metro-text"
              onClick={resetPreferences}
              type="button"
            >
              <RotateCcw size={14} /> Restablecer vista
            </button>
            <span className="rounded-full bg-metro-red/10 px-3 py-1 text-xs font-bold text-red-200">
              {filteredEmployees.length} registros
            </span>
          </div>
        </div>
        <DataTable
          ariaLabel="Personas en plantilla"
          columnWidths={preferences.columnWidths}
          columns={employeeTableColumns}
          emptyMessage="No hay personas que coincidan con los filtros."
          getRowId={(employee) => employee.empleado}
          onColumnWidthChange={setColumnWidth}
          onRowClick={openEditor}
          onSortChange={setSort}
          rowClassName={() => 'cursor-pointer hover:bg-metro-red/10'}
          rows={filteredEmployees}
          sort={preferences.sort}
        />
      </div>

      {editorMode && (
        <EmployeeEditor employee={editorEmployee} mode={editorMode} onDone={closeEditor} />
      )}

      {isTranslationsModalOpen && (
        <JobPositionTranslationsModal onClose={() => setTranslationsModalOpen(false)} />
      )}
    </section>
  );
}
