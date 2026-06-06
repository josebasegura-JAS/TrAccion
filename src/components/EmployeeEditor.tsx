import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  EMPTY_EMPLOYEE_DRAFT,
  type Employee,
  type EmployeeDraft,
  type EmployeeField,
} from '../features/plantilla/domain/employee';
import { useEmployeeStore } from '../features/plantilla/store/useEmployeeStore';

const employeeFormFields: Array<{ field: EmployeeField; label: string; required?: boolean }> = [
  { field: 'empleado', label: 'Empleado', required: true },
  { field: 'nombreApellidos', label: 'Nombre y apellidos', required: true },
  { field: 'puestoNomina', label: 'Puesto nómina' },
  { field: 'puestoOrganizativo', label: 'Puesto organizativo' },
  { field: 'residencia', label: 'Residencia' },
  { field: 'nivelRetributivo', label: 'Nivel retributivo' },
  { field: 'sexo', label: 'Sexo' },
  { field: 'calle', label: 'Calle' },
  { field: 'numero', label: 'Número' },
  { field: 'piso', label: 'Piso' },
  { field: 'codigoPostal', label: 'Código postal' },
  { field: 'poblacion', label: 'Población' },
  { field: 'provincia', label: 'Provincia' },
  { field: 'nif', label: 'NIF' },
];

function toDraft(employee: Employee | null): EmployeeDraft {
  if (!employee) {
    return { ...EMPTY_EMPLOYEE_DRAFT };
  }

  return {
    empleado: employee.empleado,
    nombreApellidos: employee.nombreApellidos,
    puestoNomina: employee.puestoNomina,
    puestoOrganizativo: employee.puestoOrganizativo,
    residencia: employee.residencia,
    nivelRetributivo: employee.nivelRetributivo,
    sexo: employee.sexo,
    calle: employee.calle,
    numero: employee.numero,
    piso: employee.piso,
    codigoPostal: employee.codigoPostal,
    poblacion: employee.poblacion,
    provincia: employee.provincia,
    nif: employee.nif,
  };
}

export function EmployeeEditor({
  employee,
  mode,
  onDone,
}: {
  employee: Employee | null;
  mode: 'create' | 'edit';
  onDone: () => void;
}) {
  const createEmployee = useEmployeeStore((state) => state.create);
  const updateEmployee = useEmployeeStore((state) => state.update);
  const removeEmployee = useEmployeeStore((state) => state.remove);
  const [draft, setDraft] = useState<EmployeeDraft>(() => toDraft(employee));

  useEffect(() => {
    setDraft(toDraft(employee));
  }, [employee, mode]);

  const isCreate = mode === 'create';
  const canSubmit = draft.empleado.trim() && draft.nombreApellidos.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-[1px]">
      <aside
        aria-modal="true"
        className="flex max-h-[calc(100vh-2rem)] w-[min(760px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-metro-border bg-metro-panel p-3 shadow-2xl"
        role="dialog"
      >
        <div className="mb-3 flex items-start justify-between gap-3 rounded-xl border border-metro-border bg-metro-surface px-3 py-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-metro-red">
              {isCreate ? 'Nueva persona' : 'Editar persona'}
            </p>
            <h3 className="mt-1 truncate text-base font-bold text-metro-text">
              {isCreate ? 'Nueva persona' : employee?.nombreApellidos || 'Sin selección'}
            </h3>
            <p className="text-xs text-metro-muted">
              {isCreate
                ? 'Alta manual compacta.'
                : `Editando empleado ${employee?.empleado ?? '—'}`}
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

        <form
          className="flex min-h-0 flex-1 flex-col space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSubmit) {
              return;
            }

            if (isCreate) {
              createEmployee(draft);
            } else if (employee) {
              updateEmployee(employee.empleado, draft);
            }

            onDone();
          }}
        >
          <div className="grid min-h-0 flex-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
            {employeeFormFields.map(({ field, label, required }) => {
              const isEmployeeKey = field === 'empleado';
              const isReadOnlyKey = isEmployeeKey && !isCreate;

              return (
                <label className="text-xs font-semibold text-metro-muted" key={field}>
                  {label}
                  <input
                    className={`mt-1 w-full rounded-lg border border-metro-border px-3 py-1.5 text-sm font-medium text-metro-text outline-none focus:border-metro-red ${
                      isReadOnlyKey ? 'bg-metro-surface text-metro-muted' : 'bg-metro-surface'
                    }`}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, [field]: event.target.value }))
                    }
                    readOnly={isReadOnlyKey}
                    required={required}
                    value={draft[field]}
                  />
                  {isReadOnlyKey && (
                    <span className="mt-1 block text-[11px] font-medium text-metro-muted">
                      Clave única; no editable.
                    </span>
                  )}
                </label>
              );
            })}
          </div>

          {!isCreate && employee && (
            <section className="rounded-lg border border-metro-border bg-metro-surface p-3 text-xs text-metro-muted">
              <p className="mb-2 font-semibold uppercase tracking-wide text-metro-text">
                Campos derivados
              </p>
              <dl className="space-y-1">
                <div className="grid grid-cols-[135px_1fr] gap-2">
                  <dt className="font-bold text-metro-text">DNI</dt>
                  <dd className="truncate" title={employee.dni || '—'}>
                    {employee.dni || '—'}
                  </dd>
                </div>
                <div className="grid grid-cols-[135px_1fr] gap-2">
                  <dt className="font-bold text-metro-text">Residencia EUS</dt>
                  <dd className="truncate" title={employee.residenciaEus || '—'}>
                    {employee.residenciaEus || '—'}
                  </dd>
                </div>
                <div className="grid grid-cols-[135px_1fr] gap-2">
                  <dt className="font-bold text-metro-text">Dirección teletrabajo</dt>
                  <dd className="truncate" title={employee.direccionTeletrabajo || '—'}>
                    {employee.direccionTeletrabajo || '—'}
                  </dd>
                </div>
              </dl>
            </section>
          )}

          <div className="flex flex-wrap gap-2 border-t border-metro-border pt-3">
            <button
              className="rounded-lg bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!canSubmit}
              type="submit"
            >
              Guardar
            </button>
            {!isCreate && employee && (
              <button
                className="rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm font-semibold text-metro-text hover:border-metro-red"
                onClick={() => {
                  removeEmployee(employee.empleado);
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
