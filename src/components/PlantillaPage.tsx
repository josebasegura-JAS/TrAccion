import {
  Download,
  Languages,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Upload,
} from 'lucide-react';
import { useEffect, useDeferredValue, useMemo, useRef, useState } from 'react';
import { buildStableExportFilename, openWorkbookInExcel } from '../shared/export/tableExport';
import { EmployeeEditor } from './EmployeeEditor';
import { ModuleHelpButton, type ModuleHelpSection } from './ModuleHelp';
import { DropdownMenu } from './ui/DropdownMenu';
import { JobPositionTranslationsModal } from './JobPositionTranslationsModal';
import type { Employee } from '../features/plantilla/domain/employee';
import { uniqueSorted } from '../features/plantilla/domain/filters';
import { filterEmployees, useEmployeeStore } from '../features/plantilla/store/useEmployeeStore';
import { buildFilterLabel } from '../shared/export/filterLabel';
import { ActiveFilterChips, type ActiveFilterChip } from '../shared/filters/ActiveFilterChips';
import { SelectFilter } from '../shared/filters/SelectFilter';
import type { ExportColumn } from '../shared/export/types';
import { reorderExportColumns } from '../shared/export/reorderExportColumns';
import { ExportPrintButtons } from '../shared/print/ExportPrintButtons';
import { DataTable, type DataTableColumn } from '../shared/table/DataTable';
import { sortDataTableRows } from '../shared/table/tableSorting';
import {
  type TableViewPreferences,
  useTableViewPreferences,
} from '../shared/table/useTableViewPreferences';

const PLANTILLA_HELP_SECTIONS: ModuleHelpSection[] = [
  {
    title: 'Para qué sirve',
    items: [
      'Mantiene la relación base de personas que utiliza el resto de módulos (Teletrabajo, Ticket Restaurante, etc.).',
      'Permite alta manual, edición, búsqueda, filtros y borrado lógico sin perder trazabilidad.',
      'La importación Excel actualiza datos de plantilla y evita tener que introducir personas una a una.',
    ],
  },
  {
    title: 'Importación de personas',
    items: [
      'Admite Excel, CSV, TSV o TXT. Las columnas se reconocen por variantes habituales del nombre (con/sin acentos, "Nº Empleado", etc.), no hace falta que coincidan exactamente.',
      'Si la persona ya existe (mismo número de empleado), se actualiza; si no existe, se crea. Si el Excel trae el Puesto EUS vacío para alguien que ya tenía uno guardado, se conserva el que ya había en vez de borrarlo.',
      'Modo especial "solo antigüedad": si el fichero importado únicamente tiene informadas las columnas Empleado y Antigüedad Puesto (todo lo demás vacío en todas las filas), la app entiende que es una actualización masiva de antigüedad y solo toca ese campo en las personas que ya existen; no crea personas nuevas ni modifica el resto de datos.',
      'El botón "Generar muestra" descarga un Excel de ejemplo con las columnas que reconoce el importador.',
    ],
  },
  {
    title: 'Traducción de puestos (EUS)',
    items: [
      '"Traducir puestos" abre la tabla de equivalencias Puesto (castellano) / Lanpostua (euskera) que usan Plantilla y Teletrabajo.',
      '"Actualizar puestos global" recorre toda la plantilla y rellena el Puesto EUS de quienes lo tengan vacío, usando esa tabla de traducciones; el botón muestra cuántos puestos EUS quedan pendientes.',
      'Conviene mantener esta tabla actualizada antes de importar la encuesta de Teletrabajo, porque ese importador la usa para resolver el puesto de cada persona.',
    ],
  },
  {
    title: 'Uso recomendado',
    items: [
      'Revisa primero que el número de empleado y el nombre completo estén correctamente informados.',
      'Usa las traducciones de puestos para completar automáticamente puestos EUS cuando falten.',
      'Exporta o imprime el listado filtrado cuando necesites una foto concreta de plantilla.',
    ],
  },
];

type SortKey =
  | 'empleado'
  | 'nombreApellidos'
  | 'puestoNomina'
  | 'puestoEus'
  | 'residencia'
  | 'unidad'
  | 'nivelRetributivo'
  | 'direccionOrganizativa';

