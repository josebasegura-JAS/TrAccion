import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEmployeeStore } from '../features/plantilla/store/useEmployeeStore';
import {
  EMPTY_TELETRABAJO_DRAFT,
  type TeletrabajoDraft,
  type TeletrabajoSolicitud,
} from '../features/teletrabajo/domain/solicitud';
import { saveDocxWithDialog } from '../features/teletrabajo/domain/download';
import { useConfiguracionStore } from '../features/configuracion/store/useConfiguracionStore';
import { generateTeletrabajoWord } from '../features/teletrabajo/domain/word';
import {
  applyPlantillaDataToTeletrabajoDraft,
  findActiveEmployeeByEmpleado,
} from '../features/teletrabajo/domain/plantillaData';
import { useTeletrabajoStore } from '../features/teletrabajo/store/useTeletrabajoStore';
import { resolveTeletrabajoTipoSolicitud } from '../features/teletrabajo/domain/tipoSolicitud';
import { useSharedRecordLock } from '../services/useSharedRecordLock';
import { InlineSaveFeedback } from './InlineSaveFeedback';
import { ActionButton } from './ui/ActionButton';
import { AuditHistoryButton } from '../shared/audit/AuditHistoryButton';
import { TeletrabajoEditorFields } from './teletrabajo-editor/TeletrabajoEditorFields';
import { TeletrabajoEditorHeader } from './teletrabajo-editor/TeletrabajoEditorHeader';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { useEditorShortcuts } from '../hooks/useEditorShortcuts';
import { buildRecoverableDraftKey, useRecoverableDraft } from '../hooks/useRecoverableDraft';
import { ModalShell } from './ui/ModalShell';

function toDraft(solicitud: TeletrabajoSolicitud | null): TeletrabajoDraft {
  if (!solicitud) {
    return { ...EMPTY_TELETRABAJO_DRAFT };
  }

  return {
    empleado: solicitud.empleado,
    nombreApellidos: solicitud.nombreApellidos,
    puestoNomina: solicitud.puestoNomina,
    puestoOrganizativo: solicitud.puestoOrganizativo,
    residencia: solicitud.residencia,
    dni: solicitud.dni,
    direccionTeletrabajo: solicitud.direccionTeletrabajo,
    estado: solicitud.estado,
    tipoSolicitud: solicitud.tipoSolicitud,
    diasTeletrabajo: solicitud.diasTeletrabajo,
    fechaSolicitud: solicitud.fechaSolicitud,
    fechaOrdenador: solicitud.fechaOrdenador || EMPTY_TELETRABAJO_DRAFT.fechaOrdenador,
    fechaCascos: solicitud.fechaCascos || EMPTY_TELETRABAJO_DRAFT.fechaCascos,
    periodo: solicitud.periodo,
    observaciones: solicitud.observaciones,
    observacionesRrll: solicitud.observacionesRrll ?? '',
    validacionSeguridadInformatica: solicitud.validacionSeguridadInformatica,
    validacionPrevencion: solicitud.validacionPrevencion,
    validacionJefatura: solicitud.validacionJefatura ?? EMPTY_TELETRABAJO_DRAFT.validacionJefatura,
    validacionJefaturaRepetir:
      solicitud.validacionJefaturaRepetir ?? EMPTY_TELETRABAJO_DRAFT.validacionJefaturaRepetir,
    validacionDireccion: solicitud.validacionDireccion,
    revisado: Boolean(solicitud.revisado),
  };
}


function hasRequiredManualData(draft: TeletrabajoDraft): boolean {
  return [
    draft.empleado,
    draft.nombreApellidos,
    draft.puestoNomina,
    draft.residencia,
    draft.dni,
    draft.direccionTeletrabajo,
    draft.periodo,
    draft.fechaOrdenador,
    draft.fechaCascos,
  ].every((value) => value.trim().length > 0);
}

