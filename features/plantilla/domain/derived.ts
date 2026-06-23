import type { Employee, EmployeeDerivedFields, EmployeeDraft } from './employee';

type LegacyEmployeeDraft = Omit<EmployeeDraft, 'unidad'> & { unidad?: string };

const RESIDENCIA_EUS_MAP: Record<string, string> = {
  'Oficinas Centrales': 'Bulego Nagusiak',
  'Sopela Taller': 'Sopela Tailerra',
  'Ariz Taller': 'Ariz Tailerra',
};

export function normalizeDni(nif: string): string {
  return nif.replace(/\s+/g, '').replace(/^ES/i, '').toUpperCase();
}

export function buildResidenciaEus(residencia: string): string {
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
    residenciaEus: buildResidenciaEus(employee.residencia),
    direccionTeletrabajo: buildDireccionTeletrabajo(employee),
  };
}

export function hydrateEmployee(draft: LegacyEmployeeDraft, deletedAt: string | null = null): Employee {
  const normalizedDraft: EmployeeDraft = {
    ...draft,
    unidad: draft.unidad ?? '',
  };

  return {
    ...normalizedDraft,
    puestoEus: normalizedDraft.puestoEus ?? '',
    ...getEmployeeDerivedFields(normalizedDraft),
    deletedAt,
  };
}
