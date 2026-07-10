import { Link2, RotateCcw, Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DataTable, type DataTableColumn } from '../../../shared/table/DataTable';
import { useTableViewPreferences, type TableSortState, type TableViewPreferences } from '../../../shared/table/useTableViewPreferences';
import { useSharedRecordLock } from '../../../services/useSharedRecordLock';
import { useEmployeeStore } from '../../plantilla/store/useEmployeeStore';
import type { Employee } from '../../plantilla/domain/employee';
import { useConfiguracionStore } from '../../configuracion/store/useConfiguracionStore';
import { generateVinculogramaSolicitudWord } from '../domain/word';
import { readStorageItem, writeStorageItem } from '../../../services/persistence';
import {
  calculateExpiryDate,
  EMPTY_VINCULOGRAMA_DRAFT,
  findEmployeeByNumber,
  getVinculogramaStatus,
  splitVinculogramasByStatus,
  suggestEmployees,
  type EmployeeSuggestion,
  type Vinculograma,
  type VinculogramaDraft,
} from '../domain/vinculograma';
import { useVinculogramaStore } from '../store/useVinculogramaStore';
import type { ExportColumn } from '../../../shared/export/types';
import { reorderExportColumns } from '../../../shared/export/reorderExportColumns';
import { ExportPrintButtons } from '../../../shared/print/ExportPrintButtons';
import { InlineSaveFeedback } from '../../../components/InlineSaveFeedback';
import type { ModuleHelpSection } from '../../../components/ModuleHelp';
import { useAppDialog } from '../../../hooks/useAppDialog';
import { ModalDatabaseStatus } from '../../../components/ModalDatabaseStatus';
import { ActionButton } from '../../../components/ui/ActionButton';
import { FieldLabel, Input } from '../../../components/ui/Field';
import { PageHeader } from '../../../components/ui/PageHeader';
import { StatusBadge } from '../../../components/ui/StatusBadge';


const VINCULOGRAMA_HELP_SECTIONS: ModuleHelpSection[] = [
  {
    title: 'Para qué sirve',
    body: 'Registra declaraciones de vínculo entre una persona de la plantilla y otra persona (familiar, allegado...), calculando automáticamente su fecha de vigencia.',
  },
  {
    title: 'Cómo se calcula la vigencia',
    items: [
      'La fecha de vigencia se calcula automáticamente como 3 años exactos después de la fecha de solicitud; no se edita a mano.',
      'El vínculo se marca como "Vigente" mientras la fecha actual no supere esa fecha de vigencia, y pasa a "Vencido" en cuanto se supera, sin ninguna acción manual.',
      'La búsqueda de la persona se apoya en Plantilla (por número de empleado o nombre), evitando duplicar datos que ya están dados de alta allí.',
    ],
  },
  {
    title: 'Generación documental',
    items: [
      'Puede generarse un documento Word de solicitud de declaración responsable a partir de una plantilla externa configurada en Ajustes.',
      'El documento sustituye los marcadores de la plantilla por los datos del vínculo y de la persona.',
    ],
  },
  {
    title: 'Uso recomendado',
    items: [
      'Selecciona siempre la persona desde Plantilla cuando sea posible para evitar duplicidades o errores de nombre.',
      'Comprueba la fecha de solicitud antes de guardar, ya que de ella depende directamente la fecha de vigencia calculada.',
      'Usa el filtro de vigentes/vencidos para separar relaciones activas de las que ya han caducado.',
      'Usa exportación o impresión para trasladar un listado filtrado de vínculos activos o históricos.',
    ],
  },
];

type VinculogramaTableColumnId = 'employeeNumber' | 'nombreCompleto' | 'linkedPerson' | 'status' | 'actions';
const VINCULOGRAMA_TABLE_STORAGE_KEY = 'traccion.tableView.vinculograma.main';
const vinculogramaTableColumnIds: readonly VinculogramaTableColumnId[] = [
  'employeeNumber',
  'nombreCompleto',
  'linkedPerson',
  'status',
  'actions',
];
const defaultVinculogramaTablePreferences: TableViewPreferences<VinculogramaTableColumnId> = {
  sort: null,
  columnWidths: {},
  columnOrder: null,
};

