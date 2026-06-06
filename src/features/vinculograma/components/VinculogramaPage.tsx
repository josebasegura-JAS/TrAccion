import { Link2, Plus, Save, Search, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useEmployeeStore } from '../../plantilla/store/useEmployeeStore';
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

const EXPIRED_VISIBILITY_KEY = 'traccion.v1.vinculograma.showExpired';
const inputClass =
  'mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red';
const labelClass = 'block text-xs font-semibold uppercase tracking-wide text-metro-muted';
const buttonClass =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-metro-red px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-metro-dark';
const secondaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm font-semibold text-metro-text transition hover:border-metro-red hover:text-metro-red';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function readExpiredVisibility(): boolean {
  return window.localStorage.getItem(EXPIRED_VISIBILITY_KEY) === 'true';
}

function persistExpiredVisibility(value: boolean): void {
  window.localStorage.setItem(EXPIRED_VISIBILITY_KEY, String(value));
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
}: {
  draft: VinculogramaDraft;
  employees: ReturnType<typeof useEmployeeStore.getState>['employees'];
  expiryDate: string;
  mode: 'create' | 'edit';
  onChange: (draft: VinculogramaDraft) => void;
  onClose: () => void;
  onDelete: () => void;
  onSave: () => void;
}) {
  const [showSuggestions, setShowSuggestions] = useState(false);
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
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 p-4">
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
          <button
            className="rounded-lg p-2 text-metro-muted hover:bg-metro-surface hover:text-metro-text"
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-4 px-5 py-4 md:grid-cols-2">
          <label className={labelClass}>
            Nº empleado
            <input
              className={inputClass}
              onChange={(event) => updateEmployeeNumber(event.target.value)}
              value={draft.employeeNumber}
            />
          </label>
          <div className="relative">
            <label className={labelClass}>
              Nombre
              <input
                className={inputClass}
                onBlur={() => window.setTimeout(() => setShowSuggestions(false), 100)}
                onChange={(event) => {
                  onChange({ ...draft, nombreCompleto: event.target.value });
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                value={draft.nombreCompleto}
              />
            </label>
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
          <label className={labelClass}>
            Persona vinculada
            <input
              className={inputClass}
              onChange={(event) => onChange({ ...draft, linkedPerson: event.target.value })}
              value={draft.linkedPerson}
            />
          </label>
          <label className={labelClass}>
            Fecha solicitud
            <input
              className={inputClass}
              onChange={(event) => onChange({ ...draft, requestDate: event.target.value })}
              type="date"
              value={draft.requestDate}
            />
          </label>
          <label className={labelClass}>
            Fecha vigencia
            <input
              className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm font-semibold text-metro-text"
              readOnly
              value={expiryDate}
            />
          </label>
        </div>

        <div className="flex flex-wrap justify-between gap-2 border-t border-metro-border px-5 py-4">
          <div>
            {mode === 'edit' && (
              <button className={secondaryButtonClass} onClick={onDelete} type="button">
                <Trash2 size={16} /> Eliminar
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button className={secondaryButtonClass} onClick={onClose} type="button">
              Cancelar
            </button>
            <button className={buttonClass} onClick={onSave} type="button">
              <Save size={16} /> Guardar
            </button>
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
  return (
    <div className="overflow-hidden rounded-xl border border-metro-border">
      <table className="w-full table-fixed text-left text-xs">
        <thead className="bg-metro-panel text-[11px] uppercase tracking-wide text-metro-muted">
          <tr>
            <th className="w-[120px] px-3 py-2">Nº empleado</th>
            <th className="px-3 py-2">Nombre</th>
            <th className="px-3 py-2">Persona vinculada</th>
            <th className="w-[180px] px-3 py-2">Estado / Fecha vigencia</th>
            <th className="w-[110px] px-3 py-2 text-right">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-metro-border bg-metro-surface">
          {records.length === 0 && (
            <tr>
              <td className="px-3 py-6 text-center text-sm text-metro-muted" colSpan={5}>
                {emptyText}
              </td>
            </tr>
          )}
          {records.map((record) => {
            const status = getVinculogramaStatus(record.expiryDate, today);
            const statusClass =
              status === 'Vigente'
                ? 'bg-metro-success/10 text-emerald-200'
                : 'bg-metro-warning/10 text-amber-200';

            return (
              <tr
                className="cursor-pointer hover:bg-metro-red/10"
                key={record.id}
                onClick={() => onEdit(record)}
                onDoubleClick={() => onEdit(record)}
              >
                <td
                  className="truncate px-3 py-2 font-semibold text-metro-text"
                  title={record.employeeNumber}
                >
                  {record.employeeNumber}
                </td>
                <td className="truncate px-3 py-2 text-metro-text" title={record.nombreCompleto}>
                  {record.nombreCompleto}
                </td>
                <td className="truncate px-3 py-2 text-metro-muted" title={record.linkedPerson}>
                  {record.linkedPerson}
                </td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${statusClass}`}>
                    {status} · {record.expiryDate}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  <button
                    className="rounded-lg bg-metro-red px-2.5 py-1 text-xs font-semibold text-white hover:bg-metro-dark"
                    onClick={(event) => {
                      event.stopPropagation();
                      onDelete(record);
                    }}
                    type="button"
                  >
                    Eliminar
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function VinculogramaPage() {
  const { records, load, create, update, remove } = useVinculogramaStore();
  const { employees, load: loadEmployees } = useEmployeeStore();
  const [draft, setDraft] = useState<VinculogramaDraft>(EMPTY_VINCULOGRAMA_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showExpired, setShowExpired] = useState(readExpiredVisibility);
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

  const saveRecord = () => {
    if (!draft.employeeNumber.trim() || !draft.nombreCompleto.trim() || !draft.requestDate.trim()) {
      return;
    }

    if (editingId) {
      update(editingId, draft);
    } else {
      create(draft);
    }
    closeModal();
  };

  const deleteRecord = () => {
    if (editingId) {
      remove(editingId);
    }
    closeModal();
  };

  const deleteTableRecord = (record: Vinculograma) => {
    remove(record.id);
  };

  const toggleExpired = () => {
    const nextValue = !showExpired;
    setShowExpired(nextValue);
    persistExpiredVisibility(nextValue);
  };

  return (
    <section className="space-y-4" id="vinculograma">
      <div className="rounded-2xl border border-metro-border bg-metro-surface p-4 shadow-card">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-metro-red">
              Módulo
            </p>
            <h2 className="text-2xl font-bold text-metro-text">Vinculograma</h2>
            <p className="mt-0.5 text-base text-metro-muted">
              Gestión de vínculos con cálculo automático de fecha de vigencia.
            </p>
          </div>
          <button className={buttonClass} onClick={openCreateModal} type="button">
            <Plus size={16} /> Nuevo vínculo
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-metro-border bg-metro-surface p-4 shadow-card">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-metro-text">
            <Link2 size={16} className="text-metro-red" /> Vinculogramas vigentes
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
          </div>
          <button className={secondaryButtonClass} onClick={toggleExpired} type="button">
            {showExpired ? 'Ocultar' : 'Mostrar'}
          </button>
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
          onDelete={deleteRecord}
          onSave={saveRecord}
        />
      )}
    </section>
  );
}
