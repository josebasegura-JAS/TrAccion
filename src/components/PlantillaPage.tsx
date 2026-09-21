import {
  BriefcaseBusiness,
  Building2,
  ChevronLeft,
  ChevronRight,
  Download,
  Languages,
  Layers3,
  MapPin,
  RotateCcw,
  SlidersHorizontal,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useDeferredValue, useMemo, useRef, useState } from 'react';
import { buildStableExportFilename, openWorkbookInExcel } from '../shared/export/tableExport';
import { EmployeeEditor } from './EmployeeEditor';
import { type ModuleHelpSection } from './ModuleHelp';
import { ActionButton } from './ui/ActionButton';
import { PageHeader } from './ui/PageHeader';
import { SearchField } from './ui/SearchField';
import { FilterSelect } from './ui/FilterSelect';
import { CountBadge } from './ui/CountBadge';
import { JobPositionTranslationsModal } from './JobPositionTranslationsModal';
import { EmployeeImportPreviewModal } from './EmployeeImportPreviewModal';
import type { Employee, EmployeeField } from '../features/plantilla/domain/employee';
import { analyzeEmployeeImportFile, type EmployeeImportPreview } from '../features/plantilla/domain/importExcel';
import { uniqueSorted } from '../features/plantilla/domain/filters';
import { filterEmployees, useEmployeeStore, type EmployeeImportConflictResolution } from '../features/plantilla/store/useEmployeeStore';
import { buildFilterLabel } from '../shared/export/filterLabel';
import { ActiveFilterChips, type ActiveFilterChip } from '../shared/filters/ActiveFilterChips';
import type { ExportColumn } from '../shared/export/types';
import { reorderExportColumns } from '../shared/export/reorderExportColumns';
import { ExportPrintButtons } from '../shared/print/ExportPrintButtons';
import { DataTable, type DataTableColumn } from '../shared/table/DataTable';
import { sortDataTableRows } from '../shared/table/tableSorting';
import { type TableViewPreferences, useTableViewPreferences } from '../shared/table/useTableViewPreferences';

