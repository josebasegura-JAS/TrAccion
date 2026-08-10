import { useMemo, useState } from 'react';
import { useSharedRecordLock } from '../../../services/useSharedRecordLock';
import { InlineSaveFeedback } from '../../../components/InlineSaveFeedback';
import { ActionButton } from '../../../components/ui/ActionButton';
import { FieldLabel, Input, Select, Textarea } from '../../../components/ui/Field';
import { ModalCloseButton } from '../../../components/ui/ModalCloseButton';
import { ModalBody, ModalFooter, ModalHeader, ModalShell, ModalTitle } from '../../../components/ui/ModalShell';
import { Notice } from '../../../components/ui/Notice';
import { AuditHistoryButton } from '../../../shared/audit/AuditHistoryButton';
import { ModalDatabaseStatus } from '../../../components/ModalDatabaseStatus';
import { useUnsavedChanges } from '../../../hooks/useUnsavedChanges';
import { useEditorShortcuts } from '../../../hooks/useEditorShortcuts';
import { useEmployeeStore } from '../../plantilla/store/useEmployeeStore';
import {
  EMPTY_LICENCIA_SIN_SUELDO_DRAFT,
  calculateFechaFinForTipo,
  findEmployeeByNumber,
  licenciaSinSueldoEstados,
  licenciaSinSueldoTipos,
  normalizeDraftForTipo,
  suggestEmployees,
  validateLicenciaSinSueldoDraft,
  type EmployeeSuggestion,
  type LicenciaSinSueldoActualizacion,
  type LicenciaSinSueldoDraft,
  type LicenciaSinSueldoEstado,
  type LicenciaSinSueldoRecord,
  type LicenciaSinSueldoTipo,
} from '../domain/licenciaSinSueldo';
import {
  createUpdateId,
  formatEstado,
  todayIso,
  toDraft,
  type EditorMode,
} from './licenciasSinSueldoPage.helpers';

