import { Download, FileUp, Plus, Search, SlidersHorizontal } from 'lucide-react';
import { useMemo } from 'react';
import { EmployeeEditor } from './EmployeeEditor';
import { filterEmployees, useEmployeeStore } from '../store/employeeStore';

function unique(values: string[]) {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

export function PlantillaPage() {
  const { employees, filters, selectedEmployeeId, selectEmployee, setFilter } = useEmployeeStore();
  const filteredEmployees = useMemo(() => filterEmployees(employees, filters), [employees, filters]);
  const selectedEmployee = employees.find((employee) => employee.empleado === selectedEmployeeId) ?? employees[0];

  const residencias = unique(employees.map((employee) => employee.residencia));
  const unidades = unique(employees.map((employee) => employee.unidad));
  const puestos = unique(employees.map((employee) => employee.puestoNomina));
  const estados = unique(employees.map((employee) => employee.estado));

  return (
    <section className="rounded-3xl border border-metro-border bg-white p-5 shadow-card" id="plantilla">
      <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-metro-red">Módulo</p>
          <h2 className="text-2xl font-bold text-metro-text">Plantilla</h2>
          <p className="mt-1 text-sm text-metro-muted">
            Gestión mock de plantilla completa preparada para importación, SQLite y teletrabajo.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="inline-flex items-center gap-2 rounded-xl border border-metro-border bg-white px-3 py-2 text-sm font-semibold text-metro-text hover:border-metro-red" type="button">
            <FileUp size={16} /> Importar
          </button>
          <button className="inline-flex items-center gap-2 rounded-xl border border-metro-border bg-white px-3 py-2 text-sm font-semibold text-metro-text hover:border-metro-red" type="button">
            <Download size={16} /> Exportar
          </button>
          <button className="inline-flex items-center gap-2 rounded-xl bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark" type="button">
            <Plus size={16} /> Nuevo
          </button>
        </div>
      </div>

      <div className="mb-4 grid gap-3 rounded-2xl border border-metro-border bg-metro-surface p-3 lg:grid-cols-[1.4fr_repeat(4,1fr)]">
        <label className="flex items-center gap-2 rounded-xl border border-metro-border bg-white px-3 py-2 text-sm text-metro-muted">
          <Search size={16} />
          <input
            className="w-full bg-transparent text-metro-text outline-none placeholder:text-metro-muted"
            onChange={(event) => setFilter('search', event.target.value)}
            placeholder="Buscar por empleado, nombre, NIF..."
            type="search"
            value={filters.search}
          />
        </label>
        <SelectFilter label="Residencia" onChange={(value) => setFilter('residencia', value)} options={residencias} value={filters.residencia} />
        <SelectFilter label="Unidad" onChange={(value) => setFilter('unidad', value)} options={unidades} value={filters.unidad} />
        <SelectFilter label="Puesto" onChange={(value) => setFilter('puesto', value)} options={puestos} value={filters.puesto} />
        <SelectFilter label="Estado" onChange={(value) => setFilter('estado', value)} options={estados} value={filters.estado} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="overflow-hidden rounded-2xl border border-metro-border">
          <div className="flex items-center justify-between border-b border-metro-border bg-white px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-metro-text">
              <SlidersHorizontal size={16} className="text-metro-red" /> Personas en plantilla
            </div>
            <span className="rounded-full bg-metro-red/10 px-3 py-1 text-xs font-bold text-metro-dark">
              {filteredEmployees.length} registros
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[#F9FAFB] text-xs uppercase tracking-wide text-metro-muted">
                <tr>
                  <th className="px-4 py-3">Empleado</th>
                  <th className="px-4 py-3">Nombre y apellidos</th>
                  <th className="px-4 py-3">Puesto nómina</th>
                  <th className="px-4 py-3">Residencia</th>
                  <th className="px-4 py-3">Unidad</th>
                  <th className="px-4 py-3">Nivel</th>
                  <th className="px-4 py-3">Sexo</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-metro-border bg-white">
                {filteredEmployees.map((employee) => (
                  <tr className="hover:bg-red-50/50" key={employee.empleado}>
                    <td className="px-4 py-3 font-semibold text-metro-text">{employee.empleado}</td>
                    <td className="px-4 py-3 text-metro-text">{employee.nombreApellidos}</td>
                    <td className="px-4 py-3 text-metro-muted">{employee.puestoNomina}</td>
                    <td className="px-4 py-3 text-metro-muted">{employee.residencia}</td>
                    <td className="px-4 py-3 text-metro-muted">{employee.unidad}</td>
                    <td className="px-4 py-3 text-metro-muted">{employee.nivelRetributivo}</td>
                    <td className="px-4 py-3 text-metro-muted">{employee.sexo}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full border border-metro-border px-2 py-1 text-xs font-semibold text-metro-text">
                        {employee.estado}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        className="rounded-lg bg-metro-red px-3 py-1.5 text-xs font-semibold text-white hover:bg-metro-dark"
                        onClick={() => selectEmployee(employee.empleado)}
                        type="button"
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {selectedEmployee && <EmployeeEditor employee={selectedEmployee} />}
      </div>
    </section>
  );
}

function SelectFilter({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <select
      aria-label={label}
      className="rounded-xl border border-metro-border bg-white px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red"
      onChange={(event) => onChange(event.target.value)}
      value={value}
    >
      <option value="">{label}</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}
