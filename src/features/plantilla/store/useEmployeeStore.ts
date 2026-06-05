import { create } from 'zustand';
import { mockEmployees } from '../../../data/mockEmployees';
import { hydrateEmployee } from '../domain/derived';
import { EMPTY_EMPLOYEE_FILTERS, filterEmployees, type EmployeeFilters } from '../domain/filters';
import { importEmployeesFromFile } from '../domain/importExcel';
import type { Employee, EmployeeDraft } from '../domain/employee';

const STORAGE_KEY = 'traccion.v1.plantilla.employees';

interface EmployeeState {
  employees: Employee[];
  selectedEmployeeId: string;
  filters: EmployeeFilters;
  load: () => void;
  save: () => void;
  create: (draft: EmployeeDraft) => void;
  update: (empleado: string, draft: EmployeeDraft) => void;
  remove: (empleado: string) => void;
  importExcel: (file: File) => Promise<void>;
  selectEmployee: (employeeId: string) => void;
  setFilter: <K extends keyof EmployeeFilters>(key: K, value: EmployeeFilters[K]) => void;
}

function isEmployee(value: unknown): value is Employee {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<Record<keyof Employee, unknown>>;
  return typeof candidate.empleado === 'string' && typeof candidate.nombreApellidos === 'string';
}

function readEmployees(): Employee[] {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    return mockEmployees;
  }

  const parsed: unknown = JSON.parse(stored);
  if (!Array.isArray(parsed)) {
    return mockEmployees;
  }

  return parsed.filter(isEmployee).map((employee) => hydrateEmployee(employee, employee.deletedAt));
}

function persistEmployees(employees: Employee[]): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(employees));
}

function upsertEmployees(current: Employee[], drafts: EmployeeDraft[]): Employee[] {
  const employeesById = new Map(current.map((employee) => [employee.empleado, employee]));

  drafts.forEach((draft) => {
    const previous = employeesById.get(draft.empleado);
    employeesById.set(draft.empleado, hydrateEmployee(draft, previous?.deletedAt ?? null));
  });

  return Array.from(employeesById.values());
}

function firstVisibleEmployeeId(employees: Employee[]): string {
  return employees.find((employee) => !employee.deletedAt)?.empleado ?? '';
}

export const useEmployeeStore = create<EmployeeState>((set, get) => ({
  employees: mockEmployees,
  selectedEmployeeId: firstVisibleEmployeeId(mockEmployees),
  filters: EMPTY_EMPLOYEE_FILTERS,
  load: () => {
    const employees = readEmployees();
    set({ employees, selectedEmployeeId: firstVisibleEmployeeId(employees) });
  },
  save: () => persistEmployees(get().employees),
  create: (draft) => {
    set((state) => {
      const employees = upsertEmployees(state.employees, [draft]);
      persistEmployees(employees);
      return { employees, selectedEmployeeId: draft.empleado };
    });
  },
  update: (empleado, draft) => {
    set((state) => {
      const employees = state.employees.map((employee) =>
        employee.empleado === empleado ? hydrateEmployee(draft, employee.deletedAt) : employee,
      );
      persistEmployees(employees);
      return { employees, selectedEmployeeId: draft.empleado };
    });
  },
  remove: (empleado) => {
    set((state) => {
      const employees = state.employees.map((employee) =>
        employee.empleado === empleado ? { ...employee, deletedAt: new Date().toISOString() } : employee,
      );
      persistEmployees(employees);
      return { employees, selectedEmployeeId: firstVisibleEmployeeId(employees) };
    });
  },
  importExcel: async (file) => {
    const drafts = await importEmployeesFromFile(file);
    set((state) => {
      const employees = upsertEmployees(state.employees, drafts);
      persistEmployees(employees);
      return { employees, selectedEmployeeId: firstVisibleEmployeeId(employees) };
    });
  },
  selectEmployee: (employeeId) => set({ selectedEmployeeId: employeeId }),
  setFilter: (key, value) => set((state) => ({ filters: { ...state.filters, [key]: value } })),
}));

export { filterEmployees };
export type { EmployeeFilters };
