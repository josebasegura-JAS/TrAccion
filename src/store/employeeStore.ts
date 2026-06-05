import { create } from 'zustand';
import { mockEmployees } from '../data/mockEmployees';
import type { Employee } from '../types/employee';

interface EmployeeFilters {
  search: string;
  residencia: string;
  unidad: string;
  puesto: string;
  estado: string;
}

interface EmployeeState {
  employees: Employee[];
  selectedEmployeeId: string;
  filters: EmployeeFilters;
  selectEmployee: (employeeId: string) => void;
  setFilter: <K extends keyof EmployeeFilters>(key: K, value: EmployeeFilters[K]) => void;
}

export const useEmployeeStore = create<EmployeeState>((set) => ({
  employees: mockEmployees,
  selectedEmployeeId: mockEmployees[0]?.empleado ?? '',
  filters: {
    search: '',
    residencia: '',
    unidad: '',
    puesto: '',
    estado: '',
  },
  selectEmployee: (employeeId) => set({ selectedEmployeeId: employeeId }),
  setFilter: (key, value) => set((state) => ({ filters: { ...state.filters, [key]: value } })),
}));

export function filterEmployees(employees: Employee[], filters: EmployeeFilters): Employee[] {
  return employees.filter((employee) => {
    const normalizedSearch = filters.search.trim().toLowerCase();
    const matchesSearch = normalizedSearch
      ? [employee.empleado, employee.nombreApellidos, employee.nif, employee.puestoNomina]
          .join(' ')
          .toLowerCase()
          .includes(normalizedSearch)
      : true;

    return (
      matchesSearch &&
      (!filters.residencia || employee.residencia === filters.residencia) &&
      (!filters.unidad || employee.unidad === filters.unidad) &&
      (!filters.puesto || employee.puestoNomina === filters.puesto) &&
      (!filters.estado || employee.estado === filters.estado)
    );
  });
}
