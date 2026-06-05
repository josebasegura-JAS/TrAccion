import type { Employee } from './employee';

export interface EmployeeFilters {
  search: string;
  residencia: string;
  nivelRetributivo: string;
}

export const EMPTY_EMPLOYEE_FILTERS: EmployeeFilters = {
  search: '',
  residencia: '',
  nivelRetributivo: '',
};

export function filterEmployees(employees: Employee[], filters: EmployeeFilters): Employee[] {
  const normalizedSearch = filters.search.trim().toLowerCase();

  return employees.filter((employee) => {
    const matchesSearch = normalizedSearch
      ? [employee.empleado, employee.nombreApellidos].join(' ').toLowerCase().includes(normalizedSearch)
      : true;

    return (
      !employee.deletedAt &&
      matchesSearch &&
      (!filters.residencia || employee.residencia === filters.residencia) &&
      (!filters.nivelRetributivo || employee.nivelRetributivo === filters.nivelRetributivo)
    );
  });
}

export function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}