const PLANTILLA_HELP_SECTIONS: ModuleHelpSection[] = [
  { title: 'Para qué sirve', items: ['Mantiene la relación base de personas que utiliza el resto de módulos (Teletrabajo, Ticket Restaurante, etc.).','Permite alta manual, edición, búsqueda, filtros y borrado lógico sin perder trazabilidad.','La importación Excel actualiza datos de plantilla y evita tener que introducir personas una a una.'] },
  { title: 'Importación de personas', items: ['El fichero de Datos personales se importa directamente tal como se obtiene del sistema, sin preparar ni mapear columnas.','Para obtenerlo sigue esta ruta: Lanzador → Expediente Personal → Consultas Generales → Datos personales.','TrAccion compara el fichero con la Plantilla actual y muestra antes de confirmar las altas, cambios, reactivaciones y bajas detectadas. Cada dato diferente permite elegir entre mantener el valor actual o usar el del fichero; por defecto se conserva el dato actual.','Las personas que ya no aparezcan en el fichero se dan de baja lógicamente al confirmar, conservando sus históricos. Si reaparecen en una importación posterior, se reactivan.','Solo se toman del fichero los campos de Plantilla acordados; el resto de columnas se ignora y los datos propios de TrAccion, como Puesto EUS o Antigüedad Puesto, se conservan.','Otros Excel, CSV, TSV o TXT siguen admitiendo el mapeo flexible de columnas por variantes habituales del nombre.','Si la persona ya existe (mismo número de empleado), se actualiza; si no existe, se crea. Solo se actualizan las columnas que realmente vienen en el fichero: las columnas ausentes conservan el dato ya guardado.','Modo especial "solo antigüedad": si el fichero importado únicamente tiene informadas las columnas Empleado y Antigüedad Puesto (todo lo demás vacío en todas las filas), la app entiende que es una actualización masiva de antigüedad y solo toca ese campo en las personas que ya existen; no crea personas nuevas ni modifica el resto de datos.','En ficheros genéricos se mantiene la revisión de columnas: las reconocidas se enlazan automáticamente y las no reconocidas pueden asignarse manualmente o ignorarse.','El botón "Generar muestra" descarga un Excel de ejemplo con las columnas que reconoce el importador.'] },
  { title: 'Traducción de puestos (EUS)', items: ['"Traducir puestos" abre la tabla de equivalencias Puesto (castellano) / Lanpostua (euskera) que usan Plantilla y Teletrabajo.','Al importar Plantilla se aplica automáticamente la traducción EUS cuando ya existe una equivalencia. Desde "Traducciones EUS" puedes completar los puestos pendientes y actualizar la plantilla.','Conviene mantener esta tabla actualizada antes de importar la encuesta de Teletrabajo, porque ese importador la usa para resolver el puesto de cada persona.'] },
  { title: 'Ficha de persona', items: ['Al abrir una persona, la ficha agrupa los datos en Identificación, Puesto y organización, Datos personales y dirección y Campos derivados.','El número de empleado es la clave única y no se puede modificar una vez creada la persona.','Los Campos derivados son informativos y se calculan a partir de otros datos de Plantilla; no se editan directamente.','Guardar conserva los cambios de la ficha; Cancelar respeta el aviso de cambios sin guardar y Eliminar mantiene las comprobaciones habituales de la aplicación.'] },
  { title: 'Flujo recomendado', ordered: true, items: ['Importar o actualizar la Plantilla desde el Excel maestro de personas.','Si es el fichero de Datos personales, revisar el resumen de altas, cambios, reactivaciones y bajas; si es un fichero genérico, revisar el mapeo de columnas antes de confirmar.','Comprobar traducciones EUS pendientes para completar puestos que falten.','Usar la tabla filtrada como referencia maestra y exportarla solo cuando necesites compartir una foto concreta de la plantilla.'] },
];

type SortKey = 'empleado' | 'nombreApellidos' | 'email' | 'puestoNomina' | 'puestoEus' | 'residencia' | 'unidad' | 'nivelRetributivo' | 'direccionOrganizativa';
type EmployeeTableColumnId = SortKey | 'actions';
const PLANTILLA_TABLE_STORAGE_KEY = 'traccion.tableView.plantilla.main';
const defaultPlantillaTablePreferences: TableViewPreferences<EmployeeTableColumnId> = {
  sort: { columnId: 'empleado', direction: 'asc' },
  columnWidths: { empleado: 105, nombreApellidos: 220, email: 220, nivelRetributivo: 95, puestoNomina: 180, puestoEus: 180, residencia: 120, unidad: 150, direccionOrganizativa: 180, actions: 92 },
  columnOrder: null,
};
const plantillaTableColumnIds: EmployeeTableColumnId[] = ['empleado','nombreApellidos','email','nivelRetributivo','puestoNomina','puestoEus','residencia','unidad','direccionOrganizativa','actions'];

function PlantillaMetricCard({ icon: Icon, label, value, detail, tone }: { icon: LucideIcon; label: string; value: number; detail: string; tone: 'sky' | 'emerald' | 'violet' | 'amber' | 'rose' }) {
  const toneClasses = { sky: 'border-sky-400/25 bg-[linear-gradient(135deg,rgba(14,65,111,0.72),rgba(12,34,59,0.92))] text-sky-200', emerald: 'border-emerald-400/25 bg-[linear-gradient(135deg,rgba(5,91,74,0.58),rgba(12,34,59,0.92))] text-emerald-200', violet: 'border-violet-400/25 bg-[linear-gradient(135deg,rgba(76,45,130,0.58),rgba(12,34,59,0.92))] text-violet-200', amber: 'border-amber-400/25 bg-[linear-gradient(135deg,rgba(120,82,18,0.54),rgba(12,34,59,0.92))] text-amber-200', rose: 'border-rose-400/25 bg-[linear-gradient(135deg,rgba(121,38,57,0.58),rgba(12,34,59,0.92))] text-rose-200' }[tone];
  return <div className={`relative overflow-hidden rounded-2xl border px-4 py-3 shadow-[0_12px_26px_rgba(2,6,23,0.22)] ${toneClasses}`}><div className="flex items-center gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/10 bg-black/10"><Icon size={21} /></span><div className="min-w-0"><div className="text-[23px] font-black leading-none text-white">{value}</div><div className="mt-1 truncate text-[11px] font-extrabold text-slate-100">{label}</div><div className="mt-1 truncate text-[10px] font-medium text-slate-400">{detail}</div></div></div></div>;
}