type EmployeeTableColumnId = SortKey | 'actions';

const PLANTILLA_TABLE_STORAGE_KEY = 'traccion.tableView.plantilla.main';

const defaultPlantillaTablePreferences: TableViewPreferences<EmployeeTableColumnId> = {
  sort: { columnId: 'empleado', direction: 'asc' },
  columnWidths: {
    empleado: 105,
    nombreApellidos: 240,
    nivelRetributivo: 95,
    puestoNomina: 190,
    puestoEus: 190,
    residencia: 120,
    unidad: 150,
    direccionOrganizativa: 180,
    actions: 92,
  },
  columnOrder: null,
};

const plantillaTableColumnIds: EmployeeTableColumnId[] = [
  'empleado',
  'nombreApellidos',
  'nivelRetributivo',
  'puestoNomina',
  'puestoEus',
  'residencia',
  'unidad',
  'direccionOrganizativa',
  'actions',
];

const employeeExportColumns: ExportColumn<Employee>[] = [
  { key: 'empleado', header: 'Empleado', value: (employee) => employee.empleado },
  {
    key: 'nombreApellidos',
    header: 'Nombre y apellidos',
    value: (employee) => employee.nombreApellidos,
  },
  { key: 'nivelRetributivo', header: 'Nivel', value: (employee) => employee.nivelRetributivo },
  { key: 'puestoNomina', header: 'Puesto nómina', value: (employee) => employee.puestoNomina },
  { key: 'puestoEus', header: 'Puesto EUS', value: (employee) => employee.puestoEus || null },
  { key: 'residencia', header: 'Residencia', value: (employee) => employee.residencia },
  { key: 'unidad', header: 'Unidad', value: (employee) => employee.unidad || null },
  { key: 'direccionOrganizativa', header: 'Dirección organizativa', value: (employee) => employee.direccionOrganizativa || null },
  { key: 'antiguedadPuesto', header: 'Antigüedad puesto', value: (employee) => employee.antiguedadPuesto || null },
];

