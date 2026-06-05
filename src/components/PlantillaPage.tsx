import { FileUp, Plus, Search, SlidersHorizontal } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { EmployeeEditor } from './EmployeeEditor';
import { filterEmployees, useEmployeeStore } from '../features/plantilla/store/useEmployeeStore';
import { uniqueSorted } from '../features/plantilla/domain/filters';

export function PlantillaPage() {
  const { employees, filters, selectedEmployeeId, importExcel, load, selectEmployee, setFilter } = useEmployeeStore();
  const [editorMode, setEditorMode] = useState<'create' | 'edit'>('edit');
  const [importMessage, setImportMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    load();
  }, [load]);

  const visibleEmployees = useMemo(() => employees.filter((employee) => !employee.deletedAt), [employees]);
  const filteredEmployees = useMemo(() => filterEmployees(employees, filters), [employees, filters]);
  const selectedEmployee = visibleEmployees.find((employee) => employee.empleado === selectedEmployeeId) ?? visibleEmployees[0] ?? null;
  const editorEmployee = editorMode === 'edit' ? selectedEmployee : null;

  const residencias = uniqueSorted(visibleEmployees.map((employee) => employee.residencia));
  const niveles = uniqueSorted(visibleEmployees.map((employee) => employee.nivelRetributivo));

  return (
    <section className="rounded-3xl border border-metro-border bg-white p-5 shadow-card" id="plantilla">
      <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-metro-red">Módulo</p>
          <h2 className="text-2xl font-bold text-metro-text">Plantilla</h2>
          <p className="mt-1 text-sm text-metro-muted">
            Listado de personas con alta manual, edición, borrado lógico e importación Excel.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            accept=".xlsx,.xls,.csv,.tsv,.txt"
            className="hidden"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) {
                return;
              }

              await importExcel(file);
              setImportMessage(`Importación completada: ${file.name}`);
              event.target.value = '';
            }}
            ref={fileInputRef}
            type="file"
          />
          <button
            className="inline-flex items-center gap-2 rounded-xl border border-metro-border bg-white px-3 py-2 text-sm font-semibold text-metro-text hover:border-metro-red"
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            <FileUp size={16} /> Importar Excel
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-xl bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark"
            onClick={() => setEditorMode('create')}
            type="button"
          >
            <Plus size={16} /> Nuevo
          </button>
        </div>
      </div>

      {importMessage && (
        <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800">
          {importMessage}
        </div>
      )}

      <div className="mb-4 grid gap-3 rounded-2xl border border-metro-border bg-metro-surface p-3 lg:grid-cols-[1.5fr_1fr_1fr]">
        <label className="flex items-center gap-2 rounded-xl border border-metro-border bg-white px-3 py-2 text-sm text-metro-muted">
          <Search size={16} />
          <input
            className="w-full bg-transparent text-metro-text outline-none placeholder:text-metro-muted"
            onChange={(event) => setFilter('search', event.target.value)}
            placeholder="Buscar por empleado o nombre..."
            type="search"
            value={filters.search}
          />
        </label>
        <SelectFilter label="Residencia" onChange={(value) => setFilter('residencia', value)} options={residencias} value={filters.residencia} />
        <SelectFilter label="Nivel retributivo" onChange={(value) => setFilter('nivelRetributivo', value)} options={niveles} value={filters.nivelRetributivo} />
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
            <table className="min-w-full text-left text-xs">
              <thead className="bg-[#F9FAFB] text-[11px] uppercase tracking-wide text-metro-muted">
                <tr>
                  <th className="px-3 py-2">Empleado</th>
                  <th className="px-3 py-2">Nombre y apellidos</th>
                  <th className="px-3 py-2">Puesto nómina</th>
                  <th className="px-3 py-2">Residencia</th>
                  <th className="px-3 py-2">Nivel</th>
                  <th className="px-3 py-2">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-metro-border bg-white">
                {filteredEmployees.map((employee) => (
                  <tr className="hover:bg-red-50/50" key={employee.empleado}>
                    <td className="whitespace-nowrap px-3 py-2 font-semibold text-metro-text">{employee.empleado}</td>
                    <td className="min-w-[190px] px-3 py-2 text-metro-text">{employee.nombreApellidos}</td>
                    <td className="min-w-[160px] px-3 py-2 text-metro-muted">{employee.puestoNomina}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-metro-muted">{employee.residencia}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-metro-muted">{employee.nivelRetributivo}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <button
                        className="rounded-lg bg-metro-red px-3 py-1.5 text-xs font-semibold text-white hover:bg-metro-dark"
                        onClick={() => {
                          selectEmployee(employee.empleado);
                          setEditorMode('edit');
                        }}
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
        <EmployeeEditor employee={editorEmployee} mode={editorMode} onDone={() => setEditorMode('edit')} />
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
