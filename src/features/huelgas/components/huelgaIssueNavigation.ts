import type { HuelgaZoneResponse } from './huelgasResponseCollection';
import type { HuelgaValidationIssue } from './huelgasResponseValidation';

export type HuelgaIssueTarget =
  | 'source'
  | 'personasTurno'
  | 'serviciosMinimos'
  | 'personasTrabajan'
  | 'personasHuelga'
  | 'detail'
  | 'huelguistas'
  | 'circuit';

export type HuelgaIssueNavigation = {
  zoneId: string | null;
  target: HuelgaIssueTarget;
  employee?: string;
};

function normalized(message: string): string {
  return message
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-ES');
}

function targetForMessage(message: string): HuelgaIssueTarget {
  const text = normalized(message);
  if (text.includes('excel de respuesta') || text.includes('circuito del fichero')) return 'source';
  if (text.includes('personas con turno') || text.includes('con turno')) return 'personasTurno';
  if (text.includes('desglose') || text.includes('turno') || text.includes('colectivo')) return 'detail';
  if (text.includes('listado nominal') || text.includes('huelguista') || text.includes('nº de empleado') || text.includes('empleado')) return 'huelguistas';
  if (text.includes('servicios minimos') || text.includes('ss.mm')) return 'serviciosMinimos';
  if (text.includes('personas que trabajan') || text.includes('trabajan')) return 'personasTrabajan';
  if (text.includes('personas en huelga') || text.includes('en huelga')) return 'personasHuelga';
  return 'circuit';
}

function zoneForEmployee(employee: string | undefined, responses: HuelgaZoneResponse[]): string | null {
  if (!employee) return null;
  const needle = employee.replace(/\s+/g, '').toLocaleLowerCase('es-ES');
  const match = responses.find((response) => response.huelguistas.some((person) =>
    person.empleado.replace(/\s+/g, '').toLocaleLowerCase('es-ES') === needle,
  ));
  return match?.zonaId ?? null;
}

export function resolveHuelgaIssueNavigation(
  issue: HuelgaValidationIssue,
  responses: HuelgaZoneResponse[],
): HuelgaIssueNavigation {
  return {
    zoneId: issue.zonaId ?? zoneForEmployee(issue.empleado, responses),
    target: targetForMessage(issue.message),
    employee: issue.empleado,
  };
}