const employeeExportColumns: ExportColumn<Employee>[] = [
  { key: 'empleado', header: 'Empleado', value: (employee) => employee.empleado },
  { key: 'nombreApellidos', header: 'Nombre y apellidos', value: (employee) => employee.nombreApellidos },
  { key: 'email', header: 'Correo electrónico', value: (employee) => employee.email || null },
  { key: 'nivelRetributivo', header: 'Nivel', value: (employee) => employee.nivelRetributivo },
  { key: 'puestoNomina', header: 'Puesto nómina', value: (employee) => employee.puestoNomina },
  { key: 'puestoEus', header: 'Puesto EUS', value: (employee) => employee.puestoEus || null },
  { key: 'residencia', header: 'Residencia', value: (employee) => employee.residencia },
  { key: 'unidad', header: 'Unidad', value: (employee) => employee.unidad || null },
  { key: 'direccionOrganizativa', header: 'Dirección organizativa', value: (employee) => employee.direccionOrganizativa || null },
  { key: 'antiguedadPuesto', header: 'Antigüedad puesto', value: (employee) => employee.antiguedadPuesto || null },
];

export function PlantillaPage() {
  const { employees, filters, importExcel, load, removeWithConcurrencyCheck, selectEmployee, setFilter } = useEmployeeStore();
  const [editorMode, setEditorMode] = useState<'create' | 'edit' | null>(null);
  const [isTranslationsModalOpen, setTranslationsModalOpen] = useState(false);
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState('');
  const [importMessageIsError, setImportMessageIsError] = useState(false);
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<EmployeeImportPreview | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const fileInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { load(); }, [load]);
  const deferredFilters = useDeferredValue(filters);
  const visibleEmployees = useMemo(() => employees.filter((employee) => !employee.deletedAt), [employees]);
  const filteredEmployees = useMemo(() => filterEmployees(employees, deferredFilters), [employees, deferredFilters]);
  const editorEmployee = editorMode === 'edit' ? (visibleEmployees.find((employee) => employee.empleado === editingEmployeeId) ?? null) : null;
  const openEditor = (employee: Employee) => { selectEmployee(employee.empleado); setEditingEmployeeId(employee.empleado); setEditorMode('edit'); };
  const openCreateEditor = () => { setEditingEmployeeId(null); setEditorMode('create'); };
  const closeEditor = () => { setEditorMode(null); setEditingEmployeeId(null); };
  const residencias = uniqueSorted(visibleEmployees.map((employee) => employee.residencia));
  const niveles = uniqueSorted(visibleEmployees.map((employee) => employee.nivelRetributivo));
  const direcciones = uniqueSorted(visibleEmployees.map((employee) => employee.direccionOrganizativa));
  const puestosNomina = uniqueSorted(visibleEmployees.map((employee) => employee.puestoNomina));
  const emptyPuestoEusCount = visibleEmployees.filter((employee) => !employee.puestoEus.trim()).length;
  const employeeFilterLabel = buildFilterLabel([['Búsqueda', filters.search],['Residencia', filters.residencia],['Nivel retributivo', filters.nivelRetributivo],['Dirección', filters.direccionOrganizativa]]);
  const activeFilterChips: ActiveFilterChip[] = [
    filters.search.trim() ? { key: 'search', label: 'Búsqueda', value: filters.search.trim(), onClear: () => setFilter('search', '') } : null,
    filters.residencia ? { key: 'residencia', label: 'Residencia', value: filters.residencia, onClear: () => setFilter('residencia', '') } : null,
    filters.nivelRetributivo ? { key: 'nivelRetributivo', label: 'Nivel', value: filters.nivelRetributivo, onClear: () => setFilter('nivelRetributivo', '') } : null,
    filters.direccionOrganizativa ? { key: 'direccionOrganizativa', label: 'Dirección', value: filters.direccionOrganizativa, onClear: () => setFilter('direccionOrganizativa', '') } : null,
  ].filter((chip): chip is ActiveFilterChip => chip !== null);

  const clearActiveFilters = () => {
    setFilter('search', ''); setFilter('residencia', ''); setFilter('nivelRetributivo', ''); setFilter('direccionOrganizativa', '');
  };

  const { preferences, setSort, setColumnWidth, setColumnOrder, resetColumnWidths, resetPreferences } = useTableViewPreferences<EmployeeTableColumnId>({ storageKey: PLANTILLA_TABLE_STORAGE_KEY, defaultPreferences: defaultPlantillaTablePreferences, validColumnIds: plantillaTableColumnIds });

  const employeeTableColumns = useMemo<Array<DataTableColumn<Employee, EmployeeTableColumnId>>>(() => [
    { id: 'empleado', header: 'Empleado', tone: 'identity', accessor: (employee) => { const employeeNumber = Number(employee.empleado.trim()); return Number.isFinite(employeeNumber) ? employeeNumber : employee.empleado; }, render: (employee) => employee.empleado, width: 105, minWidth: 90, maxWidth: 180, sortable: true, className: 'font-semibold text-metro-text' },
    { id: 'nombreApellidos', header: 'Nombre y apellidos', accessor: (employee) => employee.nombreApellidos, render: (employee) => employee.nombreApellidos, width: 220, minWidth: 170, maxWidth: 420, sortable: true, className: 'text-metro-text' },
    { id: 'email', header: 'Correo electrónico', accessor: (employee) => employee.email, render: (employee) => employee.email || '—', width: 220, minWidth: 170, maxWidth: 380, sortable: true, className: 'text-metro-muted' },
    { id: 'nivelRetributivo', header: 'Nivel', accessor: (employee) => employee.nivelRetributivo, render: (employee) => employee.nivelRetributivo, width: 95, minWidth: 75, maxWidth: 160, sortable: true, className: 'text-metro-muted' },
    { id: 'puestoNomina', header: 'Puesto nómina', accessor: (employee) => employee.puestoNomina, render: (employee) => employee.puestoNomina, width: 190, minWidth: 145, maxWidth: 360, sortable: true, className: 'text-metro-muted' },
    { id: 'puestoEus', header: 'Puesto EUS', accessor: (employee) => employee.puestoEus, render: (employee) => employee.puestoEus || '—', width: 190, minWidth: 145, maxWidth: 360, sortable: true, className: 'text-metro-muted' },
    { id: 'residencia', header: 'Residencia', accessor: (employee) => employee.residencia, render: (employee) => employee.residencia, width: 120, minWidth: 95, maxWidth: 220, sortable: true, className: 'text-metro-muted' },
    { id: 'unidad', header: 'Unidad', accessor: (employee) => employee.unidad, render: (employee) => employee.unidad || '—', width: 150, minWidth: 110, maxWidth: 260, sortable: true, className: 'text-metro-muted' },
    { id: 'direccionOrganizativa', header: 'Dirección', accessor: (employee) => employee.direccionOrganizativa, render: (employee) => employee.direccionOrganizativa || '—', width: 180, minWidth: 130, maxWidth: 300, sortable: true, className: 'text-metro-muted' },
    { id: 'actions', header: 'Acciones', render: (employee) => <ActionButton iconOnly={false} onClick={(event) => { event.stopPropagation(); void (async () => { const result = await removeWithConcurrencyCheck(employee.empleado, JSON.stringify(employee)); setImportMessage(result.message); })(); }} size="sm" variant="delete">Eliminar</ActionButton>, width: 92, minWidth: 84, maxWidth: 120, resizable: false, isActionColumn: true, className: 'whitespace-nowrap' },
  ], [removeWithConcurrencyCheck]);

  const sortedEmployees = useMemo(() => sortDataTableRows(filteredEmployees, employeeTableColumns, preferences.sort), [employeeTableColumns, filteredEmployees, preferences.sort]);
  const totalPages = Math.max(1, Math.ceil(sortedEmployees.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStart = (safeCurrentPage - 1) * pageSize;
  const pageEnd = Math.min(pageStart + pageSize, sortedEmployees.length);
  const paginatedEmployees = useMemo(() => sortedEmployees.slice(pageStart, pageEnd), [pageEnd, pageStart, sortedEmployees]);
  useEffect(() => { setCurrentPage(1); }, [deferredFilters, pageSize, preferences.sort]);

  const handleGenerateSampleExcel = async () => {
    try {
      const { default: ExcelJS } = await import('exceljs');
      const generatedAt = new Date();
      const workbook = new ExcelJS.Workbook(); workbook.creator = 'TrAccion'; workbook.created = generatedAt; workbook.modified = generatedAt;
      const worksheet = workbook.addWorksheet('Plantilla', { views: [{ state: 'frozen', ySplit: 1 }] });
      worksheet.columns = [
        { header: 'Empleado', key: 'empleado', width: 14 }, { header: 'Nombre Apellidos', key: 'nombreApellidos', width: 32 }, { header: 'Email', key: 'email', width: 32 },
        { header: 'Puesto Nomina', key: 'puestoNomina', width: 26 }, { header: 'Puesto Organizativo', key: 'puestoOrganizativo', width: 26 }, { header: 'Puesto EUS', key: 'puestoEus', width: 26 },
        { header: 'Residencia', key: 'residencia', width: 18 }, { header: 'Unidad', key: 'unidad', width: 18 }, { header: 'Nivel Retributivo', key: 'nivelRetributivo', width: 16 },
        { header: 'Direccion Organizativa', key: 'direccionOrganizativa', width: 26 }, { header: 'Antiguedad Puesto', key: 'antiguedadPuesto', width: 18 }, { header: 'Sexo', key: 'sexo', width: 10 },
        { header: 'Calle', key: 'calle', width: 26 }, { header: 'Numero', key: 'numero', width: 10 }, { header: 'Piso', key: 'piso', width: 10 }, { header: 'Codigo Postal', key: 'codigoPostal', width: 14 },
        { header: 'Poblacion', key: 'poblacion', width: 18 }, { header: 'Provincia', key: 'provincia', width: 18 }, { header: 'NIF', key: 'nif', width: 14 }, { header: 'Telefono 1', key: 'telefono1', width: 18 }, { header: 'Telefono 2', key: 'telefono2', width: 18 },
      ];
      worksheet.getRow(1).font = { bold: true }; worksheet.getRow(1).alignment = { horizontal: 'center', vertical: 'middle' };
      worksheet.addRow({ empleado: '12345', nombreApellidos: 'Apellido1 Apellido2, Nombre', email: 'nombre.apellidos@empresa.es', puestoNomina: 'Puesto según nómina', puestoOrganizativo: 'Puesto organizativo', puestoEus: 'Lanpostua euskaraz', residencia: 'Centro de trabajo', unidad: 'Unidad organizativa', nivelRetributivo: 'N3', direccionOrganizativa: 'Dirección/Área', antiguedadPuesto: '2020-01-01', sexo: 'M', calle: 'Nombre de la calle', numero: '1', piso: '2ºA', codigoPostal: '48001', poblacion: 'Bilbao', provincia: 'Bizkaia', nif: '00000000A', telefono1: '944000000', telefono2: '600000000' });
      const notesSheet = workbook.addWorksheet('Instrucciones');
      notesSheet.columns = [{ header: 'Campo', width: 26 }, { header: 'Uso', width: 82 }];
      notesSheet.addRows([
        ['Empleado', 'Obligatorio. Número de empleado; identifica a la persona y evita duplicados.'], ['Nombre Apellidos', 'Recomendado. Nombre completo de la persona.'], ['Email', 'Opcional. Correo electrónico; Ayuda escolar puede completarlo automáticamente cuando esté vacío.'],
        ['Puesto Nomina / Puesto Organizativo / Puesto EUS', 'Opcionales. Se usan en Teletrabajo para resolver el puesto de cada persona.'], ['Residencia', 'Opcional. Centro de trabajo.'], ['Unidad', 'Opcional. Unidad organizativa corta.'], ['Nivel Retributivo', 'Opcional.'], ['Direccion Organizativa', 'Opcional. Área o dirección a la que pertenece la persona.'], ['Antiguedad Puesto', 'Opcional. Fecha en formato AAAA-MM-DD.'], ['Sexo', 'Opcional.'], ['Calle, Numero, Piso, Codigo Postal, Poblacion, Provincia', 'Opcionales. Domicilio particular.'], ['NIF', 'Opcional.'], ['Telefono 1 / Telefono 2', 'Opcionales. Se importan y quedan visibles en la cabecera de la ficha de persona.'], ['General', 'Los nombres de columnas admiten variantes habituales. Fila de ejemplo: sustituir o borrar antes de importar.'],
      ]);
      notesSheet.getRow(1).font = { bold: true };
      const buffer = await workbook.xlsx.writeBuffer();
      await openWorkbookInExcel(buffer, buildStableExportFilename('muestra-plantilla', generatedAt));
      setImportMessage('Excel de muestra generado.');
      setImportMessageIsError(false);
    } catch (error) {
      setImportMessageIsError(true);
      setImportMessage(error instanceof Error ? error.message : 'No se ha podido generar el Excel de muestra.');
    }
  };

  return (
    <section className="space-y-3" id="plantilla">
      <PageHeader helpSections={PLANTILLA_HELP_SECTIONS} helpSubtitle="Guía rápida de mantenimiento de personas, importación Excel y uso transversal." title="Plantilla" />
      <div className="grid grid-cols-5 gap-2.5">
        <PlantillaMetricCard detail="Registros activos" icon={UsersRound} label="Personas en plantilla" tone="sky" value={visibleEmployees.length} />
        <PlantillaMetricCard detail="Centros de trabajo distintos" icon={MapPin} label="Residencias" tone="emerald" value={residencias.length} />
        <PlantillaMetricCard detail="Según nivel retributivo" icon={Layers3} label="Niveles profesionales" tone="violet" value={niveles.length} />
        <PlantillaMetricCard detail="Puestos de nómina distintos" icon={BriefcaseBusiness} label="Puestos diferentes" tone="amber" value={puestosNomina.length} />
        <PlantillaMetricCard detail="Personas sin traducción de puesto" icon={Languages} label="Puesto EUS pendiente" tone="rose" value={emptyPuestoEusCount} />
      </div>
      <div className="rounded-2xl border border-metro-border/80 bg-metro-panel/55 p-2.5 shadow-sm shadow-slate-950/20">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <SearchField onChange={(event) => setFilter('search', event.target.value)} onClear={() => setFilter('search', '')} placeholder="Buscar por empleado, nombre o correo..." value={filters.search} wrapperClassName="min-w-[300px] flex-1" />
            <FilterSelect allLabel="Todas las residencias" aria-label="Filtrar plantilla por residencia" onChange={(event) => setFilter('residencia', event.target.value)} options={residencias} value={filters.residencia} wrapperClassName="w-[190px]" />
            <FilterSelect allLabel="Todos los niveles" aria-label="Filtrar plantilla por nivel retributivo" onChange={(event) => setFilter('nivelRetributivo', event.target.value)} options={niveles} value={filters.nivelRetributivo} wrapperClassName="w-[180px]" />
            <FilterSelect allLabel="Todas las direcciones" aria-label="Filtrar plantilla por dirección" onChange={(event) => setFilter('direccionOrganizativa', event.target.value)} options={direcciones} value={filters.direccionOrganizativa} wrapperClassName="w-[190px]" />
          </div>
          <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
            <input accept=".xlsx,.xls,.csv,.tsv,.txt" className="hidden" onChange={async (event) => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; try { const preview = await analyzeEmployeeImportFile(file); setImportMessage(''); setImportMessageIsError(false); setPendingImportFile(file); setImportPreview(preview); } catch (error) { setImportMessageIsError(true); setImportMessage(error instanceof Error ? error.message : 'No se ha podido analizar la plantilla.'); } }} ref={fileInputRef} type="file" />
            <ActionButton iconOnly={false} onClick={() => fileInputRef.current?.click()} size="sm" variant="import">Importar Excel</ActionButton>
            <ActionButton icon={Languages} iconOnly={false} onClick={() => setTranslationsModalOpen(true)} size="sm" title={emptyPuestoEusCount === 0 ? 'Traducciones de puestos EUS' : `${emptyPuestoEusCount} personas tienen el Puesto EUS pendiente`} variant="secondary">Traducciones EUS{emptyPuestoEusCount > 0 ? ` (${emptyPuestoEusCount})` : ''}</ActionButton>
            <ActionButton icon={Download} iconOnly={false} onClick={() => void handleGenerateSampleExcel()} size="sm" title="Generar un Excel de muestra compatible con Plantilla" variant="secondary">Muestra</ActionButton>
            <ActionButton iconOnly={false} onClick={openCreateEditor} size="sm" variant="add">Nueva persona</ActionButton>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-300/10 bg-[#0e2239]/70 px-3 py-2 text-[11px] shadow-sm shadow-slate-950/15">
        <div className="flex min-w-0 items-center gap-2 text-slate-300"><Building2 className="shrink-0 text-sky-300" size={15} /><span className="font-bold text-slate-200">Dónde obtener el Excel:</span><span className="truncate text-slate-400">Lanzador → Expediente Personal → Consultas Generales → Datos personales</span></div>
        {activeFilterChips.length > 0 && <button className="inline-flex items-center gap-1 rounded-lg border border-metro-border bg-metro-panel px-2.5 py-1 text-[10px] font-bold text-metro-muted hover:border-metro-red hover:text-metro-text" onClick={clearActiveFilters} type="button"><RotateCcw size={12} /> Limpiar filtros</button>}
      </div>
      {importMessage && <div className={importMessageIsError ? 'rounded-xl border border-metro-red/40 bg-metro-red/10 px-3 py-2 text-sm font-semibold text-red-200' : 'rounded-xl border border-metro-success/30 bg-metro-success/10 px-3 py-2 text-sm font-semibold text-emerald-200'}>{importMessage}</div>}
      {activeFilterChips.length > 0 && <ActiveFilterChips filters={activeFilterChips} onClearAll={clearActiveFilters} />}
      <div className="overflow-hidden rounded-2xl border border-metro-border bg-[#0d2036]/80 shadow-[0_14px_34px_rgba(2,6,23,0.24)]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-metro-border bg-[#11243a]/95 px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-metro-text"><SlidersHorizontal size={16} className="text-metro-red" /><span>Personas en plantilla</span><CountBadge>{filteredEmployees.length} registros</CountBadge></div>
          <div className="flex flex-wrap items-center gap-2"><ExportPrintButtons payload={{ title: 'Personas en plantilla', filename: 'plantilla-personas', columns: reorderExportColumns(employeeExportColumns, preferences.columnOrder), rows: sortedEmployees, filterLabel: employeeFilterLabel }} /><button className="inline-flex items-center gap-1 rounded-lg border border-metro-border bg-metro-panel px-2.5 py-1.5 text-xs font-semibold text-metro-muted hover:border-metro-red hover:text-metro-text" onClick={resetPreferences} type="button"><RotateCcw size={14} /> Restablecer vista</button></div>
        </div>
        <DataTable ariaLabel="Personas en plantilla" columnOrder={preferences.columnOrder} columnWidths={preferences.columnWidths} onResetColumnWidths={resetColumnWidths} columns={employeeTableColumns} emptyMessage="No hay personas que coincidan con los filtros." getRowId={(employee) => employee.empleado} onColumnOrderChange={setColumnOrder} onColumnWidthChange={setColumnWidth} onRowClick={openEditor} onSortChange={setSort} rowClassName={() => 'cursor-pointer hover:bg-sky-400/[0.07]'} rows={paginatedEmployees} sort={preferences.sort} strongZebra maxHeightClassName="max-h-none" />
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-metro-border bg-[#102238]/90 px-3 py-2.5">
          <span className="text-[11px] font-medium text-slate-400">{sortedEmployees.length === 0 ? 'Sin registros' : `Mostrando ${pageStart + 1}–${pageEnd} de ${sortedEmployees.length} personas`}</span>
          <div className="flex items-center gap-2">
            <button aria-label="Página anterior" className="grid h-8 w-8 place-items-center rounded-lg border border-metro-border bg-metro-panel text-slate-300 transition hover:border-sky-300/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-35" disabled={safeCurrentPage <= 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} type="button"><ChevronLeft size={15} /></button>
            <span className="min-w-[74px] text-center text-[11px] font-bold text-slate-300">{safeCurrentPage} / {totalPages}</span>
            <button aria-label="Página siguiente" className="grid h-8 w-8 place-items-center rounded-lg border border-metro-border bg-metro-panel text-slate-300 transition hover:border-sky-300/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-35" disabled={safeCurrentPage >= totalPages} onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} type="button"><ChevronRight size={15} /></button>
            <select aria-label="Registros por página" className="h-8 rounded-lg border border-metro-border bg-metro-panel px-2 text-[11px] font-semibold text-slate-300 outline-none focus:border-sky-300/40" onChange={(event) => setPageSize(Number(event.target.value))} value={pageSize}><option value={10}>10 por página</option><option value={25}>25 por página</option><option value={50}>50 por página</option></select>
          </div>
        </div>
      </div>
      {editorMode && <EmployeeEditor employee={editorEmployee} mode={editorMode} onDone={closeEditor} />}
      {isTranslationsModalOpen && <JobPositionTranslationsModal onClose={() => setTranslationsModalOpen(false)} />}
      {pendingImportFile && importPreview && <EmployeeImportPreviewModal employees={employees} fileName={pendingImportFile.name} onClose={() => { setPendingImportFile(null); setImportPreview(null); }} onImport={async (mapping: Array<EmployeeField | null>, conflictResolution?: EmployeeImportConflictResolution) => { const result = await importExcel(pendingImportFile, mapping, importPreview.sourceProfile, conflictResolution); setImportMessageIsError(false); setImportMessage(result.mode === 'antiguedadPuesto' ? `${result.totalRows} registros importados · ${result.updated} actualizados · ${result.unchanged} sin cambios · ${result.ignored} ignorados.` : importPreview.sourceProfile === 'zerkos' ? `${result.totalRows} registros importados · ${result.created} nuevos · ${result.updated} actualizados · ${result.unchanged} sin cambios · ${result.reactivated} reactivados · ${result.deactivated} bajas.` : `${result.totalRows} registros importados · ${result.created} nuevos · ${result.updated} actualizados · ${result.unchanged} sin cambios.`); setPendingImportFile(null); setImportPreview(null); }} preview={importPreview} />}
    </section>
  );
}
