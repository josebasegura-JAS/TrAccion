import { FileUp, Plus, Search, SlidersHorizontal } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { EmployeeEditor } from './EmployeeEditor';
import type { Employee } from '../features/plantilla/domain/employee';
import { filterEmployees, useEmployeeStore } from '../features/plantilla/store/useEmployeeStore';
import { uniqueSorted } from '../features/plantilla/domain/filters';

type SortKey = 'empleado' | 'nombreApellidos' | 'puestoNomina' | 'residencia' | 'nivelRetributivo';

type SortDirection = 'asc' | 'desc';

interface SortState {
  key: SortKey;
  direction: SortDirection;
}

const sortableColumns: Array<{ key: SortKey; label: string; className: string }> = [
  { key: 'empleado', label: 'Empleado', className: 'w-[105px]' },
  { key: 'nombreApellidos', label: 'Nombre y apellidos', className: 'w-[220px]' },
  { key: 'puestoNomina', label: 'Puesto nómina', className: 'w-[210px]' },
  { key: 'residencia', label: 'Residencia', className: 'w-[130px]' },
  { key: 'nivelRetributivo', label: 'Nivel', className: 'w-[95px]' },
];

function compareEmployeeValues(first: Employee, second: Employee, key: SortKey): number {
  if (key === 'empleado') {
    const firstNumber = Number(first.empleado.trim());
    const secondNumber = Number(second.empleado.trim());

    if (Number.isFinite(firstNumber) && Number.isFinite(secondNumber)) {
      return firstNumber - secondNumber;
    }
  }

  return first[key].localeCompare(second[key], 'es', { numeric: true, sensitivity: 'base' });
}

export function PlantillaPage() {
  const { employees, filters, importExcel, load, remove, selectEmployee, setFilter } =
    useEmployeeStore();
  const [editorMode, setEditorMode] = useState<'create' | 'edit' | null>(null);
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [sortState, setSortState] = useState<SortState>({ key: 'empleado', direction: 'asc' });
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
  const sortedEmployees = useMemo(() => {
    return filteredEmployees
      .map((employee, index) => ({ employee, index }))
      .sort((first, second) => {
        const comparison = compareEmployeeValues(first.employee, second.employee, sortState.key);
        const directedComparison = sortState.direction === 'asc' ? comparison : -comparison;

        return directedComparison || first.index - second.index;
      })
      .map(({ employee }) => employee);
  }, [filteredEmployees, sortState]);

  const editorEmployee =
    editorMode === 'edit'
      ? (visibleEmployees.find((employee) => employee.empleado === editingEmployeeId) ?? null)
      : null;

  const openEditor = (employee: Employee) => {
    selectEmployee(employee.empleado);
    setEditingEmployeeId(employee.empleado);
    setEditorMode('edit');
  };

  const openCreateEditor = () => {
    setEditingEmployeeId(null);
    setEditorMode('create');
  };

  const closeEditor = () => {
    setEditorMode(null);
    setEditingEmployeeId(null);
  };

  const toggleSort = (key: SortKey) => {
    setSortState((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const residencias = uniqueSorted(visibleEmployees.map((employee) => employee.residencia));
  const niveles = uniqueSorted(visibleEmployees.map((employee) => employee.nivelRetributivo));

  return (
    <section
      className="rounded-2xl border border-metro-border bg-metro-surface p-4 shadow-card"
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
            className="inline-flex items-center gap-2 rounded-xl border border-metro-border bg-metro-surface px-3 py-2 text-sm font-semibold text-metro-text hover:border-metro-red"
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            <FileUp size={16} /> Importar
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-xl bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark"
            onClick={openCreateEditor}
            type="button"
          >
            <Plus size={16} /> Nueva persona
          </button>
        </div>
      </div>

      {importMessage && (
        <div className="mb-3 rounded-xl border border-metro-success/30 bg-metro-success/10 px-3 py-2 text-sm font-semibold text-emerald-200">
          {importMessage}
        </div>
      )}

      <div className="mb-3 grid gap-2 rounded-xl border border-metro-border bg-metro-panel p-2 lg:grid-cols-[minmax(220px,1.2fr)_minmax(150px,0.8fr)_minmax(150px,0.8fr)]">
        <label className="flex items-center gap-2 rounded-lg border border-metro-border bg-metro-surface px-3 py-1.5 text-sm text-metro-muted">
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

      <div className="overflow-hidden rounded-xl border border-metro-border">
        <div className="flex items-center justify-between border-b border-metro-border bg-metro-surface px-3 py-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-metro-text">
            <SlidersHorizontal size={16} className="text-metro-red" /> Personas en plantilla
          </div>
          <span className="rounded-full bg-metro-red/10 px-3 py-1 text-xs font-bold text-red-200">
            {filteredEmployees.length} registros
          </span>
        </div>
        <div className="max-h-[460px] overflow-auto">
          <table className="w-full table-fixed text-left text-xs">
            <thead className="sticky top-0 z-10 bg-metro-panel text-[11px] uppercase tracking-wide text-metro-muted">
              <tr>
                {sortableColumns.map((column) => {
                  const isActive = sortState.key === column.key;

                  return (
                    <th className={`${column.className} px-3 py-2`} key={column.key}>
                      <button
                        className="flex w-full items-center gap-1 text-left font-bold uppercase tracking-wide hover:text-metro-text"
                        onClick={() => toggleSort(column.key)}
                        type="button"
                      >
                        <span>{column.label}</span>
                        {isActive && <span>{sortState.direction === 'asc' ? '↑' : '↓'}</span>}
                      </button>
                    </th>
                  );
                })}
                <th className="w-[100px] px-3 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-metro-border bg-metro-surface">
              {sortedEmployees.map((employee) => (
                <tr
                  className="cursor-pointer hover:bg-metro-red/10"
                  key={employee.empleado}
                  onClick={() => openEditor(employee)}
                >
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
                  <td className="truncate px-3 py-1.5 text-metro-muted" title={employee.residencia}>
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
                      onClick={(event) => {
                        event.stopPropagation();
                        remove(employee.empleado);
                      }}
                      type="button"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editorMode && (
        <EmployeeEditor employee={editorEmployee} mode={editorMode} onDone={closeEditor} />
      )}
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
      className="rounded-lg border border-metro-border bg-metro-surface px-3 py-1.5 text-sm text-metro-text outline-none focus:border-metro-red"
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
