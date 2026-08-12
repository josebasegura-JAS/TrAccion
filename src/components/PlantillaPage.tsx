import {
  Download,
  Languages,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react';
import { useEffect, useDeferredValue, useMemo, useRef, useState } from 'react';
import { buildStableExportFilename, openWorkbookInExcel } from '../shared/export/tableExport';
import { EmployeeEditor } from './EmployeeEditor';
import { type ModuleHelpSection } from './ModuleHelp';
import { ActionButton } from './ui/ActionButton';
import { PageHeader } from './ui/PageHeader';
import { Toolbar } from './ui/Toolbar';
import { SearchField } from './ui/SearchField';
import { FilterSelect } from './ui/FilterSelect';
import { CountBadge } from './ui/CountBadge';
import { JobPositionTranslationsModal } from './JobPositionTranslationsModal';
import type { Employee } from '../features/plantilla/domain/employee';
import { uniqueSorted } from '../features/plantilla/domain/filters';
import { filterEmployees, useEmployeeStore } from '../features/plantilla/store/useEmployeeStore';
import { buildFilterLabel } from '../shared/export/filterLabel';
import { ActiveFilterChips, type ActiveFilterChip } from '../shared/filters/ActiveFilterChips';
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
      'Si la persona ya existe (mismo número de empleado), se actualiza; si no existe, se crea. Solo se actualizan las columnas que realmente vienen en el fichero: las columnas ausentes conservan el dato ya guardado.',
      'Modo especial "solo antigüedad": si el fichero importado únicamente tiene informadas las columnas Empleado y Antigüedad Puesto (todo lo demás vacío en todas las filas), la app entiende que es una actualización masiva de antigüedad y solo toca ese campo en las personas que ya existen; no crea personas nuevas ni modifica el resto de datos.',
      'El botón "Generar muestra" descarga un Excel de ejemplo con las columnas que reconoce el importador.',
    ],
  },
  {
    title: 'Traducción de puestos (EUS)',
    items: [
      '"Traducir puestos" abre la tabla de equivalencias Puesto (castellano) / Lanpostua (euskera) que usan Plantilla y Teletrabajo.',
      'Al importar Plantilla se aplica automáticamente la traducción EUS cuando ya existe una equivalencia. Desde "Traducciones EUS" puedes completar los puestos pendientes y actualizar la plantilla.',
      'Conviene mantener esta tabla actualizada antes de importar la encuesta de Teletrabajo, porque ese importador la usa para resolver el puesto de cada persona.',
    ],
  },
  {
    title: 'Uso recomendado',
    items: [
      'Usa Plantilla como fuente principal de personas: número de empleado, nombre y datos laborales deben mantenerse aquí para que el resto de módulos los reutilicen.',
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
  {
    key: 'direccionOrganizativa',
    header: 'Dirección organizativa',
    value: (employee) => employee.direccionOrganizativa || null,
  },
  {
    key: 'antiguedadPuesto',
    header: 'Antigüedad puesto',
    value: (employee) => employee.antiguedadPuesto || null,
  },
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
  const [importMessageIsError, setImportMessageIsError] = useState(false);
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
  const direcciones = uniqueSorted(
    visibleEmployees.map((employee) => employee.direccionOrganizativa),
  );
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
      ? {
          key: 'search',
          label: 'Búsqueda',
          value: filters.search.trim(),
          onClear: () => setFilter('search', ''),
        }
      : null,
    filters.residencia
      ? {
          key: 'residencia',
          label: 'Residencia',
          value: filters.residencia,
          onClear: () => setFilter('residencia', ''),
        }
      : null,
    filters.nivelRetributivo
      ? {
          key: 'nivelRetributivo',
          label: 'Nivel retributivo',
          value: filters.nivelRetributivo,
          onClear: () => setFilter('nivelRetributivo', ''),
        }
      : null,
    filters.direccionOrganizativa
      ? {
          key: 'direccionOrganizativa',
          label: 'Dirección',
          value: filters.direccionOrganizativa,
          onClear: () => setFilter('direccionOrganizativa', ''),
        }
      : null,
  ].filter((filter): filter is ActiveFilterChip => filter !== null);

  const clearActiveFilters = () => {
    setFilter('search', '');
    setFilter('residencia', '');
    setFilter('nivelRetributivo', '');
    setFilter('direccionOrganizativa', '');
  };

  const {
    preferences,
    setSort,
    setColumnWidth,
    setColumnOrder,
    resetColumnWidths,
    resetPreferences,
  } = useTableViewPreferences<EmployeeTableColumnId>({
    storageKey: PLANTILLA_TABLE_STORAGE_KEY,
    defaultPreferences: defaultPlantillaTablePreferences,
    validColumnIds: plantillaTableColumnIds,
  });

  const employeeTableColumns = useMemo<Array<DataTableColumn<Employee, EmployeeTableColumnId>>>(
    () => [
      {
        id: 'empleado',
        header: 'Empleado',
        tone: 'identity',
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
          <ActionButton
            iconOnly={false}
            onClick={(event) => {
              event.stopPropagation();
              void (async () => {
                const result = await removeWithConcurrencyCheck(
                  employee.empleado,
                  JSON.stringify(employee),
                );
                setImportMessage(result.message);
              })();
            }}
            size="sm"
            variant="delete"
          >
            Eliminar
          </ActionButton>
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
      notesSheet.columns = [
        { header: 'Campo', width: 26 },
        { header: 'Uso', width: 82 },
      ];
      notesSheet.addRows([
        [
          'Empleado',
          'Obligatorio. Número de empleado; identifica a la persona y evita duplicados.',
        ],
        ['Nombre Apellidos', 'Recomendado. Nombre completo de la persona.'],
        [
          'Puesto Nomina / Puesto Organizativo / Puesto EUS',
          'Opcionales. Se usan en Teletrabajo para resolver el puesto de cada persona.',
        ],
        ['Residencia', 'Opcional. Centro de trabajo.'],
        ['Unidad', 'Opcional. Unidad organizativa corta.'],
        ['Nivel Retributivo', 'Opcional.'],
        ['Direccion Organizativa', 'Opcional. Área o dirección a la que pertenece la persona.'],
        ['Antiguedad Puesto', 'Opcional. Fecha en formato AAAA-MM-DD.'],
        ['Sexo', 'Opcional.'],
        [
          'Calle, Numero, Piso, Codigo Postal, Poblacion, Provincia',
          'Opcionales. Domicilio particular.',
        ],
        ['NIF', 'Opcional.'],
        [
          'General',
          'Los nombres de columnas admiten variantes habituales (con/sin acentos, "Nº Empleado", etc.). Fila de ejemplo: sustituir o borrar antes de importar.',
        ],
      ]);
      notesSheet.getRow(1).font = { bold: true };

      const buffer = await workbook.xlsx.writeBuffer();
      await openWorkbookInExcel(
        buffer,
        buildStableExportFilename('muestra-plantilla', generatedAt),
      );
      setImportMessage('Excel de muestra generado.');
    } catch (error) {
      setImportMessage(
        error instanceof Error ? error.message : 'No se ha podido generar el Excel de muestra.',
      );
    }
  };

  return (
    <section
      className="space-y-3"
      id="plantilla"
    >
      <PageHeader
        actions={
          <Toolbar
            filters={
              <>
                <SearchField
                  onChange={(event) => setFilter('search', event.target.value)}
                  onClear={() => setFilter('search', '')}
                  placeholder="Buscar por empleado o nombre..."
                  value={filters.search}
                  wrapperClassName="min-w-[280px]"
                />
                <FilterSelect
                  allLabel="Todas las residencias"
                  aria-label="Filtrar plantilla por residencia"
                  onChange={(event) => setFilter('residencia', event.target.value)}
                  options={residencias}
                  value={filters.residencia}
                  wrapperClassName="w-[190px]"
                />
                <FilterSelect
                  allLabel="Todos los niveles"
                  aria-label="Filtrar plantilla por nivel retributivo"
                  onChange={(event) => setFilter('nivelRetributivo', event.target.value)}
                  options={niveles}
                  value={filters.nivelRetributivo}
                  wrapperClassName="w-[190px]"
                />
                <FilterSelect
                  allLabel="Todas las direcciones"
                  aria-label="Filtrar plantilla por dirección"
                  onChange={(event) => setFilter('direccionOrganizativa', event.target.value)}
                  options={direcciones}
                  value={filters.direccionOrganizativa}
                  wrapperClassName="w-[190px]"
                />
              </>
            }
            actions={
              <>
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
                  setImportMessageIsError(false);
                  setImportMessage(
                    result.mode === 'antiguedadPuesto'
                      ? `Antigüedad actualizada: ${result.updated} personas. Ignoradas: ${result.ignored}.`
                      : `Importación completada: ${file.name}. Actualizadas: ${result.updated}. Creadas: ${result.created}.`,
                  );
                } catch (error) {
                  setImportMessageIsError(true);
                  setImportMessage(
                    error instanceof Error
                      ? error.message
                      : 'No se ha podido importar la plantilla.',
                  );
                } finally {
                  event.target.value = '';
                }
              }}
              ref={fileInputRef}
              type="file"
            />
            <ActionButton
              iconOnly={false}
              onClick={() => fileInputRef.current?.click()}
              size="sm"
              variant="import"
            >
              Importar Excel
            </ActionButton>
            <ActionButton
              icon={Languages}
              iconOnly={false}
              onClick={() => setTranslationsModalOpen(true)}
              size="sm"
              title={
                emptyPuestoEusCount === 0
                  ? 'Traducciones de puestos EUS'
                  : `${emptyPuestoEusCount} personas tienen el Puesto EUS pendiente`
              }
              variant="secondary"
            >
              Traducciones EUS{emptyPuestoEusCount > 0 ? ` (${emptyPuestoEusCount})` : ''}
            </ActionButton>
            <ActionButton
              icon={Download}
              iconOnly={false}
              onClick={() => void handleGenerateSampleExcel()}
              size="sm"
              title="Generar un Excel de muestra compatible con Plantilla"
              variant="secondary"
            >
              Muestra
            </ActionButton>
            <ActionButton iconOnly={false} onClick={openCreateEditor} size="sm" variant="add">
              Nueva persona
            </ActionButton>
              </>
            }
          />
        }
        helpSections={PLANTILLA_HELP_SECTIONS}
        helpSubtitle="Guía rápida de mantenimiento de personas, importación Excel y uso transversal."
        title="Plantilla"
      />

      {importMessage && (
        <div
          className={
            importMessageIsError
              ? 'mb-3 rounded-xl border border-metro-red/40 bg-metro-red/10 px-3 py-2 text-sm font-semibold text-red-200'
              : 'mb-3 rounded-xl border border-metro-success/30 bg-metro-success/10 px-3 py-2 text-sm font-semibold text-emerald-200'
          }
        >
          {importMessage}
        </div>
      )}

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
            <CountBadge>{filteredEmployees.length} registros</CountBadge>
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
