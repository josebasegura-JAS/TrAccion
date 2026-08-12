import type { Employee } from './employee';

/**
 * Clave canónica de persona para cruces entre módulos.
 *
 * Plantilla es la fuente maestra y el nº de empleado es su identificador funcional.
 * Normalizamos variantes frecuentes de Excel ("00123", "123.0") para evitar que
 * cada módulo implemente su propio criterio de igualdad.
 */
export function normalizeEmployeeNumber(value: unknown): string {
  const trimmed = String(value ?? '')
    .trim()
    .replace(/\.0$/, '');

  if (!/^\d+$/.test(trimmed)) return trimmed;
  return trimmed.replace(/^0+(?=\d)/, '');
}

export function sameEmployeeNumber(first: unknown, second: unknown): boolean {
  const firstKey = normalizeEmployeeNumber(first);
  const secondKey = normalizeEmployeeNumber(second);
  return Boolean(firstKey && secondKey && firstKey === secondKey);
}

export function normalizeEmployeeSearch(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .trim();
}

export function findActiveEmployee(
  employees: readonly Employee[],
  employeeNumber: unknown,
): Employee | null {
  const key = normalizeEmployeeNumber(employeeNumber);
  if (!key) return null;

  return (
    employees.find(
      (employee) => !employee.deletedAt && normalizeEmployeeNumber(employee.empleado) === key,
    ) ?? null
  );
}

export function buildActiveEmployeeMap(employees: readonly Employee[]): Map<string, Employee> {
  const result = new Map<string, Employee>();

  for (const employee of employees) {
    if (employee.deletedAt) continue;
    const key = normalizeEmployeeNumber(employee.empleado);
    if (key) result.set(key, employee);
  }

  return result;
}

export function searchActiveEmployees(
  employees: readonly Employee[],
  search: unknown,
  limit = 8,
): Employee[] {
  const query = normalizeEmployeeSearch(search);
  if (!query) return [];

  return employees
    .filter((employee) => {
      if (employee.deletedAt) return false;
      return (
        normalizeEmployeeSearch(employee.nombreApellidos).includes(query) ||
        normalizeEmployeeSearch(normalizeEmployeeNumber(employee.empleado)).includes(query)
      );
    })
    .sort((first, second) =>
      normalizeEmployeeNumber(first.empleado).localeCompare(
        normalizeEmployeeNumber(second.empleado),
        'es',
        { numeric: true, sensitivity: 'base' },
      ),
    )
    .slice(0, Math.max(0, limit));
}
