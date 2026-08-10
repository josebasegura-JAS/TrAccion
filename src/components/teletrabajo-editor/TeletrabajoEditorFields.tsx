import type { Dispatch, SetStateAction } from 'react';
import {
  TELETRABAJO_DIAS,
  TELETRABAJO_ESTADOS,
  TELETRABAJO_TIPOS_SOLICITUD,
  normalizeDiasTeletrabajo,
  type TeletrabajoDraft,
  type TeletrabajoTextField,
} from '../../features/teletrabajo/domain/solicitud';

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

type TeletrabajoEditorFieldsProps = {
  draft: TeletrabajoDraft;
  employeeExists: boolean;
  isFormReadOnly: boolean;
  setDraft: Dispatch<SetStateAction<TeletrabajoDraft>>;
  onEmpleadoChange: (empleado: string) => void;
};

export function TeletrabajoEditorFields({
  draft,
  employeeExists,
  isFormReadOnly,
  setDraft,
  onEmpleadoChange,
}: TeletrabajoEditorFieldsProps) {
  const toggleDia = (day: string, checked: boolean) => {
    setDraft((current) => {
      const selected = checked
        ? [...current.diasTeletrabajo, day]
        : current.diasTeletrabajo.filter((currentDay) => currentDay !== day);

      return { ...current, diasTeletrabajo: normalizeDiasTeletrabajo(selected) };
    });
  };

  return (
    <fieldset className="grid gap-2 disabled:opacity-70 sm:grid-cols-2" disabled={isFormReadOnly}>
      <label className="text-xs font-semibold text-metro-muted sm:col-span-2">
        Periodo
        <input
          className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-1.5 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
          onChange={(event) => setDraft((current) => ({ ...current, periodo: event.target.value }))}
          placeholder="2026-2027"
          required
          type="text"
          value={draft.periodo}
        />
      </label>

      <TeletrabajoDaysSection draft={draft} onToggleDia={toggleDia} />
      <TeletrabajoValidationSection draft={draft} setDraft={setDraft} />
      <TeletrabajoObservationsSection draft={draft} setDraft={setDraft} />
      <TeletrabajoDeliverySection draft={draft} setDraft={setDraft} />
      <TeletrabajoManagementSection draft={draft} setDraft={setDraft} />
      <TeletrabajoEmployeeDataSection
        draft={draft}
        employeeExists={employeeExists}
        onEmpleadoChange={onEmpleadoChange}
        setDraft={setDraft}
      />
    </fieldset>
  );
}

function TeletrabajoDaysSection({
  draft,
  onToggleDia,
}: {
  draft: TeletrabajoDraft;
  onToggleDia: (day: string, checked: boolean) => void;
}) {
  return (
    <section className="sm:col-span-2 rounded-xl border border-metro-border bg-metro-surface p-3">
      <h4 className="mb-2 text-sm font-bold text-metro-text">Días de teletrabajo</h4>
      <div className="flex flex-wrap gap-3">
        {TELETRABAJO_DIAS.map((day) => (
          <label className="inline-flex items-center gap-2 text-sm font-semibold text-metro-muted" key={day}>
            <input
              checked={draft.diasTeletrabajo.includes(day)}
              className="h-4 w-4 accent-metro-red"
              onChange={(event) => onToggleDia(day, event.target.checked)}
              type="checkbox"
            />
            {day}
          </label>
        ))}
      </div>
    </section>
  );
}

function TeletrabajoValidationSection({
  draft,
  setDraft,
}: {
  draft: TeletrabajoDraft;
  setDraft: Dispatch<SetStateAction<TeletrabajoDraft>>;
}) {
  return (
    <section className="sm:col-span-2 rounded-xl border border-metro-border bg-metro-surface p-3">
      <h4 className="mb-2 text-sm font-bold text-metro-text">Validaciones</h4>
      <div className="grid gap-2 sm:grid-cols-5">
        <ValidationCheckbox
          checked={draft.validacionSeguridadInformatica}
          label="Seguridad informática"
          onChange={(checked) =>
            setDraft((current) => ({ ...current, validacionSeguridadInformatica: checked }))
          }
        />
        <ValidationCheckbox
          checked={draft.validacionPrevencion}
          label="Prevención"
          onChange={(checked) => setDraft((current) => ({ ...current, validacionPrevencion: checked }))}
        />
        <ValidationCheckbox
          checked={draft.validacionJefatura}
          label="Jefatura evaluación"
          onChange={(checked) => setDraft((current) => ({ ...current, validacionJefatura: checked }))}
        />
        <ValidationCheckbox
          checked={Boolean(draft.validacionJefaturaRepetir)}
          label="Jefatura repetir"
          onChange={(checked) =>
            setDraft((current) => ({ ...current, validacionJefaturaRepetir: checked }))
          }
        />
        <ValidationCheckbox
          checked={draft.validacionDireccion}
          label="Dirección"
          onChange={(checked) => setDraft((current) => ({ ...current, validacionDireccion: checked }))}
        />
      </div>
    </section>
  );
}