const EXPIRED_VISIBILITY_KEY = 'traccion.v1.vinculograma.showExpired';

const vinculogramaExportColumns = (today: string): ExportColumn<Vinculograma>[] => [
  { key: 'employeeNumber', header: 'Nº empleado', value: (record) => record.employeeNumber },
  { key: 'nombreCompleto', header: 'Nombre', value: (record) => record.nombreCompleto },
  { key: 'linkedPerson', header: 'Persona vinculada', value: (record) => record.linkedPerson },
  { key: 'requestDate', header: 'Fecha solicitud', value: (record) => record.requestDate },
  { key: 'expiryDate', header: 'Fecha vigencia', value: (record) => record.expiryDate },
  {
    key: 'estado',
    header: 'Estado',
    value: (record) => getVinculogramaStatus(record.expiryDate, today),
  },
];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function readExpiredVisibility(): boolean {
  return readStorageItem(EXPIRED_VISIBILITY_KEY) === 'true';
}

function persistExpiredVisibility(value: boolean): void {
  writeStorageItem(EXPIRED_VISIBILITY_KEY, String(value));
}

function toDraft(record: Vinculograma): VinculogramaDraft {
  return {
    employeeNumber: record.employeeNumber,
    nombreCompleto: record.nombreCompleto,
    linkedPerson: record.linkedPerson,
    requestDate: record.requestDate,
  };
}

