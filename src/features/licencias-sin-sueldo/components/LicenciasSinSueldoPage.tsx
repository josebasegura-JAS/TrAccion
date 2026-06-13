import { CheckCircle2, ChevronDown, ChevronRight, Clock, FileSignature, Plus, RotateCcw, Search, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ExportColumn } from '../../../shared/export/types';
import { ExportPrintButtons } from '../../../shared/print/ExportPrintButtons';
import { DataTable, type DataTableColumn } from '../../../shared/table/DataTable';
import { useTableViewPreferences, type TableViewPreferences } from '../../../shared/table/useTableViewPreferences';
import { useSharedRecordLock } from '../../../services/useSharedRecordLock';
import { InlineSaveFeedback } from '../../../components/InlineSaveFeedback';
import { ActionButton } from '../../../components/ui/ActionButton';
import { AuditHistoryButton } from '../../../shared/audit/AuditHistoryButton';
import { ModuleHelpButton, type ModuleHelpSection } from '../../../components/ModuleHelp';
import { saveDocxWithDialog } from '../../teletrabajo/domain/download';
import { useConfiguracionStore } from '../../configuracion/store/useConfiguracionStore';
import { useEmployeeStore } from '../../plantilla/store/useEmployeeStore';
import {
  EMPTY_LICENCIA_SIN_SUELDO_DRAFT,
  calculateFechaFinForTipo,
  findEmployeeByNumber,
  getEffectiveLicenciaEstado,
  licenciaSinSueldoEstados,
  licenciaSinSueldoTipos,
  normalizeDraftForTipo,
  suggestEmployees,
  validateLicenciaSinSueldoDraft,
  visibleLicenciasSinSueldo,
  type EmployeeSuggestion,
  type LicenciaSinSueldoActualizacion,
  type LicenciaSinSueldoDraft,
  type LicenciaSinSueldoEstado,
  type LicenciaSinSueldoRecord,
  type LicenciaSinSueldoTipo,
} from '../domain/licenciaSinSueldo';
import { generateLicenciaSinSueldoWord } from '../domain/word';
import { useLicenciasSinSueldoStore } from '../store/useLicenciasSinSueldoStore';

type EditorMode = 'create' | 'edit';
type LicenciasTableColumnId = 'numeroEmpleado' | 'nombreCompleto' | 'tipo' | 'fechaSolicitud' | 'fechaInicio' | 'fechaFin' | 'estado' | 'actions';

type BlockId = 'pendiente_aprobacion' | 'pendiente_firma' | 'vigente' | `historico-${number}`;

const tableColumnIds: readonly LicenciasTableColumnId[] = [
  'numeroEmpleado',
  'nombreCompleto',
  'tipo',
  'fechaSolicitud',
  'fechaInicio',
  'fechaFin',
  'estado',
  'actions',
];

const defaultTablePreferences: TableViewPreferences<LicenciasTableColumnId> = {
  sort: { columnId: 'fechaSolicitud', direction: 'desc' },
  columnWidths: {},
};

const inputClass = 'mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red disabled:cursor-not-allowed disabled:opacity-60';
const labelClass = 'block text-xs font-semibold uppercase tracking-wide text-metro-muted';

const LICENCIAS_HELP_SECTIONS: ModuleHelpSection[] = [
  {
    title: '¿Qué hace este módulo?',
    body: 'Gestiona solicitudes de licencia sin sueldo, excedencias y permisos no retribuidos, desde la aprobación hasta el histórico.',
  },
  {
    title: 'Estados',
    items: [
      'Pendiente de aprobar.',
      'Pendiente de firma.',
      'Vigente.',
      'Histórico.',
    ],
  },
  {
    title: 'Reglas principales',
    items: [
      'Las licencias sin sueldo tienen duración mínima de 15 días y máxima de 9 meses.',
      'El Año de Libre Disposición genera automáticamente una duración de 5 años.',
      'Las solicitudes aprobadas pasan a pendiente de firma antes de quedar vigentes.',
      'Los registros finalizados quedan agrupados en histórico por año.',
    ],
  },
  {
    title: 'Generación documental',
    items: [
      'En los registros de licencia sin sueldo aprobados puede generarse documento Word desde plantilla.',
      'La plantilla se toma de la ruta configurada en Ajustes.',
      'El documento rellena datos de la persona, puesto, fechas y fecha del sistema.',
    ],
  },
];