export function LicenciasSinSueldoEditor({
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
  const { requestClose, dialogNode } = useUnsavedChanges({
    currentValue: draft,
    initialValue: record ? toDraft(record) : { ...EMPTY_LICENCIA_SIN_SUELDO_DRAFT, fechaSolicitud: todayIso() },
    enabled: !isReadOnly,
    onDiscard: onClose,
  });

  const suggestions = useMemo(
    () =>
      suggestEmployees(employees, employeeSearch).filter(
        (suggestion) => suggestion.empleado !== draft.numeroEmpleado,
      ),
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

    let draftToSave = draft;
    const isNewDenial = draft.estado === 'denegada' && record?.estado !== 'denegada';
    const initialUpdateCount = record?.actualizaciones.length ?? 0;
    const hasNewRegisteredUpdate = draft.actualizaciones.length > initialUpdateCount;
    const pendingUpdateText = newUpdate.trim();

    if (isNewDenial && !hasNewRegisteredUpdate && !pendingUpdateText) {
      setErrors(['Para denegar una solicitud debes indicar el motivo en Actualizaciones.']);
      return;
    }

    if (isNewDenial && pendingUpdateText) {
      draftToSave = {
        ...draftToSave,
        actualizaciones: [
          ...draftToSave.actualizaciones,
          { id: createUpdateId(), fecha: new Date().toISOString(), texto: pendingUpdateText },
        ],
      };
    }

    const normalizedDraft = normalizeDraftForTipo(draftToSave);
    const result = validateLicenciaSinSueldoDraft(normalizedDraft);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setIsSaving(true);
    setSaveStatus('');
    void onSave(normalizedDraft)
      .then((saveResult) => {
        if (!saveResult.ok) {
          setSaveStatus(saveResult.message);
        }
      })
      .finally(() => setIsSaving(false));
  };


  useEditorShortcuts({
    canSave: !isReadOnly && !isSaving,
    onClose: () => void requestClose(),
    onSave: handleSave,
  });

  return (
    <ModalShell
      labelledBy="licencia-editor-title"
      maxWidthClassName="max-w-4xl"
      onClose={() => void requestClose()}
      panelClassName="bg-metro-panel"
    >
      <ModalHeader>
        <ModalTitle
          id="licencia-editor-title"
          subtitle="Doble clic en una fila abre esta ficha para editar el flujo."
        >
          {mode === 'create' ? 'Nueva licencia o permiso' : 'Ficha de licencia o permiso'}
        </ModalTitle>
        <div className="flex shrink-0 items-center gap-2">
          <ModalDatabaseStatus />
          <ModalCloseButton onClick={() => void requestClose()} />
        </div>
      </ModalHeader>

      <ModalBody className="space-y-4">
          {lockMessage && <Notice tone={isReadOnly ? 'error' : 'muted'}>{lockMessage}</Notice>}

          {saveStatus && (
            <Notice tone="error">
              {saveStatus}
            </Notice>
          )}

          {errors.length > 0 && (
            <Notice tone="error">
              <ul className="list-disc space-y-1 pl-5">
                {errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </Notice>
          )}

          <fieldset disabled={isReadOnly} className="space-y-4 disabled:opacity-70">
            {mode === 'edit' && draft.estado !== 'historico' && draft.estado !== 'denegada' && (
              <div className="flex flex-wrap gap-2 rounded-xl border border-metro-border bg-slate-950/10 p-3">
                <span className="w-full text-xs font-semibold text-metro-muted">
                  Flujo
                </span>
                <ActionButton
                  variant="approve"
                  iconOnly={false}
                  disabled={draft.estado !== 'pendiente_aprobacion'}
                  onClick={() => updateDraft('estado', 'pendiente_firma')}
                >
                  Aprobar
                </ActionButton>
                <ActionButton
                  variant="secondary"
                  iconOnly={false}
                  disabled={draft.estado !== 'pendiente_firma'}
                  onClick={() => updateDraft('estado', 'vigente')}
                >
                  Firma recibida / finalizar
                </ActionButton>
                <ActionButton
                  variant="delete"
                  iconOnly={false}
                  disabled={
                    draft.estado !== 'pendiente_aprobacion' && draft.estado !== 'pendiente_firma'
                  }
                  onClick={() => updateDraft('estado', 'denegada')}
                >
                  Denegar
                </ActionButton>
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <FieldLabel>
                Nº empleado
                <Input
                  onBlur={handleEmployeeNumberBlur}
                  onChange={(event) => updateDraft('numeroEmpleado', event.target.value)}
                  value={draft.numeroEmpleado}
                />
              </FieldLabel>
              <FieldLabel>
                Buscar en plantilla
                <div className="relative">
                  <Input
                    onChange={(event) => setEmployeeSearch(event.target.value)}
                    placeholder="Número o nombre"
                    value={employeeSearch}
                  />
                  {suggestions.length > 0 && (
                    <div className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-xl border border-metro-border bg-metro-surface shadow-xl">
                      {suggestions.map((suggestion) => (
                        <button
                          className="block w-full px-3 py-2 text-left text-sm text-metro-text hover:bg-metro-red/10"
                          key={suggestion.empleado}
                          onClick={() => applyEmployee(suggestion)}
                          type="button"
                        >
                          {suggestion.empleado} · {suggestion.nombreApellidos}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </FieldLabel>
              <FieldLabel>
                Nombre completo
                <Input
                  onChange={(event) => updateDraft('nombreCompleto', event.target.value)}
                  value={draft.nombreCompleto}
                />
              </FieldLabel>
              <FieldLabel>
                Tipo
                <Select
                  onChange={(event) =>
                    updateDraft('tipo', event.target.value as LicenciaSinSueldoTipo)
                  }
                  value={draft.tipo}
                >
                  {licenciaSinSueldoTipos.map((tipo) => (
                    <option key={tipo}>{tipo}</option>
                  ))}
                </Select>
              </FieldLabel>
              <FieldLabel>
                Fecha solicitud
                <Input
                  dateTone="request"
                  onChange={(event) => updateDraft('fechaSolicitud', event.target.value)}
                  type="date"
                  value={draft.fechaSolicitud}
                />
              </FieldLabel>
              <FieldLabel>
                Estado
                <Select
                  onChange={(event) =>
                    updateDraft('estado', event.target.value as LicenciaSinSueldoEstado)
                  }
                  value={draft.estado}
                >
                  {licenciaSinSueldoEstados.map((estado) => (
                    <option key={estado} value={estado}>
                      {formatEstado(estado)}
                    </option>
                  ))}
                </Select>
              </FieldLabel>
              <FieldLabel>
                Fecha inicio
                <Input
                  dateTone="start"
                  onChange={(event) => updateDraft('fechaInicio', event.target.value)}
                  type="date"
                  value={draft.fechaInicio}
                />
              </FieldLabel>
              <FieldLabel>
                Fecha fin
                <Input
                  dateTone="end"
                  disabled={draft.tipo === 'Año de Libre Disposición'}
                  onChange={(event) => updateDraft('fechaFin', event.target.value)}
                  type="date"
                  value={draft.fechaFin}
                />
              </FieldLabel>
            </div>

            <FieldLabel>
              Observaciones
              <Textarea
                className="min-h-24 resize-y"
                onChange={(event) => updateDraft('observaciones', event.target.value)}
                value={draft.observaciones}
              />
            </FieldLabel>

            <section className="rounded-xl border border-metro-border bg-slate-950/10 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-xs font-bold text-metro-muted">
                  Actualizaciones
                </h3>
                <ActionButton variant="add" iconOnly={false} onClick={addUpdate}>
                  Añadir
                </ActionButton>
              </div>
              <Textarea
                className="min-h-16"
                onChange={(event) => setNewUpdate(event.target.value)}
                placeholder={
                  draft.estado === 'denegada'
                    ? 'Motivo de la denegación (obligatorio)'
                    : 'Nueva observación o actualización'
                }
                value={newUpdate}
              />
              <div className="mt-3 space-y-2">
                {draft.actualizaciones.length === 0 ? (
                  <p className="text-xs text-metro-muted">Sin actualizaciones registradas.</p>
                ) : (
                  draft.actualizaciones.map((actualizacion: LicenciaSinSueldoActualizacion) => (
                    <div
                      className="rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm"
                      key={actualizacion.id}
                    >
                      <p className="text-[11px] text-metro-muted">
                        {new Date(actualizacion.fecha).toLocaleString('es-ES')}
                      </p>
                      <p className="text-metro-text">{actualizacion.texto}</p>
                    </div>
                  ))
                )}
              </div>
            </section>
          </fieldset>
      </ModalBody>

      <ModalFooter className="justify-between">
          <div>
            {mode === 'edit' && (
              <ActionButton
                variant="delete"
                iconOnly={false}
                disabled={isReadOnly}
                onClick={onDelete}
              >
                Eliminar
              </ActionButton>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <ActionButton variant="secondary" iconOnly={false} onClick={() => void requestClose()}>
              Cancelar <kbd className="ml-1 text-[10px] opacity-70">Esc</kbd>
            </ActionButton>
            {mode === 'edit' && record && (
              <AuditHistoryButton
                entityId={record.id}
                entityTitle={record.nombreCompleto || 'Licencia sin nombre'}
                module="licencias-sin-sueldo"
              />
            )}
            <ActionButton
              disabled={isReadOnly || isSaving}
              iconOnly={false}
              onClick={handleSave}
              size="sm"
              variant="save"
            >
              {isSaving ? 'Guardando…' : <>Guardar <kbd className="ml-1 text-[10px] opacity-70">Ctrl S</kbd></>}
            </ActionButton>
            <InlineSaveFeedback />
          </div>
      </ModalFooter>
      {dialogNode}
    </ModalShell>
  );
}