function VinculogramaModal({
  draft,
  employees,
  expiryDate,
  mode,
  onChange,
  onClose,
  onDelete,
  onSave,
  recordId,
}: {
  draft: VinculogramaDraft;
  employees: ReturnType<typeof useEmployeeStore.getState>['employees'];
  expiryDate: string;
  mode: 'create' | 'edit';
  onChange: (draft: VinculogramaDraft) => void;
  onClose: () => void;
  onDelete: () => void;
  onSave: () => Promise<{ ok: boolean; message: string }>;
  recordId: string | null;
}) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const recordLock = useSharedRecordLock({
    module: 'vinculograma',
    recordId,
    enabled: mode === 'edit' && Boolean(recordId),
  });
  const isEditWithoutAcquiredLock = mode === 'edit' && recordLock.status !== 'acquired';
  const isReadOnly = recordLock.isReadOnly || isEditWithoutAcquiredLock;
  const lockMessage =
    recordLock.message ||
    (isEditWithoutAcquiredLock ? 'Adquiriendo bloqueo de edición compartida...' : '');
  const suggestions = useMemo(
    () => suggestEmployees(employees, draft.nombreCompleto),
    [draft.nombreCompleto, employees],
  );

  const selectSuggestion = (suggestion: EmployeeSuggestion) => {
    onChange({
      ...draft,
      employeeNumber: suggestion.empleado,
      nombreCompleto: suggestion.nombreApellidos,
    });
    setShowSuggestions(false);
  };

  const updateEmployeeNumber = (employeeNumber: string) => {
    const employee = findEmployeeByNumber(employees, employeeNumber);
    onChange({
      ...draft,
      employeeNumber,
      nombreCompleto: employee?.nombreApellidos ?? draft.nombreCompleto,
    });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl border border-metro-border bg-metro-surface shadow-2xl">
        <div className="flex items-start justify-between border-b border-metro-border px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-metro-red">
              Vinculograma
            </p>
            <h3 className="text-xl font-bold text-metro-text">
              {mode === 'create' ? 'Nuevo vínculo' : 'Editar vínculo'}
            </h3>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ModalDatabaseStatus />
          <button
            className="rounded-lg p-2 text-metro-muted hover:bg-metro-surface hover:text-metro-text"
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
          </div>
        </div>

        <div className="px-5 py-4">
          {lockMessage && (
            <p className={`mb-4 rounded-lg border px-3 py-2 text-xs font-semibold ${
              isReadOnly
                ? 'border-red-400/40 bg-red-950/20 text-red-100'
                : 'border-metro-border bg-metro-surface text-metro-muted'
            }`}>
              {lockMessage}
            </p>
          )}
          <fieldset disabled={isReadOnly} className="grid gap-4 disabled:opacity-70 md:grid-cols-2">
          <FieldLabel>
            Nº empleado
            <Input
              onChange={(event) => updateEmployeeNumber(event.target.value)}
              value={draft.employeeNumber}
            />
          </FieldLabel>
          <div className="relative">
            <FieldLabel>
              Nombre
              <Input
                onBlur={() => window.setTimeout(() => setShowSuggestions(false), 100)}
                onChange={(event) => {
                  onChange({ ...draft, nombreCompleto: event.target.value });
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                value={draft.nombreCompleto}
              />
            </FieldLabel>
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-metro-border bg-metro-surface shadow-xl">
                {suggestions.map((suggestion) => (
                  <button
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-metro-red/10"
                    key={suggestion.empleado}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectSuggestion(suggestion)}
                    type="button"
                  >
                    <span className="font-semibold text-metro-text">{suggestion.empleado}</span>
                    <span className="ml-2 text-metro-muted">{suggestion.nombreApellidos}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <FieldLabel>
            Persona vinculada
            <Input
              onChange={(event) => onChange({ ...draft, linkedPerson: event.target.value })}
              value={draft.linkedPerson}
            />
          </FieldLabel>
          <FieldLabel>
            Fecha solicitud
            <Input
              onChange={(event) => onChange({ ...draft, requestDate: event.target.value })}
              type="date"
              value={draft.requestDate}
            />
          </FieldLabel>
          <FieldLabel>
            Fecha vigencia
            <Input
              className="font-semibold"
              readOnly
              value={expiryDate}
            />
          </FieldLabel>
          </fieldset>
        </div>

        {saveStatus && (
          <p className="mx-5 mt-4 rounded-xl border border-red-400/40 bg-red-950/20 px-3 py-2 text-xs font-semibold text-red-100">
            {saveStatus}
          </p>
        )}

        <div className="flex flex-wrap justify-between gap-2 border-t border-metro-border px-5 py-4">
          <div>
            {mode === 'edit' && (
              <ActionButton variant="delete" iconOnly={false} disabled={isReadOnly || isSaving} onClick={onDelete}>
                Eliminar
              </ActionButton>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <ActionButton variant="secondary" iconOnly={false} onClick={onClose}>
              Cancelar
            </ActionButton>
            <ActionButton
              variant="save"
              iconOnly={false}
              disabled={isReadOnly || isSaving}
              onClick={() => {
                setIsSaving(true);
                setSaveStatus('');
                void onSave().then((result) => {
                  if (!result.ok) {
                    setSaveStatus(result.message);
                  }
                }).finally(() => setIsSaving(false));
              }}
            >
              {isSaving ? 'Guardando…' : 'Guardar'}
            </ActionButton>
            <InlineSaveFeedback />
          </div>
        </div>
      </div>
    </div>
  );
}


function SolicitudVinculogramaModal({
  employees,
  templatePath,
  onClose,
}: {
  employees: Employee[];
  templatePath: string;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [status, setStatus] = useState('');
  const [statusTone, setStatusTone] = useState<'success' | 'error' | 'muted'>('muted');
  const [isGenerating, setIsGenerating] = useState(false);

  const suggestions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return [];

    return employees
      .filter((employee) => !employee.deletedAt)
      .filter((employee) => {
        const normalizedName = employee.nombreApellidos.toLowerCase();
        return employee.empleado.includes(normalizedQuery) || normalizedName.includes(normalizedQuery);
      })
      .slice(0, 12);
  }, [employees, query]);

  const generateSolicitud = async () => {
    if (!selectedEmployee) {
      setStatus('Selecciona primero una persona de Plantilla.');
      setStatusTone('error');
      return;
    }

    if (!templatePath.trim()) {
      setStatus('Configura primero la plantilla DOCX de Vinculograma en Ajustes.');
      setStatusTone('error');
      return;
    }

    if (!window.traccion?.createOutlookDraft) {
      setStatus('Outlook solo está disponible en la aplicación de escritorio.');
      setStatusTone('error');
      return;
    }

    setIsGenerating(true);
    setStatus('Generando solicitud y abriendo Outlook...');
    setStatusTone('muted');
    try {
      const word = await generateVinculogramaSolicitudWord(selectedEmployee, templatePath);
      const buffer = await word.blob.arrayBuffer();
      const result = await window.traccion.createOutlookDraft({
        subject: '',
        html: '',
        to: [],
        cc: [],
        attachments: [{ fileName: word.fileName, buffer }],
      });

      if (!result.ok) {
        throw new Error(result.message || 'No se ha podido abrir Outlook.');
      }

      setStatus('Solicitud generada y correo abierto en Outlook.');
      setStatusTone('success');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'No se ha podido generar la solicitud.');
      setStatusTone('error');
    } finally {
      setIsGenerating(false);
    }
  };

  const statusClass =
    statusTone === 'success'
      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100'
      : statusTone === 'error'
        ? 'border-red-400/40 bg-red-950/20 text-red-100'
        : 'border-metro-border bg-metro-panel text-metro-muted';

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl border border-metro-border bg-metro-surface shadow-2xl">
        <div className="flex items-start justify-between border-b border-metro-border px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-metro-red">
              Vinculograma
            </p>
            <h3 className="text-xl font-bold text-metro-text">Enviar solicitud</h3>
          </div>
          <button
            className="rounded-lg p-2 text-metro-muted hover:bg-metro-surface hover:text-metro-text"
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <p className="text-sm text-metro-muted">
            Busca la persona solicitante en Plantilla. El DOCX se generará con nombre, DNI y fecha actual; los datos de la persona vinculada quedan en blanco.
          </p>

          <div className="relative">
            <FieldLabel>
              Buscar por nº empleado o nombre
              <Input
                autoFocus
                onChange={(event) => {
                  setQuery(event.target.value);
                  setSelectedEmployee(null);
                  setStatus('');
                }}
                placeholder="Ej.: 12345 o Apellidos, Nombre"
                value={query}
              />
            </FieldLabel>
            {suggestions.length > 0 && !selectedEmployee && (
              <div className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-metro-border bg-metro-surface shadow-xl">
                {suggestions.map((employee) => (
                  <button
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-metro-red/10"
                    key={employee.empleado}
                    onClick={() => {
                      setSelectedEmployee(employee);
                      setQuery(`${employee.empleado} · ${employee.nombreApellidos}`);
                    }}
                    type="button"
                  >
                    <span className="font-semibold text-metro-text">{employee.empleado}</span>
                    <span className="ml-2 text-metro-muted">{employee.nombreApellidos}</span>
                    <span className="ml-2 text-metro-muted">{employee.dni || employee.nif}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {selectedEmployee && (
            <div className="rounded-xl border border-metro-border bg-metro-panel px-3 py-2 text-sm">
              <p className="font-semibold text-metro-text">{selectedEmployee.nombreApellidos}</p>
              <p className="text-metro-muted">
                Nº {selectedEmployee.empleado} · DNI {selectedEmployee.dni || selectedEmployee.nif || 'sin informar'}
              </p>
            </div>
          )}

          {status && <p className={`rounded-xl border px-3 py-2 text-xs font-semibold ${statusClass}`}>{status}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-metro-border px-5 py-4">
          <ActionButton variant="secondary" iconOnly={false} onClick={onClose}>
            Cancelar
          </ActionButton>
          <ActionButton
            variant="save"
            iconOnly={false}
            disabled={isGenerating || !selectedEmployee}
            onClick={() => void generateSolicitud()}
          >
            {isGenerating ? 'Generando…' : 'Generar Word'}
          </ActionButton>
        </div>
      </div>
    </div>
  );
}

function VinculogramaTable({
  emptyText,
  records,
  today,
  onDelete,
  onEdit,
  preferences,
  setSort,
  setColumnWidth,
  setColumnOrder,
  resetColumnWidths,
  resetPreferences,
}: {
  emptyText: string;
  records: Vinculograma[];
  today: string;
  onDelete: (record: Vinculograma) => void;
  onEdit: (record: Vinculograma) => void;
  preferences: TableViewPreferences<VinculogramaTableColumnId>;
  setSort: (sort: TableSortState<VinculogramaTableColumnId> | null) => void;
  setColumnWidth: (columnId: VinculogramaTableColumnId, width: number) => void;
  setColumnOrder: (columnOrder: VinculogramaTableColumnId[]) => void;
  resetColumnWidths: () => void;
  resetPreferences: () => void;
}) {  const columns = useMemo<Array<DataTableColumn<Vinculograma, VinculogramaTableColumnId>>>(
    () => [
      {
        id: 'employeeNumber',
        header: 'Nº empleado',
        accessor: (record) => Number(record.employeeNumber) || record.employeeNumber,
        render: (record) => record.employeeNumber,
        width: 120,
        minWidth: 95,
        maxWidth: 180,
        sortable: true,
        className: 'font-semibold text-metro-text',
      },
      {
        id: 'nombreCompleto',
        header: 'Nombre',
        accessor: (record) => record.nombreCompleto,
        render: (record) => record.nombreCompleto,
        width: 230,
        minWidth: 160,
        maxWidth: 420,
        sortable: true,
        className: 'text-metro-text',
      },
      {
        id: 'linkedPerson',
        header: 'Persona vinculada',
        accessor: (record) => record.linkedPerson,
        render: (record) => record.linkedPerson,
        width: 230,
        minWidth: 160,
        maxWidth: 420,
        sortable: true,
        className: 'text-metro-muted',
      },
      {
        id: 'status',
        header: 'Estado / Fecha vigencia',
        accessor: (record) => `${getVinculogramaStatus(record.expiryDate, today)} ${record.expiryDate}`,
        render: (record) => {
          const status = getVinculogramaStatus(record.expiryDate, today);
          const tone = status === 'Vigente' ? 'success' : 'warning';

          return (
            <StatusBadge tone={tone}>
              {status} · {record.expiryDate}
            </StatusBadge>
          );
        },
        width: 180,
        minWidth: 145,
        maxWidth: 260,
        sortable: true,
      },
      {
        id: 'actions',
        header: 'Acciones',
        render: (record) => (
          <ActionButton
            size="sm"
            variant="delete"
            iconOnly={false}
            onClick={(event) => {
              event.stopPropagation();
              onDelete(record);
            }}
          >
            Eliminar
          </ActionButton>
        ),
        width: 110,
        minWidth: 95,
        maxWidth: 130,
        resizable: false,
        isActionColumn: true,
        className: 'whitespace-nowrap',
      },
    ],
    [onDelete, today],
  );

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <ActionButton size="sm" variant="secondary" iconOnly={false} onClick={resetPreferences}>
          <RotateCcw size={14} /> Restablecer vista
        </ActionButton>
      </div>
      <DataTable
        ariaLabel="Vinculograma"
        columnOrder={preferences.columnOrder}
        columnWidths={preferences.columnWidths}
          onResetColumnWidths={resetColumnWidths}
        columns={columns}
        emptyMessage={emptyText}
        getRowId={(record) => record.id}
        onColumnOrderChange={setColumnOrder}
        onColumnWidthChange={setColumnWidth}
        onRowClick={onEdit}
        onSortChange={setSort}
        rows={records}
        sort={preferences.sort}
      />
    </div>
  );
}

export function VinculogramaPage() {
  const { records, load, createWithConcurrencyCheck, updateWithConcurrencyCheck, removeWithConcurrencyCheck } = useVinculogramaStore();
  const { employees, load: loadEmployees } = useEmployeeStore();
  const rutaPlantillaVinculograma = useConfiguracionStore((state) => state.rutaPlantillaVinculograma);
  const [draft, setDraft] = useState<VinculogramaDraft>(EMPTY_VINCULOGRAMA_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showSolicitudModal, setShowSolicitudModal] = useState(false);
  const [showExpired, setShowExpired] = useState(readExpiredVisibility);
  const { alert, dialogNode } = useAppDialog();
  const today = todayIso();
  const expiryDate = calculateExpiryDate(draft.requestDate);

  useEffect(() => {
    load();
    loadEmployees();
  }, [load, loadEmployees]);

  const { vigentes, vencidos } = useMemo(
    () => splitVinculogramasByStatus(records, today),
    [records, today],
  );

  const {
    preferences: tablePreferences,
    setSort: setTableSort,
    setColumnWidth: setTableColumnWidth,
    setColumnOrder: setTableColumnOrder,
    resetColumnWidths: resetTableColumnWidths,
    resetPreferences: resetTablePreferences,
  } = useTableViewPreferences<VinculogramaTableColumnId>({
    storageKey: VINCULOGRAMA_TABLE_STORAGE_KEY,
    defaultPreferences: defaultVinculogramaTablePreferences,
    validColumnIds: vinculogramaTableColumnIds,
  });

  const openCreateModal = () => {
    setDraft(EMPTY_VINCULOGRAMA_DRAFT);
    setEditingId(null);
    setShowModal(true);
  };

  const openEditModal = (record: Vinculograma) => {
    setDraft(toDraft(record));
    setEditingId(record.id);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
    setDraft(EMPTY_VINCULOGRAMA_DRAFT);
  };

  const acquireMutationLock = useCallback(async (recordId: string) => {
    const payload = { module: 'vinculograma', recordId };
    const api = window.traccion;
    const result = await api?.acquireRecordLock?.(payload);
    if (result?.status === 'locked') {
      await alert(result.message, { type: 'warning' });
      return false;
    }
    return true;
  }, [alert]);

  const releaseMutationLock = useCallback(async (recordId: string) => {
    await window.traccion?.releaseRecordLock?.({ module: 'vinculograma', recordId });
  }, []);

  const saveRecord = async (): Promise<{ ok: boolean; message: string }> => {
    if (!draft.employeeNumber.trim() || !draft.nombreCompleto.trim() || !draft.requestDate.trim()) {
      return { ok: false, message: 'Empleado, nombre y fecha de solicitud son obligatorios.' };
    }

    if (editingId) {
      const currentRecord = records.find((record) => record.id === editingId);
      const result = await updateWithConcurrencyCheck(editingId, draft, currentRecord?.updatedAt ?? null);
      if (result.ok) {
        closeModal();
      }
      return result;
    }

    const result = await createWithConcurrencyCheck(draft);
    if (result.ok) {
      closeModal();
    }
    return result;
  };

  const deleteRecord = async () => {
    if (editingId) {
      const currentRecord = records.find((record) => record.id === editingId);
      const result = await removeWithConcurrencyCheck(editingId, currentRecord?.updatedAt ?? null);
      if (!result.ok) {
        await alert(result.message, { type: 'error' });
        return;
      }
    }
    closeModal();
  };

  const deleteTableRecord = async (record: Vinculograma) => {
    if (!(await acquireMutationLock(record.id))) {
      return;
    }
    const result = await removeWithConcurrencyCheck(record.id, record.updatedAt);
    if (!result.ok) {
      await alert(result.message, { type: 'error' });
    }
    await releaseMutationLock(record.id);
  };

  const toggleExpired = () => {
    const nextValue = !showExpired;
    setShowExpired(nextValue);
    persistExpiredVisibility(nextValue);
  };

  return (
    <section className="space-y-4" id="vinculograma">
      <div className="rounded-2xl border border-metro-border bg-metro-surface p-4 shadow-card">
        <PageHeader
          title="Vinculograma"
          subtitle="Gestión de vínculos con cálculo automático de fecha de vigencia."
          helpSections={VINCULOGRAMA_HELP_SECTIONS}
          helpSubtitle="Guía rápida de vínculos, vigencias, histórico y relación con plantilla."
          className="mb-0"
          actions={
            <div className="flex flex-wrap gap-2">
              <ActionButton variant="word" iconOnly={false} onClick={() => setShowSolicitudModal(true)}>
                Enviar solicitud Word
              </ActionButton>
              <ActionButton variant="add" iconOnly={false} onClick={openCreateModal}>
                Nuevo vínculo
              </ActionButton>
            </div>
          }
        />
      </div>

      <div className="rounded-2xl border border-metro-border bg-metro-surface p-4 shadow-card">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-metro-text">
            <Link2 size={16} className="text-metro-red" /> Vinculogramas vigentes
            <ExportPrintButtons
              payload={{
                title: 'Vinculogramas vigentes',
                filename: 'vinculogramas-vigentes',
                columns: reorderExportColumns(vinculogramaExportColumns(today), tablePreferences.columnOrder),
                rows: vigentes,
                filterLabel: 'Estado: vigente',
              }}
            />
          </div>
          <span className="rounded-full bg-metro-success/10 px-3 py-1 text-xs font-bold text-emerald-200">
            {vigentes.length} registros
          </span>
        </div>
        <div className="overflow-auto">
          <VinculogramaTable
            emptyText="No hay vinculogramas vigentes."
            onDelete={deleteTableRecord}
            onEdit={openEditModal}
            records={vigentes}
            today={today}
            preferences={tablePreferences}
            setSort={setTableSort}
            setColumnWidth={setTableColumnWidth}
            setColumnOrder={setTableColumnOrder}
            resetColumnWidths={resetTableColumnWidths}
            resetPreferences={resetTablePreferences}
          />
        </div>
      </div>

      <div className="rounded-2xl border border-metro-border bg-metro-surface p-4 shadow-card">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-metro-text">
            <Search size={16} className="text-metro-red" /> Vinculogramas vencidos
            <span className="rounded-full bg-metro-warning/10 px-3 py-1 text-xs font-bold text-amber-200">
              {vencidos.length} registros
            </span>
            <ExportPrintButtons
              payload={{
                title: 'Vinculogramas vencidos',
                filename: 'vinculogramas-vencidos',
                columns: reorderExportColumns(vinculogramaExportColumns(today), tablePreferences.columnOrder),
                rows: vencidos,
                filterLabel: 'Estado: vencido',
              }}
            />
          </div>
          <ActionButton variant="secondary" iconOnly={false} onClick={toggleExpired}>
            {showExpired ? 'Ocultar' : 'Mostrar'}
          </ActionButton>
        </div>
        {showExpired && (
          <div className="overflow-auto">
            <VinculogramaTable
              emptyText="No hay vinculogramas vencidos."
              onDelete={deleteTableRecord}
              onEdit={openEditModal}
              records={vencidos}
              today={today}
              preferences={tablePreferences}
              setSort={setTableSort}
              setColumnWidth={setTableColumnWidth}
              setColumnOrder={setTableColumnOrder}
              resetColumnWidths={resetTableColumnWidths}
              resetPreferences={resetTablePreferences}
            />
          </div>
        )}
      </div>

      {showSolicitudModal && (
        <SolicitudVinculogramaModal
          employees={employees}
          templatePath={rutaPlantillaVinculograma}
          onClose={() => setShowSolicitudModal(false)}
        />
      )}

      {showModal && (
        <VinculogramaModal
          draft={draft}
          employees={employees}
          expiryDate={expiryDate}
          mode={editingId ? 'edit' : 'create'}
          onChange={setDraft}
          onClose={closeModal}
          onDelete={() => { void deleteRecord(); }}
          onSave={saveRecord}
          recordId={editingId}
        />
      )}
      {dialogNode}
    </section>
  );
}