export function PlantillaPage() {
  const {
    employees,
    filters,
    importExcel,
    load,
    removeWithConcurrencyCheck,
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

  const deferredFilters = useDeferredValue(filters);

  const visibleEmployees = useMemo(
    () => employees.filter((employee) => !employee.deletedAt),
    [employees],
  );
  const filteredEmployees = useMemo(
    () => filterEmployees(employees, deferredFilters),
    [employees, deferredFilters],
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
  const direcciones = uniqueSorted(visibleEmployees.map((employee) => employee.direccionOrganizativa));
  const emptyPuestoEusCount = visibleEmployees.filter(
    (employee) => !employee.puestoEus.trim(),
  ).length;
  const employeeFilterLabel = buildFilterLabel([
    ['Búsqueda', filters.search],
    ['Residencia', filters.residencia],
    ['Nivel retributivo', filters.nivelRetributivo],
    ['Dirección', filters.direccionOrganizativa],
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
    filters.direccionOrganizativa
      ? { key: 'direccionOrganizativa', label: 'Dirección', value: filters.direccionOrganizativa, onClear: () => setFilter('direccionOrganizativa', '') }
      : null,
  ].filter((filter): filter is ActiveFilterChip => filter !== null);

  const clearActiveFilters = () => {
    setFilter('search', '');
    setFilter('residencia', '');
    setFilter('nivelRetributivo', '');
    setFilter('direccionOrganizativa', '');
  };

  const { preferences, setSort, setColumnWidth, setColumnOrder, resetColumnWidths, resetPreferences } =
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
        id: 'unidad',
        header: 'Unidad',
        accessor: (employee) => employee.unidad,
        render: (employee) => employee.unidad || '—',
        width: 150,
        minWidth: 110,
        maxWidth: 260,
        sortable: true,
        className: 'text-metro-muted',
      },
      {
        id: 'direccionOrganizativa',
        header: 'Dirección',
        accessor: (employee) => employee.direccionOrganizativa,
        render: (employee) => employee.direccionOrganizativa || '—',
        width: 180,
        minWidth: 130,
        maxWidth: 300,
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
              void (async () => {
                const result = await removeWithConcurrencyCheck(employee.empleado, JSON.stringify(employee));
                setImportMessage(result.message);
              })();
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
    [removeWithConcurrencyCheck],
  );

  const sortedEmployees = useMemo(
    () => sortDataTableRows(filteredEmployees, employeeTableColumns, preferences.sort),
    [employeeTableColumns, filteredEmployees, preferences.sort],
  );

  const handleGlobalJobPositionUpdate = async () => {
    try {
      const { updated, missing } = await updateEmptyEmployeeJobPositionTranslations();
      setImportMessage(
        `Puestos EUS actualizados: ${updated}. Sin traducción encontrada: ${missing}.`,
      );
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : 'No se han podido actualizar los puestos EUS.');
    }
  };

  const handleGenerateSampleExcel = async () => {
    try {
      const { default: ExcelJS } = await import('exceljs');
      const generatedAt = new Date();
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'TrAccion';
      workbook.created = generatedAt;
      workbook.modified = generatedAt;

      const worksheet = workbook.addWorksheet('Plantilla', {
        views: [{ state: 'frozen', ySplit: 1 }],
      });

      worksheet.columns = [
        { header: 'Empleado', key: 'empleado', width: 14 },
        { header: 'Nombre Apellidos', key: 'nombreApellidos', width: 32 },
        { header: 'Puesto Nomina', key: 'puestoNomina', width: 26 },
        { header: 'Puesto Organizativo', key: 'puestoOrganizativo', width: 26 },
        { header: 'Puesto EUS', key: 'puestoEus', width: 26 },
        { header: 'Residencia', key: 'residencia', width: 18 },
        { header: 'Unidad', key: 'unidad', width: 18 },
        { header: 'Nivel Retributivo', key: 'nivelRetributivo', width: 16 },
        { header: 'Direccion Organizativa', key: 'direccionOrganizativa', width: 26 },
        { header: 'Antiguedad Puesto', key: 'antiguedadPuesto', width: 18 },
        { header: 'Sexo', key: 'sexo', width: 10 },
        { header: 'Calle', key: 'calle', width: 26 },
        { header: 'Numero', key: 'numero', width: 10 },
        { header: 'Piso', key: 'piso', width: 10 },
        { header: 'Codigo Postal', key: 'codigoPostal', width: 14 },
        { header: 'Poblacion', key: 'poblacion', width: 18 },
        { header: 'Provincia', key: 'provincia', width: 18 },
        { header: 'NIF', key: 'nif', width: 14 },
      ];

      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).alignment = { horizontal: 'center', vertical: 'middle' };

      worksheet.addRow({
        empleado: '12345',
        nombreApellidos: 'Apellido1 Apellido2, Nombre',
        puestoNomina: 'Puesto según nómina',
        puestoOrganizativo: 'Puesto organizativo',
        puestoEus: 'Lanpostua euskaraz',
        residencia: 'Centro de trabajo',
        unidad: 'Unidad organizativa',
        nivelRetributivo: 'N3',
        direccionOrganizativa: 'Dirección/Área',
        antiguedadPuesto: '2020-01-01',
        sexo: 'M',
        calle: 'Nombre de la calle',
        numero: '1',
        piso: '2ºA',
        codigoPostal: '48001',
        poblacion: 'Bilbao',
        provincia: 'Bizkaia',
        nif: '00000000A',
      });

      const notesSheet = workbook.addWorksheet('Instrucciones');
      notesSheet.columns = [{ header: 'Campo', width: 26 }, { header: 'Uso', width: 82 }];
      notesSheet.addRows([
        ['Empleado', 'Obligatorio. Número de empleado; identifica a la persona y evita duplicados.'],
        ['Nombre Apellidos', 'Recomendado. Nombre completo de la persona.'],
        ['Puesto Nomina / Puesto Organizativo / Puesto EUS', 'Opcionales. Se usan en Teletrabajo para resolver el puesto de cada persona.'],
        ['Residencia', 'Opcional. Centro de trabajo.'],
        ['Unidad', 'Opcional. Unidad organizativa corta.'],
        ['Nivel Retributivo', 'Opcional.'],
        ['Direccion Organizativa', 'Opcional. Área o dirección a la que pertenece la persona.'],
        ['Antiguedad Puesto', 'Opcional. Fecha en formato AAAA-MM-DD.'],
        ['Sexo', 'Opcional.'],
        ['Calle, Numero, Piso, Codigo Postal, Poblacion, Provincia', 'Opcionales. Domicilio particular.'],
        ['NIF', 'Opcional.'],
        ['General', 'Los nombres de columnas admiten variantes habituales (con/sin acentos, "Nº Empleado", etc.). Fila de ejemplo: sustituir o borrar antes de importar.'],
      ]);
      notesSheet.getRow(1).font = { bold: true };

      const buffer = await workbook.xlsx.writeBuffer();
      await openWorkbookInExcel(buffer, buildStableExportFilename('muestra-plantilla', generatedAt));
      setImportMessage('Excel de muestra generado.');
    } catch (error) {
      setImportMessage(
        error instanceof Error ? error.message : 'No se ha podido generar el Excel de muestra.',
      );
    }
  };

  return (
    <section
      className="rounded-2xl border border-metro-border bg-metro-surface p-4 shadow-card"
      id="plantilla"
    >
      <div className="mb-3 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-metro-red">Módulo</p>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold text-metro-text">Plantilla</h2>
            <ModuleHelpButton
              title="Plantilla"
              subtitle="Guía rápida de mantenimiento de personas, importación Excel y uso transversal."
              sections={PLANTILLA_HELP_SECTIONS}
            />
          </div>
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

              try {
                const result = await importExcel(file);
                setImportMessage(
                  result.mode === 'antiguedadPuesto'
                    ? `Antigüedad actualizada: ${result.updated} personas. Ignoradas: ${result.ignored}.`
                    : `Importación completada: ${file.name}. Actualizadas: ${result.updated}. Creadas: ${result.created}.`,
                );
              } catch (error) {
                setImportMessage(error instanceof Error ? error.message : 'No se ha podido importar la plantilla.');
              } finally {
                event.target.value = '';
              }
            }}
            ref={fileInputRef}
            type="file"
          />
          <DropdownMenu
            icon={<Upload size={16} />}
            items={[
              {
                key: 'traducir-puestos',
                label: 'Traducir puestos',
                icon: <Languages size={14} />,
                onClick: () => setTranslationsModalOpen(true),
              },
              {
                key: 'actualizar-puestos-global',
                label:
                  emptyPuestoEusCount === 0
                    ? 'Actualizar puestos global (sin pendientes)'
                    : `Actualizar puestos global (${emptyPuestoEusCount} pendientes)`,
                icon: <RefreshCw size={14} />,
                disabled: emptyPuestoEusCount === 0,
                onClick: () => {
                  void handleGlobalJobPositionUpdate();
                },
              },
              {
                key: 'importar',
                label: 'Importar Excel',
                icon: <Upload size={14} />,
                onClick: () => fileInputRef.current?.click(),
              },
              {
                key: 'generar-muestra',
                label: 'Generar Excel de muestra',
                icon: <Download size={14} />,
                onClick: () => void handleGenerateSampleExcel(),
              },
            ]}
            label="Importar"
          />
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

      <div className="mb-3 grid grid-cols-[minmax(200px,1.3fr)_minmax(130px,0.8fr)_minmax(130px,0.8fr)] gap-2 overflow-x-auto rounded-xl border border-metro-border bg-metro-panel p-2">
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
        <SelectFilter
          label="Dirección"
          onChange={(value) => setFilter('direccionOrganizativa', value)}
          options={direcciones}
          value={filters.direccionOrganizativa}
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
                columns: reorderExportColumns(employeeExportColumns, preferences.columnOrder),
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
          columnOrder={preferences.columnOrder}
          columnWidths={preferences.columnWidths}
          onResetColumnWidths={resetColumnWidths}
          columns={employeeTableColumns}
          emptyMessage="No hay personas que coincidan con los filtros."
          getRowId={(employee) => employee.empleado}
          onColumnOrderChange={setColumnOrder}
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
