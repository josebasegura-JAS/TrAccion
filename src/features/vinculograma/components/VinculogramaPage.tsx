import { Link2, RotateCcw, Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DataTable, type DataTableColumn } from '../../../shared/table/DataTable';
import { useTableViewPreferences, type TableViewPreferences } from '../../../shared/table/useTableViewPreferences';
import { useSharedRecordLock } from '../../../services/useSharedRecordLock';
import { useEmployeeStore } from '../../plantilla/store/useEmployeeStore';
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
import { ExportPrintButtons } from '../../../shared/print/ExportPrintButtons';
import { InlineSaveFeedback } from '../../../components/InlineSaveFeedback';
import type { ModuleHelpSection } from '../../../components/ModuleHelp';
import { useAppDialog } from '../../../hooks/useAppDialog';
import { ModalDatabaseStatus } from '../../../components/ModalDatabaseStatus';
import { ActionButton } from '../../../components/ui/ActionButton';
import { FieldLabel, Input } from '../../../components/ui/Field';
import { PageHeader } from '../../../components/ui/PageHeader';


const VINCULOGRAMA_HELP_SECTIONS: ModuleHelpSection[] = [
  {
    title: 'Para qué sirve',
    items: [
      'Registra vínculos entre personas y calcula la vigencia aplicable de forma automática.',
      'Se apoya en Plantilla para localizar personas por número de empleado y nombre completo.',
      'Separa vínculos vigentes e históricos para consultar relaciones activas sin perder antecedentes.',
    ],
  },
  {
    title: 'Uso recomendado',
    items: [
      'Selecciona siempre la persona desde plantilla cuando sea posible para evitar duplicidades.',
      'Comprueba fechas y estado antes de guardar un nuevo vínculo.',
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

function VinculogramaTable({
  emptyText,
  records,
  today,
  onDelete,
  onEdit,
}: {
  emptyText: string;
  records: Vinculograma[];
  today: string;
  onDelete: (record: Vinculograma) => void;
  onEdit: (record: Vinculograma) => void;
}) {
  const { preferences, setSort, setColumnWidth, resetColumnWidths, resetPreferences } =
    useTableViewPreferences<VinculogramaTableColumnId>({
      storageKey: VINCULOGRAMA_TABLE_STORAGE_KEY,
      defaultPreferences: defaultVinculogramaTablePreferences,
      validColumnIds: vinculogramaTableColumnIds,
    });

  const columns = useMemo<Array<DataTableColumn<Vinculograma, VinculogramaTableColumnId>>>(
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
          const statusClass =
            status === 'Vigente'
              ? 'bg-metro-success/10 text-emerald-200'
              : 'bg-metro-warning/10 text-amber-200';

          return (
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${statusClass}`}>
              {status} · {record.expiryDate}
            </span>
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
        columnWidths={preferences.columnWidths}
          onResetColumnWidths={resetColumnWidths}
        columns={columns}
        emptyMessage={emptyText}
        getRowId={(record) => record.id}
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
  const [draft, setDraft] = useState<VinculogramaDraft>(EMPTY_VINCULOGRAMA_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
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
            <ActionButton variant="add" iconOnly={false} onClick={openCreateModal}>
              Nuevo vínculo
            </ActionButton>
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
                columns: vinculogramaExportColumns(today),
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
                columns: vinculogramaExportColumns(today),
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
            />
          </div>
        )}
      </div>

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
