import { useMemo, useState } from 'react';
import { getEmployeeDerivedFields } from '../utils/employeeDerived';
import type { Employee } from '../types/employee';

const tabs = ['Datos personales', 'Puesto y organización', 'Contacto y domicilio', 'Teletrabajo'] as const;

type Tab = (typeof tabs)[number];

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-metro-border bg-white px-3 py-2">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-metro-muted">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-metro-text">{value || '—'}</dd>
    </div>
  );
}

export function EmployeeEditor({ employee }: { employee: Employee }) {
  const [activeTab, setActiveTab] = useState<Tab>('Datos personales');
  const derived = useMemo(() => getEmployeeDerivedFields(employee), [employee]);

  return (
    <aside className="w-full rounded-2xl border border-metro-border bg-[#FAFBFC] p-4 shadow-card xl:w-[380px]">
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-metro-red">Panel de edición</p>
        <h3 className="mt-1 text-lg font-bold text-metro-text">{employee.nombreApellidos}</h3>
        <p className="text-sm text-metro-muted">Empleado {employee.empleado}</p>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2">
        {tabs.map((tab) => (
          <button
            className={`rounded-xl px-3 py-2 text-left text-xs font-semibold transition ${
              activeTab === tab
                ? 'bg-metro-red text-white shadow-sm'
                : 'border border-metro-border bg-white text-metro-muted hover:text-metro-text'
            }`}
            key={tab}
            onClick={() => setActiveTab(tab)}
            type="button"
          >
            {tab}
          </button>
        ))}
      </div>

      <dl className="grid gap-2">
        {activeTab === 'Datos personales' && (
          <>
            <Field label="NIF" value={employee.nif} />
            <Field label="DNI normalizado" value={derived.dni} />
            <Field label="Fecha nacimiento" value={employee.fechaNacimiento} />
            <Field label="Sexo" value={employee.sexo} />
            <Field label="Estado civil" value={employee.estadoCivil} />
          </>
        )}
        {activeTab === 'Puesto y organización' && (
          <>
            <Field label="Puesto nómina" value={employee.puestoNomina} />
            <Field label="Puesto organizativo" value={employee.puestoOrganizativo} />
            <Field label="Unidad" value={employee.unidad} />
            <Field label="Dirección / Área" value={employee.direccionArea} />
            <Field label="Nivel retributivo" value={employee.nivelRetributivo} />
          </>
        )}
        {activeTab === 'Contacto y domicilio' && (
          <>
            <Field label="Teléfono" value={employee.telefono} />
            <Field label="Segundo teléfono" value={employee.segundoTelefono} />
            <Field label="Calle" value={employee.calle} />
            <Field label="Número / piso" value={[employee.numero, employee.piso].filter(Boolean).join(', ')} />
            <Field label="Población" value={`${employee.codigoPostal} ${employee.poblacion}`} />
          </>
        )}
        {activeTab === 'Teletrabajo' && (
          <>
            <Field label="Residencia CAST" value={derived.residenciaCast} />
            <Field label="Residencia EUS" value={derived.residenciaEus} />
            <Field label="Dirección teletrabajo" value={derived.direccionTeletrabajo} />
            <Field label="Dispone coche" value={employee.disponeCoche} />
            <Field label="Carnet conducir" value={employee.carnetConducir} />
          </>
        )}
      </dl>
    </aside>
  );
}
