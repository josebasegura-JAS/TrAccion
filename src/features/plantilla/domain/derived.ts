import type { Employee, EmployeeDerivedFields, EmployeeDraft } from './employee';

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

export function buildDireccionTeletrabajo(
  employee: Pick<EmployeeDraft, 'calle' | 'numero' | 'piso' | 'codigoPostal' | 'poblacion' | 'provincia'>,
): string {
  return [employee.calle, employee.numero, employee.piso, employee.codigoPostal, employee.poblacion, employee.provincia]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ');
}

export function getEmployeeDerivedFields(employee: EmployeeDraft): EmployeeDerivedFields {
  return {
    dni: normalizeDni(employee.nif),
    residenciaCast: employee.residencia,
    residenciaEus: translateResidenciaEus(employee.residencia),
    direccionTeletrabajo: buildDireccionTeletrabajo(employee),
  };
}

export function hydrateEmployee(draft: EmployeeDraft, deletedAt: string | null = null): Employee {
  return {
    ...draft,
    ...getEmployeeDerivedFields(draft),
    deletedAt,
  };
}
