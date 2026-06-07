import { FileText, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { Employee } from '../features/plantilla/domain/employee';
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
import { useTeletrabajoStore } from '../features/teletrabajo/store/useTeletrabajoStore';
import { useSharedRecordLock } from '../services/useSharedRecordLock';

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
    fechaOrdenador: solicitud.fechaOrdenador,
    fechaCascos: solicitud.fechaCascos,
    periodo: solicitud.periodo,
    observaciones: solicitud.observaciones,
    validacionSeguridadInformatica: solicitud.validacionSeguridadInformatica,
    validacionPrevencion: solicitud.validacionPrevencion,
    validacionJefatura: solicitud.validacionJefatura,
  };
}

function draftFromEmployee(draft: TeletrabajoDraft, employee: Employee): TeletrabajoDraft {
  return {
    ...draft,
    empleado: employee.empleado,
    nombreApellidos: employee.nombreApellidos,
    puestoNomina: employee.puestoNomina,
    puestoOrganizativo: employee.puestoOrganizativo,
    residencia: employee.residencia,
    dni: employee.dni,
    direccionTeletrabajo: employee.direccionTeletrabajo,
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
  const createSolicitud = useTeletrabajoStore((state) => state.create);
  const updateSolicitud = useTeletrabajoStore((state) => state.update);
  const removeSolicitud = useTeletrabajoStore((state) => state.remove);
  const employees = useEmployeeStore((state) => state.employees);
  const rutaPlantillaTeletrabajo = useConfiguracionStore((state) => state.rutaPlantillaTeletrabajo);
  const jobPositionTranslations = useEmployeeStore((state) => state.jobPositionTranslations);
  const [draft, setDraft] = useState<TeletrabajoDraft>(() => toDraft(solicitud));
  const [wordStatus, setWordStatus] = useState('');
  const [isGeneratingWord, setIsGeneratingWord] = useState(false);
  const recordLock = useSharedRecordLock({
    module: 'teletrabajo',
    recordId: solicitud?.id ?? null,
    enabled: mode === 'edit' && Boolean(solicitud?.id),
  });

  useEffect(() => {
    setDraft(toDraft(solicitud));
    setWordStatus('');
  }, [solicitud, mode]);

  const plantillaEmployee = useMemo(() => {
    const empleado = draft.empleado.trim();
    if (!empleado) {
      return null;
    }

    return (
      employees.find((employee) => !employee.deletedAt && employee.empleado.trim() === empleado) ??
      null
    );
  }, [draft.empleado, employees]);

  const employeeExists = Boolean(plantillaEmployee);
  const isCreate = mode === 'create';
  const canSubmit =
    hasRequiredManualData(draft) && draft.diasTeletrabajo.length > 0 && !recordLock.isReadOnly;

  const handleEmpleadoChange = (empleado: string) => {
    const employee = employees.find(
      (candidate) => !candidate.deletedAt && candidate.empleado.trim() === empleado.trim(),
    );

    setDraft((current) =>
      employee ? draftFromEmployee(current, employee) : { ...current, empleado },
    );
  };

  const handleGenerateWord = async () => {
    if (!canSubmit || isGeneratingWord || recordLock.isReadOnly) {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-[1px]">
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
                : solicitud?.nombreApellidos || 'Sin selección'}
            </h3>
            <p className="text-xs text-metro-muted">
              {isCreate ? 'Alta manual compacta.' : `Editando solicitud ${solicitud?.id ?? '—'}`}
            </p>
          </div>
          <button
            aria-label="Cerrar editor"
            className="rounded-lg border border-metro-border bg-metro-surface p-2 text-metro-muted hover:border-metro-red hover:text-metro-text"
            onClick={onDone}
            type="button"
          >
            <X size={16} />
          </button>
        </div>

        {recordLock.message && (
          <p className={`mb-3 rounded-lg border px-3 py-2 text-xs font-semibold ${
            recordLock.isReadOnly
              ? 'border-red-400/40 bg-red-950/20 text-red-100'
              : 'border-metro-border bg-metro-surface text-metro-muted'
          }`}>
            {recordLock.message}
          </p>
        )}

        <form
          className="flex min-h-0 flex-1 flex-col space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSubmit || recordLock.isReadOnly) {
              return;
            }

            if (isCreate) {
              createSolicitud(draft);
            } else if (solicitud) {
              updateSolicitud(solicitud.id, draft);
            }

            onDone();
          }}
        >
          <fieldset
            className="grid min-h-0 flex-1 gap-2 overflow-y-auto pr-1 disabled:opacity-70 sm:grid-cols-2"
            disabled={recordLock.isReadOnly}
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
                {TELETRABAJO_ESTADOS.map((estado) => (
                  <option key={estado} value={estado}>
                    {estado}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs font-semibold text-metro-muted">
              Tipo solicitud
              <select
                className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-1.5 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    tipoSolicitud: event.target.value as TeletrabajoDraft['tipoSolicitud'],
                  }))
                }
                value={draft.tipoSolicitud}
              >
                {TELETRABAJO_TIPOS_SOLICITUD.map((tipoSolicitud) => (
                  <option key={tipoSolicitud} value={tipoSolicitud}>
                    {tipoSolicitud}
                  </option>
                ))}
              </select>
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
              <div className="grid gap-2 sm:grid-cols-3">
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
          </fieldset>

          {wordStatus && (
            <p className="rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-xs font-semibold text-metro-muted">
              {wordStatus}
            </p>
          )}

          <div className="flex flex-wrap gap-2 border-t border-metro-border pt-3">
            <button
              className="rounded-lg bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!canSubmit}
              type="submit"
            >
              Guardar
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm font-semibold text-metro-text hover:border-metro-red disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!canSubmit || isGeneratingWord || recordLock.isReadOnly}
              onClick={handleGenerateWord}
              type="button"
            >
              <FileText size={15} />
              {isGeneratingWord ? 'Generando…' : 'Generar Word'}
            </button>
            {!isCreate && solicitud && (
              <button
                className="rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm font-semibold text-metro-text hover:border-metro-red disabled:cursor-not-allowed disabled:opacity-50"
                disabled={recordLock.isReadOnly}
                onClick={() => {
                  removeSolicitud(solicitud.id);
                  onDone();
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
