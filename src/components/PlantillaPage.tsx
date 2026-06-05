import { FileUp, Plus, Search, SlidersHorizontal } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { EmployeeEditor } from './EmployeeEditor';
import { filterEmployees, useEmployeeStore } from '../features/plantilla/store/useEmployeeStore';
import { uniqueSorted } from '../features/plantilla/domain/filters';

export function PlantillaPage() {
  const { employees, filters, selectedEmployeeId, importExcel, load, selectEmployee, setFilter } =
    useEmployeeStore();
  const [editorMode, setEditorMode] = useState<'create' | 'edit'>('edit');
  const [importMessage, setImportMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    load();
  }, [load]);

  const visibleEmployees = useMemo(
    () => employees.filter((employee) => !employee.deletedAt),
    [employees],
  );
  const filteredEmployees = useMemo(
    () => filterEmployees(employees, filters),
    [employees, filters],
  );
  const selectedEmployee =
    visibleEmployees.find((employee) => employee.empleado === selectedEmployeeId) ??
    visibleEmployees[0] ??
    null;
  const editorEmployee = editorMode === 'edit' ? selectedEmployee : null;

  const residencias = uniqueSorted(visibleEmployees.map((employee) => employee.residencia));
  const niveles = uniqueSorted(visibleEmployees.map((employee) => employee.nivelRetributivo));

  return (
    <section
      className="rounded-2xl border border-metro-border bg-white p-4 shadow-card"
      id="plantilla"
    >
      <div className="mb-3 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-metro-red">Módulo</p>
          <h2 className="text-xl font-bold text-metro-text">Plantilla</h2>
          <p className="mt-0.5 text-sm text-metro-muted">
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
            <FileUp size={16} /> Importar
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-xl bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark"
            onClick={() => setEditorMode('create')}
            type="button"
          >
            <Plus size={16} /> Nueva persona
          </button>
        </div>
      </div>

      {importMessage && (
        <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
          {importMessage}
        </div>
      )}

      <div className="mb-3 grid gap-2 rounded-xl border border-metro-border bg-metro-surface p-2 lg:grid-cols-[minmax(220px,1.2fr)_minmax(150px,0.8fr)_minmax(150px,0.8fr)]">
        <label className="flex items-center gap-2 rounded-lg border border-metro-border bg-white px-3 py-1.5 text-sm text-metro-muted">
          <Search size={16} />
          <input
            className="w-full bg-transparent text-metro-text outline-none placeholder:text-metro-muted"
            onChange={(event) => setFilter('search', event.target.value)}
            placeholder="Buscar por empleado o nombre..."
            type="search"
            value={filters.search}
          />
        </label>
        <SelectFilter
          label="Residencia"
          onChange={(value) => setFilter('residencia', value)}
          options={residencias}
          value={filters.residencia}
        />
        <SelectFilter
          label="Nivel retributivo"
          onChange={(value) => setFilter('nivelRetributivo', value)}
          options={niveles}
          value={filters.nivelRetributivo}
        />
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="overflow-hidden rounded-xl border border-metro-border">
          <div className="flex items-center justify-between border-b border-metro-border bg-white px-3 py-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-metro-text">
              <SlidersHorizontal size={16} className="text-metro-red" /> Personas en plantilla
            </div>
            <span className="rounded-full bg-metro-red/10 px-3 py-1 text-xs font-bold text-metro-dark">
              {filteredEmployees.length} registros
            </span>
          </div>
          <div className="max-h-[460px] overflow-auto">
            <table className="min-w-[860px] table-fixed text-left text-xs">
              <thead className="sticky top-0 z-10 bg-[#F9FAFB] text-[11px] uppercase tracking-wide text-metro-muted">
                <tr>
                  <th className="w-[105px] px-3 py-2">Empleado</th>
                  <th className="w-[220px] px-3 py-2">Nombre y apellidos</th>
                  <th className="w-[210px] px-3 py-2">Puesto nómina</th>
                  <th className="w-[130px] px-3 py-2">Residencia</th>
                  <th className="w-[95px] px-3 py-2">Nivel</th>
                  <th className="w-[100px] px-3 py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-metro-border bg-white">
                {filteredEmployees.map((employee) => (
                  <tr className="hover:bg-red-50/50" key={employee.empleado}>
                    <td
                      className="truncate px-3 py-1.5 font-semibold text-metro-text"
                      title={employee.empleado}
                    >
                      {employee.empleado}
                    </td>
                    <td
                      className="truncate px-3 py-1.5 text-metro-text"
                      title={employee.nombreApellidos}
                    >
                      {employee.nombreApellidos}
                    </td>
                    <td
                      className="truncate px-3 py-1.5 text-metro-muted"
                      title={employee.puestoNomina}
                    >
                      {employee.puestoNomina}
                    </td>
                    <td
                      className="truncate px-3 py-1.5 text-metro-muted"
                      title={employee.residencia}
                    >
                      {employee.residencia}
                    </td>
                    <td
                      className="truncate px-3 py-1.5 text-metro-muted"
                      title={employee.nivelRetributivo}
                    >
                      {employee.nivelRetributivo}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right">
                      <button
                        className="rounded-lg bg-metro-red px-2.5 py-1 text-xs font-semibold text-white hover:bg-metro-dark"
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
        <EmployeeEditor
          employee={editorEmployee}
          mode={editorMode}
          onDone={() => setEditorMode('edit')}
        />
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
      className="rounded-lg border border-metro-border bg-white px-3 py-1.5 text-sm text-metro-text outline-none focus:border-metro-red"
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