export function TeletrabajoEditor({
  solicitud,
  mode,
  onDone,
}: {
  solicitud: TeletrabajoSolicitud | null;
  mode: 'create' | 'edit';
  onDone: () => void;
}) {
  const createSolicitud = useTeletrabajoStore((state) => state.createWithConcurrencyCheck);
  const updateSolicitud = useTeletrabajoStore((state) => state.updateWithConcurrencyCheck);
  const removeSolicitud = useTeletrabajoStore((state) => state.removeWithConcurrencyCheck);
  const solicitudes = useTeletrabajoStore((state) => state.solicitudes);
  const employees = useEmployeeStore((state) => state.employees);
  const rutaPlantillaTeletrabajo = useConfiguracionStore((state) => state.rutaPlantillaTeletrabajo);
  const jobPositionTranslations = useEmployeeStore((state) => state.jobPositionTranslations);
  const [draft, setDraft] = useState<TeletrabajoDraft>(() => toDraft(solicitud));
  const [wordStatus, setWordStatus] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [loadedSolicitudIdentity, setLoadedSolicitudIdentity] = useState(
    () => `${mode}:${solicitud?.id ?? 'new'}`,
  );
  const [loadedSolicitudUpdatedAt, setLoadedSolicitudUpdatedAt] = useState(
    solicitud?.updatedAt ?? null,
  );
  const [isGeneratingWord, setIsGeneratingWord] = useState(false);
  const recordLock = useSharedRecordLock({
    module: 'teletrabajo',
    recordId: solicitud?.id ?? null,
    enabled: mode === 'edit' && Boolean(solicitud?.id),
  });

  useEffect(() => {
    const nextIdentity = `${mode}:${solicitud?.id ?? 'new'}`;
    if (nextIdentity !== loadedSolicitudIdentity) {
      setDraft(toDraft(solicitud));
      setWordStatus('');
      setSaveStatus('');
      setLoadedSolicitudIdentity(nextIdentity);
      setLoadedSolicitudUpdatedAt(solicitud?.updatedAt ?? null);
    }
  }, [loadedSolicitudIdentity, mode, solicitud]);

  const plantillaEmployee = useMemo(
    () => findActiveEmployeeByEmpleado(employees, draft.empleado),
    [draft.empleado, employees],
  );

  useEffect(() => {
    if (!plantillaEmployee) {
      return;
    }

    setDraft((current) => applyPlantillaDataToTeletrabajoDraft(current, plantillaEmployee));
  }, [plantillaEmployee]);

  const resolvedTipoSolicitud = useMemo(
    () =>
      resolveTeletrabajoTipoSolicitud(
        { empleado: draft.empleado, periodo: draft.periodo },
        solicitudes,
        {
          excludeSolicitudId: solicitud?.id ?? null,
        },
      ),
    [draft.empleado, draft.periodo, solicitud?.id, solicitudes],
  );

  useEffect(() => {
    setDraft((current) => {
      const nextTipoSolicitud = resolveTeletrabajoTipoSolicitud(current, solicitudes, {
        excludeSolicitudId: solicitud?.id ?? null,
      });
      return current.tipoSolicitud === nextTipoSolicitud
        ? current
        : { ...current, tipoSolicitud: nextTipoSolicitud };
    });
  }, [draft.empleado, draft.periodo, solicitud?.id, solicitudes]);

  const isNuevaPeticion = resolvedTipoSolicitud === 'nueva';
  const draftForSave = useMemo(
    () => ({ ...draft, tipoSolicitud: resolvedTipoSolicitud }),
    [draft, resolvedTipoSolicitud],
  );
  const employeeExists = Boolean(plantillaEmployee);
  const isCreate = mode === 'create';
  const hasExternalSolicitudUpdate =
    !isCreate &&
    Boolean(solicitud?.updatedAt) &&
    Boolean(loadedSolicitudUpdatedAt) &&
    solicitud?.updatedAt !== loadedSolicitudUpdatedAt;
  const isEditWithoutAcquiredLock = !isCreate && recordLock.status !== 'acquired';
  const isFormReadOnly = recordLock.isReadOnly || isEditWithoutAcquiredLock;
  const lockMessage =
    recordLock.message ||
    (isEditWithoutAcquiredLock ? 'Adquiriendo bloqueo de edición compartida...' : '');
  const canCreate = hasRequiredManualData(draft) && draft.diasTeletrabajo.length > 0;
  const canEdit = Boolean(solicitud);
  const canSubmit = (isCreate ? canCreate : canEdit) && !isFormReadOnly && !isSaving;
  const canGenerateWord = canCreate && !isFormReadOnly && !isSaving;
  const recoveryInitialValue = useMemo(() => toDraft(solicitud), [solicitud]);
  const recoveryStorageKey = buildRecoverableDraftKey('teletrabajo', solicitud?.id ?? 'new');
  const handleRecoverDraft = useCallback((value: TeletrabajoDraft) => setDraft(value), []);
  const { clearDraft: clearRecoveryDraft, dialogNode: recoveryDialogNode } = useRecoverableDraft({
    currentValue: draftForSave,
    initialValue: recoveryInitialValue,
    enabled: !isFormReadOnly,
    onRecover: handleRecoverDraft,
    storageKey: recoveryStorageKey,
  });
  const { requestClose, dialogNode } = useUnsavedChanges({
    currentValue: draftForSave,
    initialValue: recoveryInitialValue,
    enabled: !isFormReadOnly,
    onDiscard: () => {
      clearRecoveryDraft();
      onDone();
    },
  });
  const formRef = useRef<HTMLFormElement>(null);
  useEditorShortcuts({
    canSave: canSubmit,
    onClose: () => void requestClose(),
    onSave: () => formRef.current?.requestSubmit(),
  });

  const handleEmpleadoChange = (empleado: string) => {
    const employee = findActiveEmployeeByEmpleado(employees, empleado);

    setDraft((current) =>
      employee ? applyPlantillaDataToTeletrabajoDraft(current, employee) : { ...current, empleado },
    );
  };

  const handleGenerateWord = async () => {
    if (!canGenerateWord || isGeneratingWord || isFormReadOnly) {
      return;
    }

    setIsGeneratingWord(true);
    setWordStatus('');

    try {
      const result = await generateTeletrabajoWord(
        draft,
        plantillaEmployee,
        rutaPlantillaTeletrabajo,
        jobPositionTranslations,
      );
      await saveDocxWithDialog(result.blob, result.fileName);
      setWordStatus(`Word generado: ${result.detectedMarkers.length} marcadores detectados.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se ha podido generar el Word.';
      setWordStatus(message);
    } finally {
      setIsGeneratingWord(false);
    }
  };

  return (
    <>
      <ModalShell
        blockEditorShortcuts={false}
        labelledBy="teletrabajo-editor-title"
        maxWidthClassName="max-w-[820px]"
        onClose={() => void requestClose()}
        panelClassName="bg-metro-panel"
      >
        <TeletrabajoEditorHeader
          empleado={draft.empleado}
          isCreate={isCreate}
          isNuevaPeticion={isNuevaPeticion}
          nombreApellidos={draft.nombreApellidos || solicitud?.nombreApellidos || ''}
          onDone={() => void requestClose()}
          solicitudId={solicitud?.id ?? null}
        />

        <div className="flex min-h-0 flex-1 flex-col px-3 pb-3 pt-3">
        {lockMessage && (
          <p className={`mb-3 rounded-lg border px-3 py-2 text-xs font-semibold ${
            isFormReadOnly
              ? 'border-red-400/40 bg-red-950/20 text-red-100'
              : 'border-metro-border bg-metro-surface text-metro-muted'
          }`}>
            {lockMessage}
          </p>
        )}

        <form
          ref={formRef}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSubmit || isFormReadOnly || isSaving) {
              return;
            }

            if (isCreate) {
              setIsSaving(true);
              setSaveStatus('');
              void createSolicitud(draftForSave)
                .then((result) => {
                  if (result.ok) {
                    clearRecoveryDraft();
                    onDone();
                    return;
                  }
                  setSaveStatus(result.message);
                })
                .finally(() => setIsSaving(false));
              return;
            }

            if (!solicitud) {
              return;
            }

            setIsSaving(true);
            setSaveStatus('');
            void updateSolicitud(solicitud.id, draftForSave, loadedSolicitudUpdatedAt)
              .then((result) => {
                if (result.ok) {
                  clearRecoveryDraft();
                  onDone();
                  return;
                }
                setSaveStatus(result.message);
              })
              .finally(() => setIsSaving(false));
          }}
        >
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <TeletrabajoEditorFields
              draft={draft}
              employeeExists={employeeExists}
              isFormReadOnly={isFormReadOnly}
              onEmpleadoChange={handleEmpleadoChange}
              setDraft={setDraft}
            />

            {hasExternalSolicitudUpdate && isFormReadOnly && (
              <p className="mt-3 rounded-lg border border-amber-400/40 bg-amber-950/20 px-3 py-2 text-xs font-semibold text-amber-100">
              Esta solicitud ha recibido cambios externos. No se han aplicado al formulario abierto
              para no sobrescribir datos locales; cierra y vuelve a abrir para ver la versión compartida.
              </p>
            )}

            {saveStatus && (
              <p className="mt-3 rounded-lg border border-red-400/40 bg-red-950/20 px-3 py-2 text-xs font-semibold text-red-100">
                {saveStatus}
              </p>
            )}

            {wordStatus && (
              <p className="mt-3 rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-xs font-semibold text-metro-muted">
              {wordStatus}
              </p>
            )}
          </div>

          <div className="mt-3 flex shrink-0 flex-wrap gap-2 border-t border-metro-border bg-metro-panel pt-3">
            <ActionButton disabled={!canSubmit} iconOnly={false} size="sm" type="submit" variant="save">
              {isSaving ? 'Guardando…' : <>Guardar <kbd className="ml-1 text-[10px] opacity-70">Ctrl S</kbd></>}
            </ActionButton>
            <InlineSaveFeedback />
            {!isCreate && solicitud && (
              <>
                <AuditHistoryButton
                  entityId={solicitud.id}
                  entityTitle={solicitud.nombreApellidos || 'Solicitud sin nombre'}
                  module="teletrabajo"
                />
                <label
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${
                    draft.revisado
                      ? 'border-emerald-400/50 bg-emerald-950/20 text-emerald-100'
                      : 'border-amber-400/50 bg-amber-950/20 text-amber-100'
                  }`}
                  title={draft.revisado ? 'Solicitud revisada' : 'Solicitud pendiente de revisar'}
                >
                  <input
                    checked={draft.revisado}
                    className="h-4 w-4 accent-metro-red"
                    disabled={isFormReadOnly || isSaving}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, revisado: event.target.checked }))
                    }
                    type="checkbox"
                  />
                  Revisado
                </label>
              </>
            )}
            <ActionButton
              disabled={!canGenerateWord || isGeneratingWord || isFormReadOnly}
              iconOnly={false}
              onClick={handleGenerateWord}
              size="sm"
              variant="word"
            >
              {isGeneratingWord ? 'Generando…' : 'Generar Word'}
            </ActionButton>
            {!isCreate && solicitud && (
              <button
                className="rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm font-semibold text-metro-text hover:border-metro-red disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isFormReadOnly || isSaving}
                onClick={() => {
                  setIsSaving(true);
                  setSaveStatus('');
                  void removeSolicitud(solicitud.id, loadedSolicitudUpdatedAt).then((result) => {
                    if (result.ok) {
                      clearRecoveryDraft();
                      onDone();
                      return;
                    }
                    setSaveStatus(result.message);
                  }).finally(() => setIsSaving(false));
                }}
                type="button"
              >
                Eliminar
              </button>
            )}
            <button
              className="rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm font-semibold text-metro-muted hover:text-metro-text"
              onClick={() => void requestClose()}
              type="button"
            >
              Cancelar <kbd className="ml-1 text-[10px] opacity-70">Esc</kbd>
            </button>
          </div>
        </form>
        </div>
      </ModalShell>
      {dialogNode}
      {recoveryDialogNode}
    </>
  );
}