function ValidationCheckbox({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-sm font-semibold text-metro-muted">
      <input
        checked={checked}
        className="h-4 w-4 accent-metro-red"
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      {label}
    </label>
  );
}

function TeletrabajoObservationsSection({
  draft,
  setDraft,
}: {
  draft: TeletrabajoDraft;
  setDraft: Dispatch<SetStateAction<TeletrabajoDraft>>;
}) {
  return (
    <>
      <label className="text-xs font-semibold text-metro-muted sm:col-span-2">
        Observaciones
        <textarea
          className="mt-1 min-h-20 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-1.5 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
          onChange={(event) => setDraft((current) => ({ ...current, observaciones: event.target.value }))}
          value={draft.observaciones}
        />
      </label>

      <label className="text-xs font-semibold text-metro-muted sm:col-span-2">
        Observaciones RRLL{draft.estado === 'desistida' ? ' · Motivo del desistimiento' : ''}
        <textarea
          className="mt-1 min-h-20 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-1.5 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
          onChange={(event) =>
            setDraft((current) => ({ ...current, observacionesRrll: event.target.value }))
          }
          placeholder={
            draft.estado === 'desistida'
              ? 'Obligatorio: indica el motivo del desistimiento'
              : 'Notas internas de RRLL para la exportación a Dirección'
          }
          required={draft.estado === 'desistida'}
          value={draft.observacionesRrll ?? ''}
        />
      </label>
    </>
  );
}

function TeletrabajoDeliverySection({
  draft,
  setDraft,
}: {
  draft: TeletrabajoDraft;
  setDraft: Dispatch<SetStateAction<TeletrabajoDraft>>;
}) {
  return (
    <>
      <label className="text-xs font-semibold text-metro-muted">
        Fecha entrega ordenador
        <input
          className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-1.5 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
          onChange={(event) => setDraft((current) => ({ ...current, fechaOrdenador: event.target.value }))}
          required
          type="date"
          value={draft.fechaOrdenador}
        />
      </label>

      <label className="text-xs font-semibold text-metro-muted">
        Fecha entrega cascos
        <input
          className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-1.5 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
          onChange={(event) => setDraft((current) => ({ ...current, fechaCascos: event.target.value }))}
          required
          type="date"
          value={draft.fechaCascos}
        />
      </label>
    </>
  );
}

function TeletrabajoManagementSection({
  draft,
  setDraft,
}: {
  draft: TeletrabajoDraft;
  setDraft: Dispatch<SetStateAction<TeletrabajoDraft>>;
}) {
  return (
    <section className="sm:col-span-2 rounded-xl border border-metro-border bg-metro-surface p-3">
      <h4 className="mb-2 text-sm font-bold text-metro-text">Gestión</h4>
      <div className="grid gap-2 sm:grid-cols-3">
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
                desistida: 'Desistida',
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
            onChange={(event) => setDraft((current) => ({ ...current, fechaSolicitud: event.target.value }))}
            type="date"
            value={draft.fechaSolicitud}
          />
        </label>
      </div>
    </section>
  );
}

function TeletrabajoEmployeeDataSection({
  draft,
  employeeExists,
  onEmpleadoChange,
  setDraft,
}: {
  draft: TeletrabajoDraft;
  employeeExists: boolean;
  onEmpleadoChange: (empleado: string) => void;
  setDraft: Dispatch<SetStateAction<TeletrabajoDraft>>;
}) {
  return (
    <section className="sm:col-span-2 rounded-xl border border-metro-border bg-metro-surface p-3">
      <h4 className="mb-2 text-sm font-bold text-metro-text">Datos</h4>
      <div className="mb-3 rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-xs font-semibold text-metro-muted">
        {draft.empleado.trim().length === 0
          ? 'Introduce un empleado para buscarlo en Plantilla.'
          : employeeExists
            ? 'Empleado encontrado en Plantilla. Datos básicos rellenados desde Plantilla.'
            : 'Empleado no encontrado en Plantilla. Puedes continuar si completas manualmente los datos necesarios.'}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {plantillaTextFields.map(({ field, label, required, readOnlyWhenFound }) => (
          <label className="text-xs font-semibold text-metro-muted" key={field}>
            {label}
            <input
              className="mt-1 w-full rounded-lg border border-metro-border bg-metro-surface px-3 py-1.5 text-sm font-medium text-metro-text outline-none focus:border-metro-red disabled:bg-metro-surface disabled:text-metro-muted"
              onChange={(event) => {
                if (field === 'empleado') {
                  onEmpleadoChange(event.target.value);
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
      </div>
    </section>
  );
}