const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-lg bg-metro-red px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-metro-dark disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButtonClass = 'inline-flex items-center justify-center gap-2 rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm font-semibold text-metro-text transition hover:border-metro-red hover:text-metro-red disabled:cursor-not-allowed disabled:opacity-50';

const estadoLabels: Record<LicenciaSinSueldoEstado, string> = {
  pendiente_aprobacion: 'Pendiente aprobar',
  pendiente_firma: 'Pendiente firma',
  vigente: 'Vigente',
  historico: 'Histórico',
};

const exportColumns: ExportColumn<LicenciaSinSueldoRecord>[] = [
  { key: 'numeroEmpleado', header: 'Nº empleado', value: (record) => record.numeroEmpleado },
  { key: 'nombreCompleto', header: 'Nombre', value: (record) => record.nombreCompleto },
  { key: 'tipo', header: 'Tipo', value: (record) => record.tipo },
  { key: 'fechaSolicitud', header: 'Fecha solicitud', value: (record) => record.fechaSolicitud },
  { key: 'fechaInicio', header: 'Fecha inicio', value: (record) => record.fechaInicio },
  { key: 'fechaFin', header: 'Fecha fin', value: (record) => record.fechaFin },
  { key: 'estado', header: 'Estado', value: (record) => estadoLabels[record.estado] },
  { key: 'observaciones', header: 'Observaciones', value: (record) => record.observaciones },
];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function createUpdateId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `actualizacion-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatDate(value: string): string {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('es-ES');
}

function formatEstado(value: LicenciaSinSueldoEstado): string {
  return estadoLabels[value];
}

function buildHaystack(record: LicenciaSinSueldoRecord, effectiveEstado: LicenciaSinSueldoEstado): string {
  return [
    record.numeroEmpleado,
    record.nombreCompleto,
    record.tipo,
    effectiveEstado,
    estadoLabels[effectiveEstado],
    record.observaciones,
    ...record.actualizaciones.map((actualizacion) => actualizacion.texto),
  ]
    .join(' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es');
}

function getHistoricalYear(record: LicenciaSinSueldoRecord): number {
  const year = Number(record.fechaFin.slice(0, 4));
  return Number.isFinite(year) ? year : 0;
}

function toDraft(record: LicenciaSinSueldoRecord): LicenciaSinSueldoDraft {
  return {
    numeroEmpleado: record.numeroEmpleado,
    nombreCompleto: record.nombreCompleto,
    tipo: record.tipo,
    fechaSolicitud: record.fechaSolicitud,
    fechaInicio: record.fechaInicio,
    fechaFin: record.fechaFin,
    estado: record.estado,
    observaciones: record.observaciones,
    actualizaciones: record.actualizaciones,
  };
}

function LicenseEditor({
  employees,
  mode,
  record,
  onClose,
  onDelete,
  onSave,
}: {
  employees: ReturnType<typeof useEmployeeStore.getState>['employees'];
  mode: EditorMode;
  record: LicenciaSinSueldoRecord | null;
  onClose: () => void;
  onDelete: () => void;
  onSave: (draft: LicenciaSinSueldoDraft) => Promise<{ ok: boolean; message: string }>;
}) {
  const [draft, setDraft] = useState<LicenciaSinSueldoDraft>(() =>
    record ? toDraft(record) : { ...EMPTY_LICENCIA_SIN_SUELDO_DRAFT, fechaSolicitud: todayIso() },
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [newUpdate, setNewUpdate] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const recordLock = useSharedRecordLock({
    module: 'licencias-sin-sueldo',
    recordId: record?.id ?? null,
    enabled: mode === 'edit' && Boolean(record?.id),
  });
  const isEditWithoutAcquiredLock = mode === 'edit' && recordLock.status !== 'acquired';
  const isReadOnly = recordLock.isReadOnly || isEditWithoutAcquiredLock;
  const lockMessage =
    recordLock.message ||
    (isEditWithoutAcquiredLock ? 'Adquiriendo bloqueo de edición compartida...' : '');

  const suggestions = useMemo(
    () => suggestEmployees(employees, employeeSearch).filter((suggestion) => suggestion.empleado !== draft.numeroEmpleado),
    [draft.numeroEmpleado, employeeSearch, employees],
  );

  const updateDraft = <K extends keyof LicenciaSinSueldoDraft>(
    key: K,
    value: LicenciaSinSueldoDraft[K],
  ) => {
    setDraft((current) => {
      const next = { ...current, [key]: value };
      if (key === 'tipo' || key === 'fechaInicio') {
        const tipo = next.tipo;
        if (tipo === 'Año de Libre Disposición') {
          next.fechaFin = calculateFechaFinForTipo(tipo, next.fechaInicio);
        }
      }
      return next;
    });
  };

  const applyEmployee = (employee: EmployeeSuggestion) => {
    setDraft((current) => ({
      ...current,
      numeroEmpleado: employee.empleado,
      nombreCompleto: employee.nombreApellidos,
    }));
    setEmployeeSearch('');
  };

  const handleEmployeeNumberBlur = () => {
    const employee = findEmployeeByNumber(employees, draft.numeroEmpleado);
    if (employee) {
      applyEmployee(employee);
    }
  };

  const addUpdate = () => {
    const text = newUpdate.trim();
    if (!text) return;
    updateDraft('actualizaciones', [
      ...draft.actualizaciones,
      { id: createUpdateId(), fecha: new Date().toISOString(), texto: text },
    ]);
    setNewUpdate('');
  };

  const handleSave = () => {
    if (isReadOnly || isSaving) return;
    const normalizedDraft = normalizeDraftForTipo(draft);
    const result = validateLicenciaSinSueldoDraft(normalizedDraft);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setIsSaving(true);
    setSaveStatus('');
    void onSave(normalizedDraft).then((saveResult) => {
      if (!saveResult.ok) {
        setSaveStatus(saveResult.message);
      }
    }).finally(() => setIsSaving(false));
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-2xl border border-metro-border bg-metro-panel shadow-2xl shadow-slate-950/50">
        <div className="flex items-center justify-between border-b border-metro-border px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-metro-text">
              {mode === 'create' ? 'Nueva licencia o permiso' : 'Ficha de licencia o permiso'}
            </h2>
            <p className="text-xs text-metro-muted">Doble clic en una fila abre esta ficha para editar el flujo.</p>
          </div>
          <button className="rounded-full p-2 text-metro-muted transition hover:bg-white/5 hover:text-metro-text" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-auto px-5 py-4">
          {lockMessage && (
            <p className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
              isReadOnly
                ? 'border-red-400/40 bg-red-950/20 text-red-100'
                : 'border-metro-border bg-metro-surface text-metro-muted'
            }`}>
              {lockMessage}
            </p>
          )}

          {saveStatus && (
            <div className="mx-5 mt-4 rounded-xl border border-red-400/40 bg-red-950/20 px-3 py-2 text-xs font-semibold text-red-100">
              {saveStatus}
            </div>
          )}

          {errors.length > 0 && (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-100">
              <ul className="list-disc space-y-1 pl-5">
                {errors.map((error) => <li key={error}>{error}</li>)}
              </ul>
            </div>
          )}

          <fieldset disabled={isReadOnly} className="space-y-4 disabled:opacity-70">
          {mode === 'edit' && draft.estado !== 'historico' && (
            <div className="flex flex-wrap gap-2 rounded-xl border border-metro-border bg-slate-950/10 p-3">
              <span className="w-full text-xs font-semibold uppercase tracking-wide text-metro-muted">Flujo</span>
              <button
                className={secondaryButtonClass}
                disabled={draft.estado !== 'pendiente_aprobacion'}
                onClick={() => updateDraft('estado', 'pendiente_firma')}
                type="button"
              >
                Aprobar
              </button>
              <button
                className={secondaryButtonClass}
                disabled={draft.estado !== 'pendiente_firma'}
                onClick={() => updateDraft('estado', 'vigente')}
                type="button"
              >
                Firma recibida / finalizar
              </button>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <label className={labelClass}>Nº empleado
              <input className={inputClass} onBlur={handleEmployeeNumberBlur} onChange={(event) => updateDraft('numeroEmpleado', event.target.value)} value={draft.numeroEmpleado} />
            </label>
            <label className={labelClass}>Buscar en plantilla
              <div className="relative">
                <input className={inputClass} onChange={(event) => setEmployeeSearch(event.target.value)} placeholder="Número o nombre" value={employeeSearch} />
                {suggestions.length > 0 && (
                  <div className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-xl border border-metro-border bg-metro-surface shadow-xl">
                    {suggestions.map((suggestion) => (
                      <button className="block w-full px-3 py-2 text-left text-sm text-metro-text hover:bg-metro-red/10" key={suggestion.empleado} onClick={() => applyEmployee(suggestion)} type="button">
                        {suggestion.empleado} · {suggestion.nombreApellidos}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </label>
            <label className={labelClass}>Nombre completo
              <input className={inputClass} onChange={(event) => updateDraft('nombreCompleto', event.target.value)} value={draft.nombreCompleto} />
            </label>
            <label className={labelClass}>Tipo
              <select className={inputClass} onChange={(event) => updateDraft('tipo', event.target.value as LicenciaSinSueldoTipo)} value={draft.tipo}>
                {licenciaSinSueldoTipos.map((tipo) => <option key={tipo}>{tipo}</option>)}
              </select>
            </label>
            <label className={labelClass}>Fecha solicitud
              <input className={inputClass} onChange={(event) => updateDraft('fechaSolicitud', event.target.value)} type="date" value={draft.fechaSolicitud} />
            </label>
            <label className={labelClass}>Estado
              <select className={inputClass} onChange={(event) => updateDraft('estado', event.target.value as LicenciaSinSueldoEstado)} value={draft.estado}>
                {licenciaSinSueldoEstados.map((estado) => <option key={estado} value={estado}>{formatEstado(estado)}</option>)}
              </select>
            </label>
            <label className={labelClass}>Fecha inicio
              <input className={inputClass} onChange={(event) => updateDraft('fechaInicio', event.target.value)} type="date" value={draft.fechaInicio} />
            </label>
            <label className={labelClass}>Fecha fin
              <input className={inputClass} disabled={draft.tipo === 'Año de Libre Disposición'} onChange={(event) => updateDraft('fechaFin', event.target.value)} type="date" value={draft.fechaFin} />
            </label>
          </div>

          <label className={labelClass}>Observaciones
            <textarea className={`${inputClass} min-h-24 resize-y`} onChange={(event) => updateDraft('observaciones', event.target.value)} value={draft.observaciones} />
          </label>

          <section className="rounded-xl border border-metro-border bg-slate-950/10 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wide text-metro-muted">Actualizaciones</h3>
              <button className={secondaryButtonClass} onClick={addUpdate} type="button">Añadir</button>
            </div>
            <textarea className={`${inputClass} min-h-16`} onChange={(event) => setNewUpdate(event.target.value)} placeholder="Nueva observación o actualización" value={newUpdate} />
            <div className="mt-3 space-y-2">
              {draft.actualizaciones.length === 0 ? (
                <p className="text-xs text-metro-muted">Sin actualizaciones registradas.</p>
              ) : (
                draft.actualizaciones.map((actualizacion: LicenciaSinSueldoActualizacion) => (
                  <div className="rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm" key={actualizacion.id}>
                    <p className="text-[11px] text-metro-muted">{new Date(actualizacion.fecha).toLocaleString('es-ES')}</p>
                    <p className="text-metro-text">{actualizacion.texto}</p>
                  </div>
                ))
              )}
            </div>
          </section>
          </fieldset>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-metro-border px-5 py-4">
          <div>{mode === 'edit' && <button className={secondaryButtonClass} disabled={isReadOnly} onClick={onDelete} type="button"><Trash2 size={16} /> Eliminar</button>}</div>
          <div className="flex flex-wrap gap-2">
            <button className={secondaryButtonClass} onClick={onClose} type="button">Cancelar</button>
            {mode === 'edit' && record && (
              <AuditHistoryButton
                className={secondaryButtonClass}
                entityId={record.id}
                entityTitle={record.nombreCompleto || 'Licencia sin nombre'}
                module="licencias-sin-sueldo"
              />
            )}
            <ActionButton disabled={isReadOnly || isSaving} onClick={handleSave} size="sm" variant="save">{isSaving ? 'Guardando…' : 'Guardar'}</ActionButton><InlineSaveFeedback />
          </div>
        </div>
      </div>
    </div>
  );
}

function LicenciasTable({
  blockId,
  emptyText,
  records,
  title,
  onAdvance,
  onDelete,
  onEdit,
  onGenerateWord,
  generatingWordId,
}: {
  blockId: BlockId;
  emptyText: string;
  records: LicenciaSinSueldoRecord[];
  title: string;
  onAdvance: (record: LicenciaSinSueldoRecord) => void;
  onDelete: (record: LicenciaSinSueldoRecord) => void;
  onEdit: (record: LicenciaSinSueldoRecord) => void;
  onGenerateWord: (record: LicenciaSinSueldoRecord) => void;
  generatingWordId: string | null;
}) {
  const { preferences, setSort, setColumnWidth, resetColumnWidths, resetPreferences } = useTableViewPreferences<LicenciasTableColumnId>({
    storageKey: `traccion.tableView.licenciasSinSueldo.${blockId}`,
    defaultPreferences: defaultTablePreferences,
    validColumnIds: tableColumnIds,
  });

  const columns = useMemo<Array<DataTableColumn<LicenciaSinSueldoRecord, LicenciasTableColumnId>>>(() => [
    { id: 'numeroEmpleado', header: 'Nº', accessor: (record) => Number(record.numeroEmpleado) || record.numeroEmpleado, render: (record) => record.numeroEmpleado, width: 90, sortable: true },
    { id: 'nombreCompleto', header: 'Nombre', accessor: (record) => record.nombreCompleto, render: (record) => record.nombreCompleto, width: 210, minWidth: 150, sortable: true },
    { id: 'tipo', header: 'Tipo', accessor: (record) => record.tipo, render: (record) => record.tipo, width: 180, sortable: true },
    { id: 'fechaSolicitud', header: 'Solicitud', accessor: (record) => record.fechaSolicitud, render: (record) => formatDate(record.fechaSolicitud), width: 110, sortable: true },
    { id: 'fechaInicio', header: 'Inicio', accessor: (record) => record.fechaInicio, render: (record) => formatDate(record.fechaInicio), width: 105, sortable: true },
    { id: 'fechaFin', header: 'Fin', accessor: (record) => record.fechaFin, render: (record) => formatDate(record.fechaFin), width: 105, sortable: true },
    { id: 'estado', header: 'Estado', accessor: (record) => record.estado, render: (record) => formatEstado(record.estado), width: 125, sortable: true },
    {
      id: 'actions', header: 'Acciones', width: 170, minWidth: 150, resizable: false, isActionColumn: true,
      render: (record) => (
        <div className="flex justify-end gap-2">
          {record.estado === 'pendiente_aprobacion' && <button className="text-xs font-semibold text-metro-red hover:text-metro-text" onClick={(event) => { event.stopPropagation(); onAdvance(record); }} type="button">Aprobar</button>}
          {record.estado === 'pendiente_firma' && record.tipo === 'Licencia sin sueldo' && (
            <ActionButton
              aria-label="Generar Word concesión"
              disabled={generatingWordId !== null}
              onClick={(event) => { event.stopPropagation(); onGenerateWord(record); }}
              size="sm"
              title="Generar Word concesión"
              variant="word"
            >
              {generatingWordId === record.id ? 'Generando…' : 'Word'}
            </ActionButton>
          )}
          {record.estado === 'pendiente_firma' && <button className="text-xs font-semibold text-metro-red hover:text-metro-text" onClick={(event) => { event.stopPropagation(); onAdvance(record); }} type="button">Firma recibida</button>}
          <button className="text-xs font-semibold text-metro-muted hover:text-metro-red" onClick={(event) => { event.stopPropagation(); onDelete(record); }} type="button">Eliminar</button>
        </div>
      ),
    },
  ], [generatingWordId, onAdvance, onDelete, onGenerateWord]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-metro-muted">{records.length} registros visibles</p>
        <div className="flex flex-wrap items-center gap-2">
          <button className={secondaryButtonClass} onClick={resetPreferences} type="button"><RotateCcw size={14} /> Vista</button>
          <ExportPrintButtons payload={{ title, filename: title, columns: exportColumns, rows: records, filterLabel: `${records.length} registros filtrados` }} />
        </div>
      </div>
      <DataTable
        ariaLabel={title}
        columnWidths={preferences.columnWidths}
          onResetColumnWidths={resetColumnWidths}
        columns={columns}
        emptyMessage={emptyText}
        getRowId={(record) => record.id}
        maxHeightClassName="max-h-[320px]"
        onColumnWidthChange={setColumnWidth}
        onRowDoubleClick={onEdit}
        onSortChange={setSort}
        rows={records}
        sort={preferences.sort}
      />
    </div>
  );
}

function Block({ children, count, icon, title }: { children: ReactNode; count: number; icon: ReactNode; title: string }) {
  return (
    <section className="rounded-2xl border border-metro-border bg-metro-panel p-4 shadow-sm shadow-slate-950/20">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-metro-red/10 p-2 text-metro-red">{icon}</div>
          <h2 className="text-base font-semibold text-metro-text">{title}</h2>
        </div>
        <span className="rounded-full border border-metro-border bg-metro-surface px-3 py-1 text-xs font-semibold text-metro-muted">{count}</span>
      </div>
      {children}
    </section>
  );
}

export function LicenciasSinSueldoPage() {
  const { employees, load: loadEmployees } = useEmployeeStore();
  const jobPositionTranslations = useEmployeeStore((state) => state.jobPositionTranslations);
  const rutaPlantillaLicenciaSinSueldo = useConfiguracionStore(
    (state) => state.rutaPlantillaLicenciaSinSueldo,
  );
  const { records, load, createWithConcurrencyCheck, updateWithConcurrencyCheck, removeWithConcurrencyCheck } = useLicenciasSinSueldoStore();
  const [editor, setEditor] = useState<{ mode: EditorMode; record: LicenciaSinSueldoRecord | null } | null>(null);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'todos' | LicenciaSinSueldoTipo>('todos');
  const [yearFilter, setYearFilter] = useState<'todos' | string>('todos');
  const [openHistoryYears, setOpenHistoryYears] = useState<Set<number>>(new Set());
  const [wordStatus, setWordStatus] = useState('');
  const [generatingWordId, setGeneratingWordId] = useState<string | null>(null);

  useEffect(() => {
    loadEmployees();
    load();
  }, [load, loadEmployees]);

  const today = todayIso();
  const visibleRecords = useMemo(() => visibleLicenciasSinSueldo(records), [records]);
  const effectiveRecords = useMemo(() => visibleRecords.map((record) => ({ ...record, estado: getEffectiveLicenciaEstado(record, today) })), [today, visibleRecords]);
  const historicalYears = useMemo(
    () => [...new Set(
      effectiveRecords
        .filter((record) => record.estado === 'historico')
        .map((record) => getHistoricalYear(record)),
    )].sort((first, second) => second - first),
    [effectiveRecords],
  );

  const filteredRecords = useMemo(() => {
    const normalizedQuery = query.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();
    return effectiveRecords.filter((record) => {
      const matchesQuery = !normalizedQuery || buildHaystack(record, record.estado).includes(normalizedQuery);
      const matchesType = typeFilter === 'todos' || record.tipo === typeFilter;
      const matchesYear = yearFilter === 'todos' || String(getHistoricalYear(record)) === yearFilter;
      return matchesQuery && matchesType && matchesYear;
    });
  }, [effectiveRecords, query, typeFilter, yearFilter]);

  const blocks = useMemo(() => ({
    pendienteAprobacion: filteredRecords.filter((record) => record.estado === 'pendiente_aprobacion'),
    pendienteFirma: filteredRecords.filter((record) => record.estado === 'pendiente_firma'),
    vigente: filteredRecords.filter((record) => record.estado === 'vigente'),
  }), [filteredRecords]);

  const shouldMaterializeHistory = yearFilter !== 'todos' || query.trim().length >= 2;
  const groupedHistory = useMemo(() => {
    const groups = new Map<number, { count: number; records: LicenciaSinSueldoRecord[] }>();

    for (const record of filteredRecords) {
      if (record.estado !== 'historico') {
        continue;
      }

      const year = getHistoricalYear(record);
      const current = groups.get(year) ?? { count: 0, records: [] };
      current.count += 1;
      if (shouldMaterializeHistory || openHistoryYears.has(year)) {
        current.records.push(record);
      }
      groups.set(year, current);
    }

    return [...groups.entries()]
      .sort(([first], [second]) => second - first)
      .map(([year, value]) => ({ year, count: value.count, records: value.records }));
  }, [filteredRecords, openHistoryYears, shouldMaterializeHistory]);

  const historicalCount = useMemo(
    () => filteredRecords.reduce((count, record) => count + (record.estado === 'historico' ? 1 : 0), 0),
    [filteredRecords],
  );

  const acquireMutationLock = useCallback(async (record: LicenciaSinSueldoRecord) => {
    const payload = { module: 'licencias-sin-sueldo', recordId: record.id };
    const api = window.traccion;
    const result = await api?.acquireRecordLock?.(payload);
    if (result?.status === 'locked') {
      window.alert(result.message);
      return false;
    }
    return true;
  }, []);

  const releaseMutationLock = useCallback(async (record: LicenciaSinSueldoRecord) => {
    await window.traccion?.releaseRecordLock?.({ module: 'licencias-sin-sueldo', recordId: record.id });
  }, []);

  const saveDraft = async (draft: LicenciaSinSueldoDraft): Promise<{ ok: boolean; message: string }> => {
    if (!editor) {
      return { ok: false, message: 'No hay editor activo.' };
    }
    if (editor.mode === 'create') {
      const result = await createWithConcurrencyCheck({ ...draft, estado: 'pendiente_aprobacion' });
      if (result.ok) {
        setEditor(null);
      }
      return result;
    }
    if (editor.record) {
      const result = await updateWithConcurrencyCheck(editor.record.id, draft, editor.record.updatedAt);
      if (result.ok) {
        setEditor(null);
      }
      return result;
    }
    return { ok: false, message: 'No se ha encontrado el registro a guardar.' };
  };

  const deleteRecord = async (record: LicenciaSinSueldoRecord) => {
    if (!window.confirm(`¿Eliminar la solicitud de ${record.nombreCompleto}?`)) {
      return;
    }
    if (!(await acquireMutationLock(record))) {
      return;
    }
    const result = await removeWithConcurrencyCheck(record.id, record.updatedAt);
    if (!result.ok) {
      window.alert(result.message);
    }
    await releaseMutationLock(record);
    setEditor(null);
  };

  const advanceRecord = async (record: LicenciaSinSueldoRecord) => {
    if (!(await acquireMutationLock(record))) {
      return;
    }
    const nextEstado = record.estado === 'pendiente_aprobacion' ? 'pendiente_firma' : record.estado === 'pendiente_firma' ? 'vigente' : record.estado;
    const result = await updateWithConcurrencyCheck(record.id, { ...toDraft(record), estado: nextEstado }, record.updatedAt);
    if (!result.ok) {
      window.alert(result.message);
    }
    await releaseMutationLock(record);
  };

  const generateWord = useCallback(
    async (record: LicenciaSinSueldoRecord) => {
      if (record.estado !== 'pendiente_firma' || record.tipo !== 'Licencia sin sueldo' || generatingWordId) {
        return;
      }

      const plantillaEmployee =
        employees.find(
          (employee) => !employee.deletedAt && employee.empleado.trim() === record.numeroEmpleado.trim(),
        ) ?? null;

      setGeneratingWordId(record.id);
      setWordStatus('');
      try {
        const result = await generateLicenciaSinSueldoWord(
          record,
          plantillaEmployee,
          rutaPlantillaLicenciaSinSueldo,
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
    },
    [employees, generatingWordId, jobPositionTranslations, rutaPlantillaLicenciaSinSueldo],
  );

  const toggleYear = (year: number) => {
    setOpenHistoryYears((current) => {
      const next = new Set(current);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  };

  return (
    <section
      className="space-y-4 rounded-2xl border border-metro-border bg-metro-surface p-4 shadow-card"
      id="licencias-sin-sueldo"
    >
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-metro-red">Módulo</p>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold text-metro-text">Licencias sin sueldo y permisos no retribuidos</h2>
            <ModuleHelpButton
              title="Licencias sin sueldo y permisos no retribuidos"
              subtitle="Guía rápida de estados, reglas, vigencia, histórico y generación documental."
              sections={LICENCIAS_HELP_SECTIONS}
            />
          </div>
          <p className="mt-0.5 text-sm text-metro-muted">Seguimiento por aprobación, firma, vigencia e histórico.</p>
        </div>
        <button className={buttonClass} onClick={() => setEditor({ mode: 'create', record: null })} type="button"><Plus size={16} /> Nueva solicitud</button>
      </div>

      <div className="grid gap-3 rounded-2xl border border-metro-border bg-metro-panel p-4 md:grid-cols-3">
        <label className={labelClass}>Buscar
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-metro-muted" size={15} />
            <input className={`${inputClass} pl-9`} onChange={(event) => setQuery(event.target.value)} placeholder="Número, nombre, tipo o estado" value={query} />
          </div>
        </label>
        <label className={labelClass}>Tipo
          <select className={inputClass} onChange={(event) => setTypeFilter(event.target.value as 'todos' | LicenciaSinSueldoTipo)} value={typeFilter}>
            <option value="todos">Todos</option>
            {licenciaSinSueldoTipos.map((tipo) => <option key={tipo}>{tipo}</option>)}
          </select>
        </label>
        <label className={labelClass}>Año histórico
          <select className={inputClass} onChange={(event) => setYearFilter(event.target.value)} value={yearFilter}>
            <option value="todos">Todos</option>
            {historicalYears.map((year) => <option key={year} value={year}>{year || 'Sin año'}</option>)}
          </select>
        </label>
      </div>

      {wordStatus && (
        <p className="rounded-xl border border-metro-border bg-metro-panel px-3 py-2 text-xs font-semibold text-metro-muted">
          {wordStatus}
        </p>
      )}

      <div className="grid gap-3 xl:grid-cols-2">
        <div className="min-w-0">
          <Block count={blocks.pendienteAprobacion.length} icon={<Clock size={18} />} title="Pendientes de aprobar">
            <LicenciasTable blockId="pendiente_aprobacion" emptyText="No hay solicitudes pendientes de aprobar." onAdvance={advanceRecord} generatingWordId={generatingWordId} onDelete={deleteRecord} onEdit={(record) => setEditor({ mode: 'edit', record })} onGenerateWord={(record) => { void generateWord(record); }} records={blocks.pendienteAprobacion} title="Licencias sin sueldo - Pendientes de aprobar" />
          </Block>
        </div>

        <div className="min-w-0">
          <Block count={blocks.pendienteFirma.length} icon={<FileSignature size={18} />} title="Pendientes de firma">
            <LicenciasTable blockId="pendiente_firma" emptyText="No hay solicitudes pendientes de firma." onAdvance={advanceRecord} generatingWordId={generatingWordId} onDelete={deleteRecord} onEdit={(record) => setEditor({ mode: 'edit', record })} onGenerateWord={(record) => { void generateWord(record); }} records={blocks.pendienteFirma} title="Licencias sin sueldo - Pendientes de firma" />
          </Block>
        </div>
      </div>

      <Block count={blocks.vigente.length} icon={<CheckCircle2 size={18} />} title="Vigentes">
        <LicenciasTable blockId="vigente" emptyText="No hay solicitudes vigentes." onAdvance={advanceRecord} generatingWordId={generatingWordId} onDelete={deleteRecord} onEdit={(record) => setEditor({ mode: 'edit', record })} onGenerateWord={(record) => { void generateWord(record); }} records={blocks.vigente} title="Licencias sin sueldo - Vigentes" />
      </Block>

      <section className="rounded-2xl border border-metro-border bg-metro-panel p-4 shadow-sm shadow-slate-950/20">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-metro-text">Histórico por año</h2>
          <span className="rounded-full border border-metro-border bg-metro-surface px-3 py-1 text-xs font-semibold text-metro-muted">{historicalCount}</span>
        </div>
        <div className="space-y-3">
          {groupedHistory.length === 0 && <p className="rounded-xl border border-dashed border-metro-border p-4 text-sm text-metro-muted">No hay registros históricos.</p>}
          {groupedHistory.map(({ year, count, records: yearRecords }) => {
            const isYearOpen = yearFilter !== 'todos' || query.trim().length >= 2 || openHistoryYears.has(year);
            const visibleYearRecords = isYearOpen ? yearRecords : [];

            return (
              <div className="rounded-xl border border-metro-border bg-slate-950/10 p-3" key={year}>
                <button className="mb-3 flex w-full items-center justify-between text-left" onClick={() => toggleYear(year)} type="button">
                  <span className="inline-flex items-center gap-2 text-sm font-semibold text-metro-text">{isYearOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />} {year || 'Sin año'}</span>
                  <span className="text-xs text-metro-muted">{count} registros</span>
                </button>
                {isYearOpen && (
                  <LicenciasTable blockId={`historico-${year}`} emptyText="Sin históricos para este año con los filtros actuales." onAdvance={advanceRecord} generatingWordId={generatingWordId} onDelete={deleteRecord} onEdit={(record) => setEditor({ mode: 'edit', record })} onGenerateWord={(record) => { void generateWord(record); }} records={visibleYearRecords} title={`Licencias sin sueldo - Histórico ${year || 'sin año'}`} />
                )}
              </div>
            );
          })}
        </div>
      </section>

      {editor && (
        <LicenseEditor
          employees={employees}
          mode={editor.mode}
          onClose={() => setEditor(null)}
          onDelete={() => { if (editor.record) void deleteRecord(editor.record); }}
          onSave={saveDraft}
          record={editor.record}
        />
      )}
    </section>
  );
}
