import type { Employee, EmployeeDerivedFields } from '../types/employee';

const RESIDENCIA_EUS_MAP: Record<string, string> = {
  'Oficinas Centrales': 'Bulego Nagusiak',
  'Sopela Taller': 'Sopela Tailerra',
  'Ariz Taller': 'Ariz Tailerra',
};

export function normalizeDni(nif: string): string {
  return nif.replace(/\s+/g, '').replace(/^ES/i, '').toUpperCase();
}

export function translateResidenciaEus(residencia: string): string {
  return RESIDENCIA_EUS_MAP[residencia] ?? residencia;
}

export function buildDireccionTeletrabajo(employee: Pick<Employee, 'calle' | 'numero' | 'piso' | 'codigoPostal' | 'poblacion' | 'provincia'>): string {
  const street = [employee.calle, employee.numero].filter(Boolean).join(' ');
  const postalTown = [employee.codigoPostal, employee.poblacion].filter(Boolean).join(' ');

  return [street, employee.piso, postalTown, employee.provincia]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(', ');
}

export function getEmployeeDerivedFields(employee: Employee): EmployeeDerivedFields {
  return {
    residenciaCast: employee.residencia,
    residenciaEus: translateResidenciaEus(employee.residencia),
    dni: normalizeDni(employee.nif),
    direccionTeletrabajo: buildDireccionTeletrabajo(employee),
  };
}
