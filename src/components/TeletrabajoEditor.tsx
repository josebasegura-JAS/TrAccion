import { X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useEmployeeStore } from '../features/plantilla/store/useEmployeeStore';
import {
  EMPTY_TELETRABAJO_DRAFT,
  TELETRABAJO_DIAS,
  TELETRABAJO_ESTADOS,
  TELETRABAJO_TIPOS_SOLICITUD,
  normalizeDiasTeletrabajo,
  type TeletrabajoDraft,
  type TeletrabajoSolicitud,
  type TeletrabajoTextField,
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
import { ModalDatabaseStatus } from './ModalDatabaseStatus';
import { ActionButton } from './ui/ActionButton';
import { AuditHistoryButton } from '../shared/audit/AuditHistoryButton';

const plantillaTextFields: Array<{
  field: TeletrabajoTextField;
  label: string;
  required?: boolean;
  readOnlyWhenFound?: boolean;
}> = [
  { field: 'empleado', label: 'Empleado', required: true },
  {
    field: 'nombreApellidos',
    label: 'Nombre y apellidos',
    required: true,
    readOnlyWhenFound: true,
  },
  { field: 'puestoNomina', label: 'Puesto nómina', required: true, readOnlyWhenFound: true },
  { field: 'puestoOrganizativo', label: 'Puesto organizativo', readOnlyWhenFound: true },
  { field: 'residencia', label: 'Residencia', required: true, readOnlyWhenFound: true },
  { field: 'dni', label: 'DNI', required: true, readOnlyWhenFound: true },
  {
    field: 'direccionTeletrabajo',
    label: 'Dirección teletrabajo',
    required: true,
    readOnlyWhenFound: true,
  },
];

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
    validacionJefatura: solicitud.validacionJefatura,
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

  const toggleDia = (day: string, checked: boolean) => {
    setDraft((current) => {
      const selected = checked
        ? [...current.diasTeletrabajo, day]
        : current.diasTeletrabajo.filter((currentDay) => currentDay !== day);

      return { ...current, diasTeletrabajo: normalizeDiasTeletrabajo(selected) };
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <aside
        aria-modal="true"
        className="flex max-h-[calc(100vh-2rem)] w-[min(820px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-metro-border bg-metro-panel p-3 shadow-2xl"
        role="dialog"
      >
        <div className="mb-3 flex items-start justify-between gap-3 rounded-xl border border-metro-border bg-metro-surface px-3 py-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-metro-red">
              {isCreate ? 'Nueva solicitud' : 'Editar solicitud'}
            </p>
            <h3 className="mt-1 truncate text-base font-bold text-metro-text">
              {isCreate
                ? 'Nueva solicitud de teletrabajo'
                : draft.nombreApellidos || solicitud?.nombreApellidos || 'Sin selección'}
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <p className="text-xs text-metro-muted">
                {isCreate ? 'Alta manual compacta.' : `Editando solicitud ${solicitud?.id ?? '—'}`}
              </p>
              {isNuevaPeticion && draft.empleado.trim().length > 0 && (
                <span
                  className="rounded-full border border-amber-400/60 bg-amber-300 px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-slate-950"
                  title="No consta teletrabajo aprobado o analizado para esta persona en el periodo anterior."
                >
                  Nueva petición, enviar documentación
                </span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ModalDatabaseStatus />
          <button
            aria-label="Cerrar editor"
            className="rounded-lg border border-metro-border bg-metro-surface p-2 text-metro-muted hover:border-metro-red hover:text-metro-text"
            onClick={onDone}
            type="button"
          >
            <X size={16} />
          </button>
          </div>
        </div>

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
                  onDone();
                  return;
                }
                setSaveStatus(result.message);
              })
              .finally(() => setIsSaving(false));
          }}
        >
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <fieldset
              className="grid gap-2 disabled:opacity-70 sm:grid-cols-2"
              disabled={isFormReadOnly}
            >
            <div className="sm:col-span-2 rounded-xl border border-metro-border bg-metro-surface px-3 py-2 text-xs font-semibold text-metro-muted">
              {draft.empleado.trim().length === 0
                ? 'Introduce un empleado para buscarlo en Plantilla.'
                : employeeExists
                  ? 'Empleado encontrado en Plantilla. Datos básicos rellenados desde Plantilla.'
                  : 'Empleado no encontrado en Plantilla. Puedes continuar si completas manualmente los datos necesarios.'}
            </div>

            {plantillaTextFields.map(({ field, label, required, readOnlyWhenFound }) => (
              <label className="text-xs font-semibold text-metro-muted" key={field}>
                {label}
                <input
                  className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-1.5 text-sm font-medium text-metro-text outline-none focus:border-metro-red disabled:bg-metro-surface disabled:text-metro-muted"
                  onChange={(event) => {
                    if (field === 'empleado') {
                      handleEmpleadoChange(event.target.value);
                      return;
                    }

                    setDraft((current) => ({ ...current, [field]: event.target.value }));
                  }}
                  readOnly={readOnlyWhenFound && employeeExists}
                  required={required}
                  type="text"
                  value={draft[field]}
                />
              </label>
            ))}

            <label className="text-xs font-semibold text-metro-muted">
              Estado
              <select
                className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-1.5 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    estado: event.target.value as TeletrabajoDraft['estado'],
                  }))
                }
                value={draft.estado}
              >
                {TELETRABAJO_ESTADOS.map((estado) => {
                  const labels: Record<string, string> = {
                    pendiente: 'Pendiente',
                    analizada: 'Analizada',
                    aprobada: 'Aprobada',
                    denegada: 'Rechazada',
                  };
                  return (
                    <option key={estado} value={estado}>
                      {labels[estado] ?? estado}
                    </option>
                  );
                })}
              </select>
            </label>

            <label className="text-xs font-semibold text-metro-muted">
              Tipo solicitud
              <select
                className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-1.5 text-sm font-medium text-metro-text outline-none disabled:bg-metro-surface disabled:text-metro-muted"
                disabled
                title="Tipo calculado automáticamente según exista teletrabajo aprobado o analizado en el periodo anterior."
                value={draft.tipoSolicitud}
              >
                {TELETRABAJO_TIPOS_SOLICITUD.map((tipoSolicitud) => (
                  <option key={tipoSolicitud} value={tipoSolicitud}>
                    {tipoSolicitud}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-[11px] font-medium text-metro-muted">
                Calculado automáticamente con el periodo anterior.
              </span>
            </label>

            <label className="text-xs font-semibold text-metro-muted">
              Fecha solicitud
              <input
                className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-1.5 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
                onChange={(event) =>
                  setDraft((current) => ({ ...current, fechaSolicitud: event.target.value }))
                }
                type="date"
                value={draft.fechaSolicitud}
              />
            </label>

            <label className="text-xs font-semibold text-metro-muted">
              Fecha entrega ordenador
              <input
                className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-1.5 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
                onChange={(event) =>
                  setDraft((current) => ({ ...current, fechaOrdenador: event.target.value }))
                }
                required
                type="date"
                value={draft.fechaOrdenador}
              />
            </label>

            <label className="text-xs font-semibold text-metro-muted">
              Fecha entrega cascos
              <input
                className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-1.5 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
                onChange={(event) =>
                  setDraft((current) => ({ ...current, fechaCascos: event.target.value }))
                }
                required
                type="date"
                value={draft.fechaCascos}
              />
            </label>

            <label className="text-xs font-semibold text-metro-muted">
              Periodo
              <input
                className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-1.5 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
                onChange={(event) =>
                  setDraft((current) => ({ ...current, periodo: event.target.value }))
                }
                placeholder="2026-2027"
                required
                type="text"
                value={draft.periodo}
              />
            </label>

            <section className="sm:col-span-2 rounded-xl border border-metro-border bg-metro-surface p-3">
              <h4 className="mb-2 text-sm font-bold text-metro-text">Días de teletrabajo</h4>
              <div className="flex flex-wrap gap-3">
                {TELETRABAJO_DIAS.map((day) => (
                  <label
                    className="inline-flex items-center gap-2 text-sm font-semibold text-metro-muted"
                    key={day}
                  >
                    <input
                      checked={draft.diasTeletrabajo.includes(day)}
                      className="h-4 w-4 accent-metro-red"
                      onChange={(event) => toggleDia(day, event.target.checked)}
                      type="checkbox"
                    />
                    {day}
                  </label>
                ))}
              </div>
            </section>

            <section className="sm:col-span-2 rounded-xl border border-metro-border bg-metro-surface p-3">
              <h4 className="mb-2 text-sm font-bold text-metro-text">Validaciones</h4>
              <div className="grid gap-2 sm:grid-cols-4">
                <label className="inline-flex items-center gap-2 text-sm font-semibold text-metro-muted">
                  <input
                    checked={draft.validacionSeguridadInformatica}
                    className="h-4 w-4 accent-metro-red"
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        validacionSeguridadInformatica: event.target.checked,
                      }))
                    }
                    type="checkbox"
                  />
                  Seguridad informática
                </label>
                <label className="inline-flex items-center gap-2 text-sm font-semibold text-metro-muted">
                  <input
                    checked={draft.validacionPrevencion}
                    className="h-4 w-4 accent-metro-red"
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        validacionPrevencion: event.target.checked,
                      }))
                    }
                    type="checkbox"
                  />
                  Prevención
                </label>
                <label className="inline-flex items-center gap-2 text-sm font-semibold text-metro-muted">
                  <input
                    checked={draft.validacionJefatura}
                    className="h-4 w-4 accent-metro-red"
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        validacionJefatura: event.target.checked,
                      }))
                    }
                    type="checkbox"
                  />
                  Jefatura
                </label>
                <label className="inline-flex items-center gap-2 text-sm font-semibold text-metro-muted">
                  <input
                    checked={draft.validacionDireccion}
                    className="h-4 w-4 accent-metro-red"
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        validacionDireccion: event.target.checked,
                      }))
                    }
                    type="checkbox"
                  />
                  Dirección
                </label>
              </div>
            </section>

            <label className="text-xs font-semibold text-metro-muted sm:col-span-2">
              Observaciones
              <textarea
                className="mt-1 min-h-20 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-1.5 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
                onChange={(event) =>
                  setDraft((current) => ({ ...current, observaciones: event.target.value }))
                }
                value={draft.observaciones}
              />
            </label>

            <label className="text-xs font-semibold text-metro-muted sm:col-span-2">
              Observaciones RRLL
              <textarea
                className="mt-1 min-h-20 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-1.5 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
                onChange={(event) =>
                  setDraft((current) => ({ ...current, observacionesRrll: event.target.value }))
                }
                placeholder="Notas internas de RRLL para la exportación a Dirección"
                value={draft.observacionesRrll ?? ''}
              />
            </label>
            </fieldset>

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
              {isSaving ? 'Guardando…' : 'Guardar'}
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
              onClick={onDone}
              type="button"
            >
              Cancelar
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}
