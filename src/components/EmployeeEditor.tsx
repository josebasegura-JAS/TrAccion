import { useEffect, useState } from 'react';
import { EMPTY_EMPLOYEE_DRAFT, type Employee, type EmployeeDraft, type EmployeeField } from '../features/plantilla/domain/employee';
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

export function EmployeeEditor({ employee, mode, onDone }: { employee: Employee | null; mode: 'create' | 'edit'; onDone: () => void }) {
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
    <aside className="w-full rounded-2xl border border-metro-border bg-[#FAFBFC] p-4 shadow-card xl:w-[380px]">
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-metro-red">
          {isCreate ? 'Alta manual' : 'Panel de edición'}
        </p>
        <h3 className="mt-1 text-lg font-bold text-metro-text">
          {isCreate ? 'Nueva persona' : employee?.nombreApellidos || 'Sin selección'}
        </h3>
        <p className="text-sm text-metro-muted">
          {isCreate ? 'Introduce los campos básicos de plantilla.' : `Empleado ${employee?.empleado ?? '—'}`}
        </p>
      </div>

      <form
        className="space-y-3"
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
        <div className="grid max-h-[520px] gap-2 overflow-y-auto pr-1">
          {employeeFormFields.map(({ field, label, required }) => (
            <label className="text-xs font-semibold text-metro-muted" key={field}>
              {label}
              <input
                className="mt-1 w-full rounded-xl border border-metro-border bg-white px-3 py-2 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
                onChange={(event) => setDraft((current) => ({ ...current, [field]: event.target.value }))}
                required={required}
                value={draft[field]}
              />
            </label>
          ))}
        </div>

        {!isCreate && employee && (
          <div className="rounded-xl border border-metro-border bg-white p-3 text-xs text-metro-muted">
            <p>
              <span className="font-bold text-metro-text">DNI:</span> {employee.dni || '—'}
            </p>
            <p>
              <span className="font-bold text-metro-text">Residencia EUS:</span> {employee.residenciaEus || '—'}
            </p>
            <p>
              <span className="font-bold text-metro-text">Dirección teletrabajo:</span>{' '}
              {employee.direccionTeletrabajo || '—'}
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            className="rounded-xl bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canSubmit}
            type="submit"
          >
            {isCreate ? 'Crear' : 'Guardar'}
          </button>
          {!isCreate && employee && (
            <button
              className="rounded-xl border border-metro-border bg-white px-3 py-2 text-sm font-semibold text-metro-text hover:border-metro-red"
              onClick={() => {
                removeEmployee(employee.empleado);
                onDone();
              }}
              type="button"
            >
              Borrar
            </button>
          )}
          <button
            className="rounded-xl border border-metro-border bg-white px-3 py-2 text-sm font-semibold text-metro-muted hover:text-metro-text"
            onClick={onDone}
            type="button"
          >
            Cancelar
          </button>
        </div>
      </form>
    </aside>
  );
}
